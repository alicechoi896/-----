import "server-only";
import { createCanvas } from "@napi-rs/canvas";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { CLIP_CONCEPTS, approvedOf, categoryEn, fashionMusicPrompt, feedLookPrompt, lookPrompt, lookRefItems, modelPrompt, newFashionId } from "@/lib/fashion/prompts";
import { feedFormatOf, flatPrompt, reelFormatOf, unboxPrompt } from "@/lib/fashion/formats";
import type { FashionImage, FashionLook, FashionProject, FashionTask } from "@/lib/fashion/types";
import { AppError } from "../http";
import { getVideoAIProvider } from "../providers/registry";
import { VideoAIError, type VideoAIProvider } from "../providers/video-ai/kie";
import { safeFetch } from "../security/safe-url";
import { runFfmpeg } from "../video/ffmpeg";
import { videoStorage } from "../video/storage";
import { fashionDir } from "./store";

/**
 * Kie 작업 (v0.9.103): 이미지 = Nano Banana(Edit), 음악 = Suno V6.
 * 작업 1개 = Kie 1회 과금. 확인 창을 거친 요청만, 같은 요청 번호는 다시 만들지 않고, 자동 재시도 없음.
 */
export const IMAGE_CREDITS = 4;
const MAX_TASKS = 12;
const inFlight = new Map<string, Promise<FashionTask[]>>();
const now = () => new Date().toISOString();
const errorText = (e: unknown) => (e instanceof VideoAIError || e instanceof AppError ? e.message : "만들지 못했습니다.");

async function provider(): Promise<VideoAIProvider> {
  const p = await getVideoAIProvider();
  if (!p) throw new AppError("KIE_NOT_CONNECTED", "Kie AI 가 연결되어 있지 않습니다. 설정 › API 연결 센터에서 Kie AI 키를 넣어 주세요.", 409);
  return p;
}

function baseTask(over: Pick<FashionTask, "kind" | "target" | "modelId" | "prompt" | "requestId">): FashionTask {
  const t = now();
  return { id: newFashionId("ft"), request: {}, status: "queued", externalTaskId: null, storedKey: null, error: null, credits: null, createdAt: t, updatedAt: t, ...over };
}

async function submit(prov: VideoAIProvider, tasks: FashionTask[], model: (t: FashionTask) => string, input: (t: FashionTask) => Promise<Record<string, unknown>>): Promise<void> {
  let stop: string | null = null;
  for (const t of tasks) {
    if (stop) {
      Object.assign(t, { status: "fail", error: stop, updatedAt: now() });
      continue;
    }
    try {
      t.status = "requesting";
      const body = await input(t);
      const r = await prov.createTask(model(t), body);
      Object.assign(t, { externalTaskId: r.taskId, status: "generating", updatedAt: now() });
      console.info("[Fashion]", JSON.stringify({ task: t.id, kind: t.kind, model: t.modelId, requestId: t.requestId.slice(0, 40), externalTaskId: r.taskId }));
    } catch (e) {
      Object.assign(t, { status: "fail", error: errorText(e), updatedAt: now() });
      if (e instanceof VideoAIError && (e.code === "AUTH" || e.code === "PAYMENT")) stop = errorText(e);
    }
  }
}

export interface FashionImageJob {
  target: { type: "model" } | { type: "look"; lookId: string } | { type: "feedlook"; lookId: string } | { type: "flatlook"; lookId: string } | { type: "unboxlook"; lookId: string };
}

/** v0.9.181 언박싱 컷에 쓸 대표 제품 (원피스·아우터·상의 순) */
const unboxItem = (p: FashionProject, look: FashionLook) => {
  const items = lookRefItems(p, look);
  return items.find((i) => i.category === "dress") ?? items.find((i) => i.category === "outer") ?? items.find((i) => i.category === "top") ?? items[0];
};

