import "server-only";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { AiClip, AiClipMode, VideoPlan } from "@/lib/types/video-production";
import { aiSourceId, isAiSource } from "@/lib/types/video-production";
import { AI_CLIP_CONFIG, VIDEO_RENDER_CONFIG } from "@/lib/video-production/config";
import { serverConfig } from "../config";
import { AppError } from "../http";
import { getAIProvider, getVideoAIProvider } from "../providers/registry";
import { VideoAIError } from "../providers/video-ai/kie";
import { getCurrentUserId, getRepositories } from "../repositories";
import { safeFetch } from "../security/safe-url";
import { mediaDuration, runFfmpeg } from "./ffmpeg";

/**
 * AI 컷 (v0.9.60, Kie AI). docs/VIDEO_PRODUCTION.md
 * - [AI 컷 만들기] 1번 = 아직 안 만든 컷 수만큼 Kie 작업 (컷 1개 = 1회 과금). 자동 재시도 없음, 같은 요청 동시 1번
 * - 만들기 전에 AI 1회로 장면 설명을 영어 프롬프트로 바꾼다 (실패하면 규칙으로)
 * - 제품 사진 → 9:16 사진(흐린 배경 + 가운데 제품)으로 만들어 Kie 에 올린다 (Kie 가 24시간 뒤 지움). 사진은 그 제품의 사진만
 * - 상태 확인은 무료 (recordInfo). 결과 영상은 Kie 에 14일 — 렌더할 때 taskId 로 다시 주소를 받아 임시 폴더에 받고 지운다
 */
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const inFlight = new Map<string, Promise<unknown>>();

const CLIP_ID = /^ai\d{1,2}$/;
const TASK_ID = /^[\w-]{4,100}$/;

