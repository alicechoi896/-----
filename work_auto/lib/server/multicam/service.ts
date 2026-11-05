import "server-only";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { MULTICAM_ANGLES, MULTICAM_MODELS, multicamCredits, type AngleId, type MulticamCut, type MulticamModel } from "@/lib/multicam/types";
import { AI_CLIP_CONFIG } from "@/lib/video-production/config";
import { createId, nowIso } from "@/lib/utils";
import { AppError } from "../http";
import { getAIProvider, getVideoAIProvider } from "../providers/registry";
import { VideoAIError } from "../providers/video-ai/kie";
import { getCurrentUserId } from "../repositories";
import { safeFetch } from "../security/safe-url";
import { mediaDuration, runFfmpeg, videoSize } from "../video/ffmpeg";
import { videoStorage } from "../video/storage";

/**
 * AI 메이크업 · 멀티앵글 (v0.9.176)
 * ① 원본 올리기(무료) → 서버가 Kie 입력 규격(8비트 H.264, 409,600~927,408 화소, 30fps)으로 고르고, 고른 구간만 자른다
 * ② [AI 로 컷 짜기] AI 1번 (1초마다 화면을 보고 화장 단계·구도 제안) 또는 직접
 * ③ [만들기] Kie Seedance (reference_video_urls, 확인 필수, 자동 재시도 없음) — 과금 = (입력 초 + 출력 초) × 단가
 * ④ 결과에 원본 소리를 그대로 다시 붙인다 (말·타이밍 그대로). 저장 {owner}/multicam/… (DB 변경 없음)
 */
const MAX_BYTES = 200 * 1024 * 1024;
const MIN_PX = 409_600;
const MAX_PX = 927_408;

export interface MulticamProject {
  id: string;
  name: string;
  /** 올린 원본 (Storage) */
  srcKey: string | null;
  srcDuration: number | null;
  /** Kie 에 넣을 구간 (원본 기준 초) */
  from: number;
  to: number;
  /** 규격에 맞춘 구간 영상 */
  inputKey: string | null;
  inputSize: { w: number; h: number } | null;
  /** 인물·장소 설명 (유지 조건에 넣음, 비우면 일반 문장) */
  subject: string;
  cuts: MulticamCut[];
  model: MulticamModel;
  resolution: "480p" | "720p";
  keepAudio: boolean;
  /** 직접 고친 전체 프롬프트 (비우면 컷으로 자동) */
  promptOverride: string;
  task: { taskId: string | null; state: "waiting" | "success" | "fail"; error: string | null; credits: number | null; startedAt: string } | null;
  resultKey: string | null;
  createdAt: string;
  updatedAt: string;
}

const listKey = (owner: string) => `${owner}/multicam/projects.json`;
async function readAll(owner: string): Promise<MulticamProject[]> {
  const buf = await videoStorage.download(listKey(owner)).catch(() => null);
  try {
    return buf ? (JSON.parse(buf.toString("utf8")) as MulticamProject[]) : [];
  } catch {
    return [];
  }
}
async function writeAll(owner: string, list: MulticamProject[]) {
  await videoStorage.put(listKey(owner), Buffer.from(JSON.stringify(list.slice(0, 40))), "application/json", "0");
}
async function own(owner: string, id: unknown) {
  const list = await readAll(owner);
  const p = list.find((x) => x.id === String(id ?? ""));
  if (!p) throw new AppError("NOT_FOUND", "멀티앵글 프로젝트를 찾을 수 없습니다.", 404);
  return { list, p };
}
async function save(owner: string, list: MulticamProject[], p: MulticamProject) {
  p.updatedAt = nowIso();
  await writeAll(owner, [p, ...list.filter((x) => x.id !== p.id)]);
  return p;
}
async function withUrls(p: MulticamProject) {
  const keys = [p.srcKey, p.inputKey, p.resultKey].filter((k): k is string => Boolean(k));
  const urls = keys.length ? await videoStorage.urls(keys, 3600).catch(() => ({}) as Record<string, string>) : {};
  return { ...p, urls, prompt: buildPrompt(p), estimate: estimate(p) };
}
const len = (p: MulticamProject) => Math.max(0, Math.round((p.to - p.from) * 100) / 100);
const modelOf = (m: MulticamModel) => MULTICAM_MODELS.find((x) => x.value === m) ?? MULTICAM_MODELS[0];
function estimate(p: MulticamProject) {
  const credits = multicamCredits(p.model, p.resolution, Math.ceil(len(p)));
  return { seconds: len(p), credits, usd: Math.round(credits * AI_CLIP_CONFIG.creditUsd * 100) / 100 };
}
const mmss = (t: number) => `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, "0")}`;