/** 이미지 작업 계획 (Kie 호출 전 — 비용 확인 창의 장수와 같다) */
export function planFashionImages(p: FashionProject, jobs: FashionImageJob[], requestId: string): FashionTask[] {
  const out: FashionTask[] = [];
  for (const j of jobs.slice(0, MAX_TASKS)) {
    if (j.target.type === "model") {
      if (p.model.mode === "photo" && !p.model.photoKey) throw new AppError("VALIDATION", "참고할 실제 사진을 먼저 올려 주세요 (또는 'AI 모델'로 바꾸기).");
      out.push(baseTask({ kind: "image", target: { type: "model" }, modelId: p.model.mode === "photo" ? "nano-banana-edit" : "nano-banana", prompt: modelPrompt(p.model, { character: reelFormatOf(p.settings.format).character }), requestId }));
    } else if (j.target.type === "flatlook" || j.target.type === "unboxlook") {
      // v0.9.181 플랫레이·벽에 건 코디 (제품 사진만) / 언박싱 컷 (대표 제품 1장)
      const lookId = j.target.lookId;
      const look = p.looks.find((l) => l.id === lookId);
      if (!look) throw new AppError("VALIDATION", "룩을 찾지 못했습니다.");
      const refs = lookRefItems(p, look);
      if (!refs.length) throw new AppError("VALIDATION", `${look.name}에 사진이 있는 상품을 넣어 주세요 (제품 사진으로 만듭니다).`);
      const prompt =
        j.target.type === "flatlook"
          ? flatPrompt(feedFormatOf(p.settings.feedFormat).image === "hanging" ? "hanging" : "flat", refs.map((it) => ({ category: categoryEn(it.category), name: it.name })), p.settings.theme)
          : unboxPrompt({ category: categoryEn(unboxItem(p, look)!.category), name: unboxItem(p, look)!.name });
      out.push(baseTask({ kind: "image", target: { type: j.target.type, lookId }, modelId: "nano-banana-edit", prompt, requestId }));
    } else if (j.target.type === "feedlook") {
      // v0.9.171 피드 카드용 (승인한 룩 이미지 → 배경만 밝은 무지)
      const lookId = j.target.lookId;
      const look = p.looks.find((l) => l.id === lookId);
      if (!look || !approvedOf(look.images)) throw new AppError("VALIDATION", "④ 룩 이미지를 먼저 승인해 주세요 (피드용은 그 이미지로 만듭니다).");
      out.push(baseTask({ kind: "image", target: { type: "feedlook", lookId }, modelId: "nano-banana-edit", prompt: feedLookPrompt(), requestId }));
    } else {
      const lookId = j.target.lookId;
      const look = p.looks.find((l) => l.id === lookId);
      if (!look) throw new AppError("VALIDATION", "룩을 찾지 못했습니다.");
      if (!look.itemIds.length) throw new AppError("VALIDATION", `${look.name}에 상품을 1개 이상 넣어 주세요.`);
      const model = approvedOf(p.model.images);
      if (!model) throw new AppError("VALIDATION", "② 모델에서 기준 이미지를 먼저 승인해 주세요 (모든 룩의 얼굴 기준).");
      const refItems = lookRefItems(p, look);
      out.push(baseTask({ kind: "image", target: { type: "look", lookId }, modelId: "nano-banana-edit", prompt: lookPrompt(p, look, refItems, true), requestId }));
    }
  }
  if (!out.length) throw new AppError("VALIDATION", "만들 이미지가 없습니다.");
  return out;
}