/** 제품 사진 (대표 사진 + 수집한 상세 사진, https 만, 최대 8장) */
export async function productImages(productId: string | null, userId: string): Promise<string[]> {
  if (!productId) return [];
  const repo = getRepositories();
  const product = await repo.products.get(productId);
  if (!product || product.userId !== userId) return [];
  const sources = await repo.productSources.list((s) => s.productId === productId).catch(() => []);
  const all = [product.imageUrl, ...sources.flatMap((s) => s.raw?.imageUrls ?? [])].filter((u): u is string => typeof u === "string" && /^https:\/\//.test(u));
  return [...new Set(all)].slice(0, 8);
}

/** 기본 AI 컷: 제품 사진이 있으면 제품 → 장면 → 제품 … 순으로 */
export function defaultClips(count: number, opts: { productName: string | null; images: string[]; narrations: string[] }): AiClip[] {
  const n = Math.max(1, Math.min(AI_CLIP_CONFIG.maxCount, Math.round(count) || AI_CLIP_CONFIG.defaultCount));
  const name = opts.productName ?? "제품";
  return Array.from({ length: n }, (_, i) => {
    const mode: AiClipMode = opts.images.length && i % 2 === 0 ? "product" : "text";
    const line = opts.narrations[Math.round((i * Math.max(0, opts.narrations.length - 1)) / Math.max(1, n - 1))] ?? "";
    return {
      id: `ai${i + 1}`,
      mode,
      prompt: mode === "product" ? `사람이 ${name}을(를) 직접 손에 들고 사용하는 모습, 자연스러운 손동작, 밝은 집 안, 제품이 잘 보이게` : `${name}을(를) 쓰는 생활 장면 — ${line.replace(/[?!.]+$/, "") || "사용 전후"}, 밝고 깔끔한 집 안, 사람이 자연스럽게 움직임`,
      imageUrl: mode === "product" ? opts.images[Math.floor(i / 2) % opts.images.length] : null,
      taskId: null,
      state: "draft",
      model: null,
      credits: null,
      error: null,
    };
  });
}

/** AI 컷을 컷 계획에 고르게 배치: 고정하지 않은 컷 중 고르게 n 개 (AI만이면 모든 컷을 돌아가며) */
export function placeClips(plan: VideoPlan, clips: AiClip[], aiOnly: boolean): VideoPlan["scenes"] {
  const ids = clips.map((c) => aiSourceId(c.id));
  if (!ids.length) return plan.scenes;
  if (aiOnly) return plan.scenes.map((s, i) => (s.pinned && isAiSource(s.sourceVideoId) ? s : { ...s, sourceVideoId: ids[i % ids.length] }));
  const n = plan.scenes.length;
  const at = new Map<number, string>();
  ids.forEach((id, k) => at.set(Math.min(n - 1, Math.round(((k + 0.5) * n) / ids.length)), id));
  return plan.scenes.map((s, i) => (at.has(i) ? { ...s, sourceVideoId: at.get(i)!, pinned: true } : s));
}

/** 사용자가 보낸 AI 컷을 믿지 않고 정리 */
export function sanitizeClips(raw: unknown, allowedImages: Set<string>): AiClip[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw
    .slice(0, AI_CLIP_CONFIG.maxCount)
    .map((c: Partial<AiClip>): AiClip | null => {
      const id = String(c?.id ?? "");
      if (!CLIP_ID.test(id) || seen.has(id)) return null;
      seen.add(id);
      const mode: AiClipMode = c.mode === "product" ? "product" : "text";
      const imageUrl = mode === "product" && typeof c.imageUrl === "string" && allowedImages.has(c.imageUrl) ? c.imageUrl : null;
      const taskId = typeof c.taskId === "string" && TASK_ID.test(c.taskId) ? c.taskId : null;
      const state = taskId && ["waiting", "generating", "success", "fail"].includes(String(c.state)) ? (c.state as AiClip["state"]) : "draft";
      return {
        id,
        mode,
        prompt: String(c.prompt ?? "").replace(/\s+/g, " ").trim().slice(0, 500),
        imageUrl,
        taskId,
        state,
        model: typeof c.model === "string" ? c.model.slice(0, 80) : null,
        credits: typeof c.credits === "number" && Number.isFinite(c.credits) ? c.credits : null,
        error: typeof c.error === "string" ? c.error.slice(0, 200) : null,
      };
    })
    .filter((c): c is AiClip => Boolean(c));
}

/** 제품 사진 → 9:16 JPEG (흐린 배경 + 가운데 제품) */
export async function portraitImage(url: string): Promise<Buffer> {
  const res = await safeFetch(url, { signal: AbortSignal.timeout(20_000), headers: { "User-Agent": BROWSER_UA, Accept: "image/*" } });
  if (!res.ok) throw new AppError("AI_CLIP_IMAGE", `제품 사진을 받지 못했습니다 (HTTP ${res.status}).`, 502);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_IMAGE_BYTES) throw new AppError("AI_CLIP_IMAGE", "제품 사진이 너무 큽니다 (10MB 초과).", 400);
  const img = await loadImage(buf);
  const W = AI_CLIP_CONFIG.imageWidth;
  const H = AI_CLIP_CONFIG.imageHeight;
  const c = createCanvas(W, H);
  const ctx = c.getContext("2d");
  // 배경: 꽉 채운 뒤 흐리게
  const cover = Math.max(W / img.width, H / img.height);
  ctx.filter = "blur(36px)";
  ctx.drawImage(img, (W - img.width * cover) / 2, (H - img.height * cover) / 2, img.width * cover, img.height * cover);
  ctx.filter = "none";
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(0, 0, W, H);
  // 가운데: 비율 그대로 (가로 92%)
  const fit = Math.min((W * 0.92) / img.width, (H * 0.7) / img.height);
  const w = img.width * fit;
  const h = img.height * fit;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  return c.toBuffer("image/jpeg", 90);
}