/** 레퍼런스 프롬프트 구조: 유지 조건 → 시간별 카메라 컷 → 하드 컷 → 소리 → 잠금 */
export function buildPrompt(p: Pick<MulticamProject, "cuts" | "subject" | "promptOverride" | "from" | "to">): string {
  if (p.promptOverride.trim()) return p.promptOverride.trim();
  const dur = Math.max(0, p.to - p.from);
  const cuts = [...p.cuts].sort((a, b) => a.start - b.start).filter((c) => c.end > c.start && c.start < dur);
  const lines = cuts.map((c) => {
    const a = MULTICAM_ANGLES.find((x) => x.value === c.angle) ?? MULTICAM_ANGLES[0];
    return `${mmss(c.start)}–${mmss(Math.min(dur, c.end))} — ${a.en}${c.note ? `, during ${c.note}` : ""}, the original action continues at its original timing.`;
  });
  const who = p.subject.trim() || "the same person, same hair, same outfit, same location, same products and the same lighting";
  return [
    "Use the reference video as the source clip, keep everything the same. Re-shoot this exact clip as a multicam edit of the same take, not a new performance. Every hand movement, product application, glance, blink and spoken word follows the reference video at the same timing. Only the camera changes at the specified cuts.",
    `Preserve: ${who}.`,
    "",
    "TIMED CAMERA CUTS",
    ...(lines.length ? lines : [`0:00.00–${mmss(dur)} — The original front-facing medium shot exactly as in the source video.`]),
    "",
    "Straight hard cuts only between fixed camera setups. No morphs, dissolves, whip pans, camera shake, new makeup actions, extra hands, new expressions or new people.",
    "",
    "AUDIO",
    "Keep the original audio timeline unchanged. No newly generated dialogue, narration or music.",
    "",
    "POSITIVE LOCKS",
    "Same performance, original timing, same person, products, outfit, location and natural lighting. Lip sync matches the original words wherever the face is visible. No background or character changes. No subtitles, no on-screen text, no logo, no watermark.",
  ].join("\n");
}