async function imageInput(p: FashionProject, t: FashionTask): Promise<Record<string, unknown>> {
  let refKeys: string[] = [];
  if (t.target.type === "model") refKeys = p.model.mode === "photo" && p.model.photoKey ? [p.model.photoKey] : [];
  else if (t.target.type === "look") {
    const lookId = t.target.lookId;
    const look = p.looks.find((l) => l.id === lookId)!;
    refKeys = [approvedOf(p.model.images)!.key, ...lookRefItems(p, look).map((i) => i.imageKey!)];
  } else if (t.target.type === "feedlook") {
    const lookId = t.target.lookId;
    const look = p.looks.find((l) => l.id === lookId)!;
    refKeys = [approvedOf(look.images)!.key];
  } else if (t.target.type === "flatlook") {
    const lookId = t.target.lookId;
    refKeys = lookRefItems(p, p.looks.find((l) => l.id === lookId)!).map((i) => i.imageKey!);
  } else if (t.target.type === "unboxlook") {
    const lookId = t.target.lookId;
    refKeys = [unboxItem(p, p.looks.find((l) => l.id === lookId)!)!.imageKey!];
  }
  const urls = await videoStorage.urls(refKeys, 86_400);
  const refUrls = refKeys.map((k) => urls[k]).filter(Boolean);
  if (refKeys.length && refUrls.length !== refKeys.length) throw new AppError("VALIDATION", "참고 이미지 주소를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
  const aspect = t.target.type === "flatlook" ? "4:5" : "9:16";
  t.request = { aspect_ratio: aspect, references: refKeys };
  if (!refUrls.length) {
    t.modelId = "nano-banana";
    return { prompt: t.prompt, output_format: "png", aspect_ratio: aspect };
  }
  t.modelId = "nano-banana-edit";
  return { prompt: t.prompt, image_urls: refUrls.slice(0, 10), output_format: "png", aspect_ratio: aspect };
}

const MODEL_NAME: Record<string, string> = { "nano-banana": "google/nano-banana", "nano-banana-edit": "google/nano-banana-edit" };

/** 이미지 만들기 (확인 후, 같은 요청 번호면 그대로) */
export async function createFashionImages(p: FashionProject, jobs: FashionImageJob[], requestId: string): Promise<FashionTask[]> {
  const dup = p.tasks.filter((t) => t.requestId === requestId);
  if (dup.length) return dup;
  const key = `${p.id}:${requestId}`;
  if (inFlight.has(key)) return inFlight.get(key)!;
  const run = (async () => {
    const tasks = planFashionImages(p, jobs, requestId);
    const prov = await provider();
    await submit(prov, tasks, (t) => MODEL_NAME[t.modelId] ?? "google/nano-banana-edit", (t) => imageInput(p, t));
    return tasks;
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, run);
  return run;
}

/* ───── v0.9.120 릴스 (나): 룩마다 AI 영상 (Seedance 2.0 Mini, 시작 프레임 = 승인 룩 이미지) ───── */
export const CLIP = { model: "bytedance/seedance-2-mini", modelId: "seedance-2-mini", sec: 4, resolution: "720p", creditsPerSec: 8.2 } as const;
/** v0.9.124: 컨셉(동작·카메라) + 이 룩 동작 + 추가 요청 + 주제 */
export const clipPrompt = (p: FashionProject, look: FashionLook) => {
  const concept = CLIP_CONCEPTS.find((c) => c.id === (p.settings.clipConcept ?? "pose")) ?? CLIP_CONCEPTS[0];
  const motion = look.clipMotion?.trim() || concept.en || look.pose.trim() || "she shifts her weight, turns slightly to show the outfit, then looks at the camera with a light smile";
  return [
    "Vertical 9:16 fashion lookbook reel, photorealistic. Start exactly from the provided first frame and keep EXACTLY the same woman (face, hair, body), the same outfit (every item, color and detail) and the same background for the whole clip.",
    `Theme: ${p.settings.theme || "daily look"}${look.caption ? ` — ${look.caption}` : ""}.`,
    `Motion: ${motion}. Natural, elegant, model-like movement; the whole outfit stays visible.`,
    p.settings.clipNote?.trim() ? `Extra direction (may be Korean): ${p.settings.clipNote.trim()}` : "",
    "No text, no logo, no watermark, no cuts, no extra people. No speech.",
  ]
    .filter(Boolean)
    .join("\n");
};

export async function createFashionClips(p: FashionProject, lookIds: string[], requestId: string): Promise<FashionTask[]> {
  const dup = p.tasks.filter((t) => t.requestId === requestId);
  if (dup.length) return dup;
  const key = `${p.id}:${requestId}`;
  if (inFlight.has(key)) return inFlight.get(key)!;
  const run = (async () => {
    const looks = lookIds.slice(0, MAX_TASKS).map((id) => p.looks.find((l) => l.id === id)).filter((l): l is FashionLook => Boolean(l));
    if (!looks.length) throw new AppError("VALIDATION", "영상으로 만들 룩을 골라 주세요.");
    for (const l of looks) if (!approvedOf(l.images)) throw new AppError("VALIDATION", `${l.name} 이미지를 먼저 고르세요 (그 이미지가 영상의 시작 화면).`);
    const tasks = looks.map((l) => baseTask({ kind: "video", target: { type: "lookclip", lookId: l.id }, modelId: CLIP.modelId, prompt: clipPrompt(p, l), requestId }));
    const prov = await provider();
    await submit(prov, tasks, () => CLIP.model, async (t) => {
      const lookId = (t.target as { lookId: string }).lookId;
      const img = approvedOf(p.looks.find((l) => l.id === lookId)!.images)!.key;
      const url = (await videoStorage.urls([img], 86_400))[img];
      if (!url) throw new AppError("VALIDATION", "룩 이미지 주소를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.");
      t.request = { first: img, duration: CLIP.sec, resolution: CLIP.resolution };
      return { prompt: t.prompt, first_frame_url: url, resolution: CLIP.resolution, aspect_ratio: "9:16", duration: CLIP.sec, generate_audio: false };
    });
    return tasks;
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, run);
  return run;
}

/** 음악 만들기 (Suno V6, 1회 = 곡 2개 정도) */
export async function createFashionMusic(p: FashionProject, note: string, requestId: string): Promise<FashionTask[]> {
  const dup = p.tasks.filter((t) => t.requestId === requestId);
  if (dup.length) return dup;
  const key = `${p.id}:${requestId}`;
  if (inFlight.has(key)) return inFlight.get(key)!;
  const run = (async () => {
    const prov = await provider();
    const t = baseTask({ kind: "music", target: { type: "bgm" }, modelId: "suno-v6", prompt: fashionMusicPrompt(p, note), requestId });
    await submit(prov, [t], () => "ai-music-api/generate", async (x) => (x.request = { custom_mode: false, instrumental: true, model: "V6", prompt: x.prompt }));
    return [t];
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, run);
  return run;
}

async function fetchFile(url: string, max: number): Promise<Buffer> {
  if (new URL(url).protocol !== "https:") throw new Error("결과 주소가 https 가 아닙니다.");
  const res = await safeFetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`결과 파일을 받지 못했습니다 (HTTP ${res.status}).`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > max) throw new Error(`결과 파일이 너무 큽니다 (${Math.round(buf.length / 1048576)}MB).`);
  return buf;
}

function demoImage(label: string): Buffer {
  const c = createCanvas(720, 1280);
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 720, 1280);
  grad.addColorStop(0, "#d6d3d1");
  grad.addColorStop(1, "#78716c");
  g.fillStyle = grad;
  g.fillRect(0, 0, 720, 1280);
  g.fillStyle = "#fafaf9";
  g.font = "64px sans-serif";
  g.textAlign = "center";
  g.fillText("DEMO", 360, 600);
  g.font = "36px sans-serif";
  g.fillText(label.slice(0, 20), 360, 680);
  return c.toBuffer("image/png");
}

async function demoClip(): Promise<Buffer> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "fs_clip_"));
  try {
    const out = path.join(dir, "a.mp4");
    await runFfmpeg(["-f", "lavfi", "-i", "testsrc2=size=720x1280:rate=24:duration=4", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", out], 60_000);
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function demoMusic(): Promise<Buffer> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "fs_bgm_"));
  try {
    const out = path.join(dir, "a.mp3");
    await runFfmpeg(["-f", "lavfi", "-i", "sine=frequency=330:duration=20", "-af", "volume=0.3", "-c:a", "libmp3lame", "-b:a", "128k", out], 60_000);
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** 진행 중 작업 상태 확인 (무료) → 끝난 것은 Storage 로 복사해 모델·룩·음악에 잇는다. 바뀐 것이 있으면 true */
export async function syncFashion(owner: string, p: FashionProject): Promise<boolean> {
  const active = p.tasks.filter((t) => t.status === "generating" || t.status === "requesting").slice(0, 20);
  if (!active.length) return false;
  const prov = await provider();
  const demo = prov.id.startsWith("mock");
  let changed = false;
  for (const t of active) {
    if (!t.externalTaskId) {
      if (Date.now() - Date.parse(t.updatedAt) > 30 * 60_000) {
        Object.assign(t, { status: "fail", error: "작업을 만들다 멈췄습니다. 다시 만들어 주세요.", updatedAt: now() });
        changed = true;
      }
      continue;
    }
    try {
      const s = await prov.status(t.externalTaskId);
      if (s.state === "waiting" || s.state === "generating") continue;
      changed = true;
      if (s.state === "fail" || !s.resultUrl) {
        Object.assign(t, { status: "fail", error: (s.error ?? "만들지 못했습니다.").replace("AI 컷을", "Kie 가"), credits: s.credits, updatedAt: now() });
        continue;
      }
      if (t.kind === "video" && t.target.type === "lookclip") {
        const lookId = t.target.lookId;
        const buf = demo ? await demoClip() : await fetchFile(s.resultUrl, 45 * 1024 * 1024);
        const key = `${fashionDir(owner, p.id)}/clip/${t.id}.mp4`;
        await videoStorage.put(key, buf, "video/mp4");
        t.storedKey = key;
        const look = p.looks.find((l) => l.id === lookId);
        if (look) {
          const list = (look.clips ??= []);
          list.push({ id: newFashionId("lc"), key, durationSec: CLIP.sec, createdAt: now(), approved: !list.some((c) => c.approved) });
        }
        Object.assign(t, { status: "success", credits: s.credits, error: null, updatedAt: now() });
        continue;
      }
      if (t.kind === "music") {
        const urls = demo ? ["demo"] : (s.resultUrls?.length ? s.resultUrls : [s.resultUrl]).slice(0, 2);
        const n = p.tracks.filter((x) => x.source === "ai").length;
        for (const [i, u] of urls.entries()) {
          const buf = demo ? await demoMusic() : await fetchFile(u, 25 * 1024 * 1024);
          const key = `${fashionDir(owner, p.id)}/bgm/${t.id}_${i + 1}.mp3`;
          await videoStorage.put(key, buf, "audio/mpeg");
          p.tracks.push({ id: newFashionId("tr"), key, name: `AI 음악 ${n + i + 1}`, source: "ai", createdAt: now() });
          if (!p.bgmKey) p.bgmKey = key;
          t.storedKey ??= key;
        }
      } else {
        const buf = demo ? demoImage(t.target.type === "model" ? "model" : "look") : await fetchFile(s.resultUrl, 15 * 1024 * 1024);
        const ext = buf.subarray(1, 4).toString() === "PNG" ? "png" : "jpg";
        const key = `${fashionDir(owner, p.id)}/img/${t.id}.${ext}`;
        await videoStorage.put(key, buf, ext === "png" ? "image/png" : "image/jpeg");
        t.storedKey = key;
        attachImage(p, t, key);
      }
      Object.assign(t, { status: "success", credits: s.credits, error: null, updatedAt: now() });
    } catch (e) {
      // 상태 확인 실패(Kie)는 다음에 다시, 결과 복사 실패는 오류로
      if (!(e instanceof VideoAIError)) {
        Object.assign(t, { status: "fail", error: (e instanceof Error ? e.message : errorText(e)).slice(0, 200), updatedAt: now() });
        changed = true;
      }
    }
  }
  return changed;
}

/** 새 이미지를 붙인다. 아직 승인한 것이 없으면 이 이미지를 승인 */
function attachImage(p: FashionProject, t: FashionTask, key: string): void {
  const img: FashionImage = { id: newFashionId("im"), key, prompt: t.prompt, modelId: t.modelId, source: "ai", createdAt: now(), approved: false };
  if (t.target.type === "model") {
    img.approved = !approvedOf(p.model.images);
    p.model.images.push(img);
  } else if (t.target.type === "look") {
    const lookId = t.target.lookId;
    const look = p.looks.find((l) => l.id === lookId);
    if (!look) return;
    img.approved = !approvedOf(look.images);
    look.images.push(img);
  } else if (t.target.type === "feedlook" || t.target.type === "flatlook" || t.target.type === "unboxlook") {
    const lookId = t.target.lookId;
    const look = p.looks.find((l) => l.id === lookId);
    if (!look) return;
    const list = t.target.type === "feedlook" ? (look.feedImages ??= []) : t.target.type === "flatlook" ? (look.flatImages ??= []) : (look.unboxImages ??= []);
    img.approved = !approvedOf(list);
    list.push(img);
  }
}