/** 장면 설명 → 영어 프롬프트 (AI 1회, 실패하면 규칙으로) */
async function englishPrompts(clips: AiClip[], productName: string | null): Promise<{ prompts: Map<string, string>; aiCalls: number }> {
  const rule = (c: AiClip) =>
    c.mode === "product"
      ? `Vertical 9:16 smartphone video. A person naturally using ${productName ?? "the product"} shown in the image, realistic hands, bright home interior, smooth camera motion, product clearly visible, no text, no subtitles. ${c.prompt}`
      : `Vertical 9:16 short-form video scene, realistic, bright natural light, smooth camera motion, no text, no subtitles. ${c.prompt}`;
  const fallback = new Map(clips.map((c) => [c.id, rule(c)]));
  try {
    const ai = await getAIProvider();
    const { data } = await ai.generateStructured<{ prompts?: { id?: string; prompt?: string }[] }>({
      task: "video-ai-clip-prompt",
      messages: [
        { role: "system", content: "You write prompts for AI video models (Wan, Seedance). Output concise English prompts (40-80 words) for vertical 9:16 short clips. Never ask for on-screen text, captions, logos or watermarks." },
        {
          role: "user",
          content: [
            productName ? `[Product] ${productName}` : "",
            "For each clip, rewrite the Korean description into one English video prompt.",
            "mode=product: the input image shows the product; describe a person using it naturally with realistic hands and motion, keep the product's look unchanged.",
            "mode=text: describe a realistic lifestyle scene matching the description.",
            ...clips.map((c) => `- id=${c.id} mode=${c.mode}: ${c.prompt}`),
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      outputKeys: ["prompts"],
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["prompts"],
        properties: {
          prompts: {
            type: "array",
            items: { type: "object", additionalProperties: false, required: ["id", "prompt"], properties: { id: { type: "string" }, prompt: { type: "string" } } },
          },
        },
      },
      variables: { clips: clips.map((c) => ({ id: c.id, mode: c.mode, prompt: c.prompt })), productName },
    });
    const out = new Map(fallback);
    for (const p of Array.isArray(data.prompts) ? data.prompts : []) {
      const id = String(p?.id ?? "");
      const text = String(p?.prompt ?? "").trim();
      if (out.has(id) && text.length > 10) out.set(id, `${text} Vertical 9:16, no text, no subtitles.`);
    }
    return { prompts: out, aiCalls: 1 };
  } catch {
    return { prompts: fallback, aiCalls: 0 };
  }
}

async function ownPlanContext(plan: VideoPlan | undefined): Promise<{ userId: string; productName: string | null; images: string[] }> {
  const userId = await getCurrentUserId();
  if (!plan?.contentId) throw new AppError("VALIDATION", "컷 계획이 없습니다.");
  const content = await getRepositories().contents.get(String(plan.contentId));
  if (!content || content.userId !== userId) throw new AppError("NOT_FOUND", "대본을 찾을 수 없습니다.", 404);
  return { userId, productName: content.context.product?.name ?? null, images: await productImages(content.productId, userId) };
}

function errorText(e: unknown): string {
  if (e instanceof VideoAIError || e instanceof AppError) return e.message;
  return "AI 컷을 만들지 못했습니다.";
}

export const aiClipService = {
  /** [AI 컷 만들기]: 아직 안 만든(또는 실패한) 컷만 Kie 작업으로. 컷 1개 = 1회 과금 */
  async generate(input: { plan?: VideoPlan; clientRequestId?: unknown }): Promise<{ clips: AiClip[]; created: number; aiCalls: number }> {
    const ctx = await ownPlanContext(input.plan);
    const provider = await getVideoAIProvider();
    if (!provider) throw new AppError("KIE_NOT_CONNECTED", "Kie AI 가 연결되어 있지 않습니다. 설정 › API 연결 센터에서 Kie AI 키를 넣어 주세요.", 409);
    const clips = sanitizeClips(input.plan?.aiClips, new Set(ctx.images));
    const todo = clips.filter((c) => !c.taskId || c.state === "fail");
    if (!todo.length) return { clips, created: 0, aiCalls: 0 };
    const bad = todo.find((c) => c.mode === "product" && !c.imageUrl);
    if (bad) throw new AppError("VALIDATION", `AI 컷 ${bad.id.slice(2)}: 제품 사진을 골라 주세요 (이 제품의 사진이 없으면 '장면'으로 바꿔 주세요).`);
    const key = `${ctx.userId}:${String(input.clientRequestId ?? "")}`;
    const running = inFlight.get(key) as Promise<{ clips: AiClip[]; created: number; aiCalls: number }> | undefined;
    if (running) return running;
    const p = (async () => {
      const { prompts, aiCalls } = await englishPrompts(todo, ctx.productName);
      let created = 0;
      // 한 번에 하나씩 (Kie 한도: 10초에 20개) — 실패한 컷은 그 이유를 남기고 다음 컷으로 (다시 부르지 않음)
      for (const c of todo) {
        try {
          const prompt = prompts.get(c.id) ?? c.prompt;
          const r = c.mode === "product" ? await provider.createProductClip({ prompt, image: await portraitImage(c.imageUrl!) }) : await provider.createTextClip({ prompt });
          Object.assign(c, { taskId: r.taskId, model: r.model, state: "waiting", error: null, credits: null });
          created++;
          console.info("[KieClip]", JSON.stringify({ clientRequestId: String(input.clientRequestId ?? "-").slice(0, 40), clip: c.id, mode: c.mode, model: r.model, taskId: r.taskId }));
        } catch (e) {
          Object.assign(c, { state: "fail", error: errorText(e), taskId: null });
          console.warn("[KieClip] fail", JSON.stringify({ clip: c.id, mode: c.mode, error: errorText(e).slice(0, 160) }));
          // 키·잔액 문제면 나머지도 같은 이유로 실패하니 멈춘다
          if (e instanceof VideoAIError && (e.code === "AUTH" || e.code === "PAYMENT")) break;
        }
      }
      return { clips, created, aiCalls };
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, p);
    return p;
  },

  /** 상태 확인 (무료): 만드는 중인 컷만 */
  async status(input: { clips?: unknown }): Promise<{ clips: AiClip[] }> {
    await getCurrentUserId();
    const provider = await getVideoAIProvider();
    if (!provider) throw new AppError("KIE_NOT_CONNECTED", "Kie AI 가 연결되어 있지 않습니다.", 409);
    // 사진 주소는 상태 확인에 쓰지 않으므로 그대로 둔다
    const raw = Array.isArray(input.clips) ? (input.clips as AiClip[]) : [];
    const clips = sanitizeClips(raw, new Set(raw.map((c) => String(c?.imageUrl ?? ""))));
    for (const c of clips) {
      if (!c.taskId || (c.state !== "waiting" && c.state !== "generating")) continue;
      try {
        const s = await provider.status(c.taskId);
        Object.assign(c, { state: s.state, credits: s.credits ?? c.credits, error: s.error });
      } catch (e) {
        c.error = errorText(e);
      }
    }
    return { clips };
  },

  /** 렌더: 이 계획에서 쓰는 AI 컷 영상을 임시 폴더에 받는다 (taskId 로 주소를 새로 받는다 — 화면이 보낸 주소를 믿지 않음) */
  async download(plan: VideoPlan, dir: string, issues: string[]): Promise<Map<string, { file: string; duration: number; title: string }>> {
    const out = new Map<string, { file: string; duration: number; title: string }>();
    const used = new Set(plan.scenes.map((s) => s.sourceVideoId).filter(isAiSource));
    const clips = (plan.aiClips ?? []).filter((c) => used.has(aiSourceId(c.id)) && c.taskId);
    if (!clips.length) return out;
    const provider = await getVideoAIProvider();
    for (const [k, c] of clips.entries()) {
      const file = path.join(dir, `ai${k}.mp4`);
      const title = `AI 컷 ${c.id.slice(2)}`;
      try {
        if (serverConfig.providerMode !== "live") {
          // 데모: 시험 영상 (5초)
          await runFfmpeg(["-f", "lavfi", "-i", `testsrc=size=720x1280:rate=30:duration=5`, "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", file], 60_000);
          out.set(aiSourceId(c.id), { file, duration: 5, title });
          continue;
        }
        if (!provider) throw new Error("Kie AI 연결이 없습니다");
        const s = await provider.status(c.taskId!);
        if (s.state !== "success" || !s.resultUrl) throw new Error(s.error ?? "아직 만들어지지 않았습니다");
        const res = await safeFetch(s.resultUrl, { signal: AbortSignal.timeout(60_000), headers: { "User-Agent": BROWSER_UA } });
        if (!res.ok) throw new Error(`결과 영상 HTTP ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > VIDEO_RENDER_CONFIG.maxSourceBytes) throw new Error("결과 영상이 너무 큽니다");
        await writeFile(file, buf);
        const duration = await mediaDuration(file);
        if (duration < 1) throw new Error("영상 길이를 읽지 못했습니다");
        out.set(aiSourceId(c.id), { file, duration, title });
      } catch (e) {
        issues.push(`${title}을(를) 쓰지 못했습니다 (${e instanceof Error ? e.message : String(e)}). 그 컷은 다른 영상으로 채웠습니다.`);
      }
    }
    return out;
  },
};