/** 원본 → Kie 입력 규격 (구간만, 8비트 H.264 30fps, 화소 수 범위 안) */
async function prepareInput(owner: string, p: MulticamProject): Promise<void> {
  const buf = p.srcKey ? await videoStorage.download(p.srcKey) : null;
  if (!buf) throw new AppError("VALIDATION", "원본 영상이 없습니다. 다시 올려 주세요.");
  const dir = await mkdtemp(path.join(os.tmpdir(), "mcam-"));
  try {
    const src = path.join(dir, "src.mp4");
    await writeFile(src, buf);
    const size = await videoSize(src);
    if (!size.width || !size.height) throw new AppError("VALIDATION", "영상 크기를 읽지 못했습니다.");
    // 짧은 변 720 기준 → 화소 수 범위 안으로
    let s = 720 / Math.min(size.width, size.height);
    let w = size.width * s;
    let h = size.height * s;
    if (w * h > MAX_PX) {
      s = Math.sqrt(MAX_PX / (w * h));
      w *= s;
      h *= s;
    }
    if (w * h < MIN_PX) {
      s = Math.sqrt(MIN_PX / (w * h));
      w *= s;
      h *= s;
    }
    const ev = (n: number) => Math.max(2, Math.floor(n / 2) * 2);
    const W = ev(w);
    const H = ev(h);
    const out = path.join(dir, "in.mp4");
    await runFfmpeg(["-y", "-ss", p.from.toFixed(2), "-t", len(p).toFixed(2), "-i", src, "-vf", `scale=${W}:${H}:flags=lanczos,fps=30,format=yuv420p`, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out], 240_000);
    const key = `${owner}/multicam/${p.id}/input_${Date.now().toString(36)}.mp4`;
    if (p.inputKey) await videoStorage.remove(p.inputKey).catch(() => undefined);
    await videoStorage.put(key, await readFile(out), "video/mp4");
    p.inputKey = key;
    p.inputSize = { w: W, h: H };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

const cleanCuts = (raw: unknown, dur: number): MulticamCut[] =>
  (Array.isArray(raw) ? raw : [])
    .slice(0, 16)
    .map((c: Partial<MulticamCut>) => ({
      start: Math.max(0, Math.min(dur, Math.round(Number(c?.start) * 100) / 100 || 0)),
      end: Math.max(0, Math.min(dur, Math.round(Number(c?.end) * 100) / 100 || 0)),
      angle: (MULTICAM_ANGLES.some((a) => a.value === c?.angle) ? c!.angle : "front") as AngleId,
      note: String(c?.note ?? "").replace(/\s+/g, " ").trim().slice(0, 60),
    }))
    .filter((c) => c.end > c.start)
    .sort((a, b) => a.start - b.start);

export const multicamService = {
  async list() {
    return (await readAll(await getCurrentUserId())).map((p) => ({ id: p.id, name: p.name, updatedAt: p.updatedAt }));
  },
  async get(id: unknown) {
    const { p } = await own(await getCurrentUserId(), id);
    return withUrls(p);
  },
  async remove(id: unknown) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, id);
    for (const k of [p.srcKey, p.inputKey, p.resultKey]) if (k) await videoStorage.remove(k).catch(() => undefined);
    await writeAll(owner, list.filter((x) => x.id !== p.id));
    return { ok: true };
  },

  /** 원본 올리기 1: 프로젝트 + 올릴 주소 */
  async uploadUrl(input: { name?: unknown; size?: unknown }) {
    if (Number(input.size) > MAX_BYTES) throw new AppError("VALIDATION", "영상이 너무 큽니다 (200MB 이하).");
    const owner = await getCurrentUserId();
    const list = await readAll(owner);
    const id = createId("mcam");
    const p: MulticamProject = { id, name: String(input.name ?? "").replace(/\.[a-z0-9]+$/i, "").slice(0, 60) || "메이크업 영상", srcKey: `${owner}/multicam/${id}/src.mp4`, srcDuration: null, from: 0, to: 0, inputKey: null, inputSize: null, subject: "", cuts: [], model: "mini", resolution: "720p", keepAudio: true, promptOverride: "", task: null, resultKey: null, createdAt: nowIso(), updatedAt: nowIso() };
    await save(owner, list, p);
    return { id, ...(await videoStorage.signedUpload(p.srcKey!, "/api/multicam/upload")) };
  },
  async uploadMemory(id: string, body: ArrayBuffer) {
    const owner = await getCurrentUserId();
    const { p } = await own(owner, id);
    if (body.byteLength > MAX_BYTES) throw new AppError("VALIDATION", "영상이 너무 큽니다 (200MB 이하).");
    await videoStorage.put(p.srcKey!, Buffer.from(body), "video/mp4");
  },
  /** 원본 올리기 2: 길이 읽기 · 기본 구간 (모델 최대 길이까지) */
  async probe(input: { id?: unknown }) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    const buf = p.srcKey ? await videoStorage.download(p.srcKey) : null;
    if (!buf) throw new AppError("VALIDATION", "올린 영상을 찾지 못했습니다. 다시 올려 주세요.");
    const dir = await mkdtemp(path.join(os.tmpdir(), "mcam-"));
    try {
      const f = path.join(dir, "s.mp4");
      await writeFile(f, buf);
      p.srcDuration = Math.round((await mediaDuration(f)) * 100) / 100;
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
    if (!p.srcDuration) throw new AppError("VALIDATION", "영상을 읽지 못했습니다. mp4 로 다시 올려 주세요.");
    p.from = 0;
    p.to = Math.min(p.srcDuration, modelOf(p.model).maxIn);
    p.cuts = [{ start: 0, end: len(p), angle: "front", note: "" }];
    return withUrls(await save(owner, list, p));
  },

  async update(input: { id?: unknown; name?: unknown; from?: unknown; to?: unknown; subject?: unknown; cuts?: unknown; model?: unknown; resolution?: unknown; keepAudio?: unknown; promptOverride?: unknown }) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    if (input.name !== undefined) p.name = String(input.name ?? "").trim().slice(0, 60) || p.name;
    if (input.model === "mini" || input.model === "s25") p.model = input.model;
    if (input.resolution === "480p" || input.resolution === "720p") p.resolution = input.resolution;
    const total = p.srcDuration ?? 0;
    const max = modelOf(p.model).maxIn;
    if (input.from !== undefined || input.to !== undefined || input.model !== undefined) {
      const from = Math.max(0, Math.min(total, Number(input.from ?? p.from) || 0));
      let to = Math.max(from, Math.min(total, Number(input.to ?? p.to) || 0));
      if (to - from > max) to = from + max;
      if (from !== p.from || to !== p.to) p.inputKey = null; // 구간이 바뀌면 다시 만든다
      p.from = Math.round(from * 100) / 100;
      p.to = Math.round(to * 100) / 100;
    }
    if (input.subject !== undefined) p.subject = String(input.subject ?? "").slice(0, 400);
    if (input.cuts !== undefined) p.cuts = cleanCuts(input.cuts, len(p));
    if (input.keepAudio !== undefined) p.keepAudio = Boolean(input.keepAudio);
    if (input.promptOverride !== undefined) p.promptOverride = String(input.promptOverride ?? "").slice(0, 8000);
    return withUrls(await save(owner, list, p));
  },

  /** [AI 로 컷 짜기] AI 1번: 구간을 1초마다 보고 화장 단계·구도 제안 (같은 길이의 컷이 이어지게) */
  async plan(input: { id?: unknown }) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    const dur = len(p);
    if (dur < 2) throw new AppError("VALIDATION", "구간을 2초 이상으로 정해 주세요.");
    const buf = p.srcKey ? await videoStorage.download(p.srcKey) : null;
    if (!buf) throw new AppError("VALIDATION", "원본 영상이 없습니다.");
    const dir = await mkdtemp(path.join(os.tmpdir(), "mcam-"));
    const frames: { t: number; b64: string }[] = [];
    try {
      const f = path.join(dir, "s.mp4");
      await writeFile(f, buf);
      const step = dur > 20 ? 1.5 : 1;
      for (let t = 0.3; t < dur && frames.length < 24; t += step) {
        const jpg = path.join(dir, `f${frames.length}.jpg`);
        const ok = await runFfmpeg(["-y", "-ss", (p.from + t).toFixed(2), "-i", f, "-frames:v", "1", "-vf", "scale=320:-2", "-q:v", "5", jpg], 60_000).catch(() => null);
        const img = ok ? await readFile(jpg).catch(() => null) : null;
        if (img) frames.push({ t, b64: img.toString("base64") });
      }
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
    const ai = await getAIProvider();
    type Out = { subject: string; cuts: { start: number; end: number; angle: AngleId; note: string }[] };
    let out: Out;
    if (ai.id === "mock") {
      const n = Math.max(2, Math.min(6, Math.round(dur / 2.5)));
      const order: AngleId[] = ["front", "eye34", "lash", "lip", "side", "front"];
      out = { subject: "same young Korean woman, same long brown hair, same grey sweater, same beige car interior, same products and daylight", cuts: Array.from({ length: n }, (_, i) => ({ start: (dur / n) * i, end: (dur / n) * (i + 1), angle: i === n - 1 ? "front" : order[i % order.length], note: ["cushion", "eyeshadow", "mascara", "lip gloss", "blush", "final look"][i % 6] })) };
    } else {
      const r = await ai.generateStructured<Out>({
        task: "multicam-plan",
        messages: [
          { role: "system", content: "당신은 뷰티 숏폼 촬영 감독이다. 카메라 1대로 찍은 영상을 보고, 같은 연기를 여러 카메라로 찍은 것처럼 보이게 컷마다 구도를 정한다. 답은 JSON 하나." },
          {
            role: "user",
            content: [
              { type: "text" as const, text: `구간 길이 ${dur.toFixed(2)}초. 아래는 시각별 화면이다.` },
              ...frames.flatMap((fr) => [{ type: "text" as const, text: `[${fr.t.toFixed(1)}초]` }, { type: "image" as const, mediaType: "image/jpeg" as const, data: fr.b64 }]),
              {
                type: "text" as const,
                text: `정할 것:
- subject: 유지할 인물·옷·장소·조명을 영어 한 문장 (예: "same young Korean woman, same long brown hair, same grey knit sweater, same beige SUV interior, same products and soft daylight")
- cuts: 0초부터 ${dur.toFixed(2)}초까지 빈틈없이 이어지는 컷 4~8개. 컷마다 start·end(초), note = 그 구간에 하는 동작(영어 짧게, 예: "cushion application", "mascara"), angle = 그 동작을 가장 잘 보여 주는 구도:
  front(원본 정면) / eye34(아이섀도, 살짝 위 45°) / eye(눈 가까이) / lash(마스카라·속눈썹 초근접) / lip(입술 디테일) / side(옆 45°, 블러셔·하이라이터) / hand(손·제품 매크로) / top(위에서) / push(천천히 다가가기, 한 번만)
- 첫 컷과 마지막 컷은 front. 한 컷은 1.5초 이상. 동작이 바뀌는 시각에서 컷을 나눈다.`,
              },
            ],
          },
        ],
        outputKeys: ["subject", "cuts"],
        jsonSchema: {
          type: "object",
          additionalProperties: false,
          required: ["subject", "cuts"],
          properties: {
            subject: { type: "string" },
            cuts: { type: "array", items: { type: "object", additionalProperties: false, required: ["start", "end", "angle", "note"], properties: { start: { type: "number" }, end: { type: "number" }, angle: { type: "string", enum: MULTICAM_ANGLES.map((a) => a.value) }, note: { type: "string" } } } },
          },
        },
        variables: { multicam: p.id, frames: frames.length },
        maxTokens: 1500,
      });
      out = r.data;
    }
    p.subject = String(out.subject ?? "").slice(0, 400);
    p.cuts = cleanCuts(out.cuts, dur);
    if (p.cuts.length) {
      p.cuts[0].start = 0;
      p.cuts[p.cuts.length - 1].end = dur;
    }
    p.promptOverride = "";
    return withUrls(await save(owner, list, p));
  },

  /** [만들기] Kie Seedance — 확인 필수, 자동 재시도 없음 */
  async generate(input: { id?: unknown; confirmed?: unknown }) {
    if (input.confirmed !== true) throw new AppError("CONFIRM_REQUIRED", "확인 창에서 [만들기]를 눌러 주세요.", 409);
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    if (p.task?.state === "waiting") throw new AppError("BUSY", "만드는 중입니다. 끝난 뒤 다시 눌러 주세요.", 409);
    const dur = len(p);
    if (dur < 2) throw new AppError("VALIDATION", "구간을 2초 이상으로 정해 주세요 (Kie 입력 2초 이상).");
    const m = modelOf(p.model);
    if (dur > m.maxIn) throw new AppError("VALIDATION", `${m.label} 는 ${m.maxIn}초까지 넣을 수 있습니다. 구간을 줄여 주세요.`);
    const provider = await getVideoAIProvider();
    if (!provider) throw new AppError("KIE_NOT_CONNECTED", "Kie AI 가 연결되어 있지 않습니다. 설정 › API 연결 센터에서 Kie AI 키를 넣어 주세요.", 409);
    if (!p.inputKey) await prepareInput(owner, p);
    const url = await videoStorage.url(p.inputKey!, { seconds: 86_400 });
    if (!url) throw new AppError("STORAGE", "입력 영상 주소를 만들지 못했습니다. 잠시 후 다시 눌러 주세요.", 502);
    const prompt = buildPrompt(p).slice(0, 19_000);
    const duration = Math.max(4, Math.min(m.maxOut, Math.round(dur)));
    try {
      const r = await provider.createTask(m.kie, { prompt, reference_video_urls: [url], resolution: p.resolution, aspect_ratio: "adaptive", duration, generate_audio: !p.keepAudio });
      p.task = { taskId: r.taskId, state: "waiting", error: null, credits: null, startedAt: nowIso() };
      console.info("[Multicam] task", JSON.stringify({ id: p.id, model: m.kie, sec: dur, taskId: r.taskId }));
    } catch (e) {
      p.task = { taskId: null, state: "fail", error: e instanceof Error ? e.message.slice(0, 200) : "만들지 못했습니다.", credits: null, startedAt: nowIso() };
      if (e instanceof VideoAIError && (e.code === "AUTH" || e.code === "PAYMENT")) throw e;
    }
    return withUrls(await save(owner, list, p));
  },

  /** 상태 확인 (무료). 끝나면 받아서 원본 소리를 다시 붙인다 */
  async status(input: { id?: unknown }) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    if (p.task?.state !== "waiting" || !p.task.taskId) return withUrls(p);
    const provider = await getVideoAIProvider();
    if (!provider) return withUrls(p);
    try {
      const s = await provider.status(p.task.taskId);
      if (s.state === "waiting" || s.state === "generating") return withUrls(p);
      if (s.state === "fail" || !s.resultUrl) {
        p.task = { ...p.task, state: "fail", error: (s.error ?? "만들지 못했습니다.").slice(0, 200), credits: s.credits };
        return withUrls(await save(owner, list, p));
      }
      let video: Buffer;
      if (s.resultUrl.startsWith("mock://")) {
        // 데모: 입력 영상을 결과로 (화면 흐름 확인용)
        video = (await videoStorage.download(p.inputKey!)) ?? Buffer.alloc(0);
      } else {
        if (new URL(s.resultUrl).protocol !== "https:") throw new Error("결과 주소가 https 가 아닙니다.");
        const res = await safeFetch(s.resultUrl, { signal: AbortSignal.timeout(120_000) });
        if (!res.ok) throw new Error(`결과 영상을 받지 못했습니다 (HTTP ${res.status}).`);
        video = Buffer.from(await res.arrayBuffer());
      }
      if (p.keepAudio && p.inputKey) video = await withSourceAudio(video, p.inputKey).catch(() => video);
      const key = `${owner}/multicam/${p.id}/result_${Date.now().toString(36)}.mp4`;
      if (p.resultKey) await videoStorage.remove(p.resultKey).catch(() => undefined);
      await videoStorage.put(key, video, "video/mp4");
      p.resultKey = key;
      p.task = { ...p.task, state: "success", error: null, credits: s.credits };
      return withUrls(await save(owner, list, p));
    } catch (e) {
      if (e instanceof VideoAIError) return withUrls(p); // 확인 실패는 다음에 다시
      p.task = { ...p.task, state: "fail", error: (e instanceof Error ? e.message : "받지 못했습니다.").slice(0, 200) };
      return withUrls(await save(owner, list, p));
    }
  },
};

/** 결과 영상 + 입력 구간의 원본 소리 (영상 길이에 맞춰 자름) */
async function withSourceAudio(video: Buffer, inputKey: string): Promise<Buffer> {
  const src = await videoStorage.download(inputKey);
  if (!src) return video;
  const dir = await mkdtemp(path.join(os.tmpdir(), "mcam-a-"));
  try {
    const v = path.join(dir, "v.mp4");
    const a = path.join(dir, "a.mp4");
    const out = path.join(dir, "o.mp4");
    await writeFile(v, video);
    await writeFile(a, src);
    await runFfmpeg(["-y", "-i", v, "-i", a, "-map", "0:v:0", "-map", "1:a:0?", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-shortest", "-movflags", "+faststart", out], 120_000);
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
