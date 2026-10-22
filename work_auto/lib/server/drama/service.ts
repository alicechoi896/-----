import "server-only";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { DRAMA_LIMITS, DRAMA_MODELS, type DramaModelId } from "@/lib/drama/config";
import { buildDramaPrompt, klingElementName } from "@/lib/drama/prompt";
import type { DramaCharacter, DramaScene, DramaTask } from "@/lib/types/drama";
import { AppError } from "../http";
import { getVideoAIProvider } from "../providers/registry";
import { VideoAIError } from "../providers/video-ai/kie";
import { getCurrentUserId } from "../repositories";

/**
 * AI 드라마 시험 (v0.9.62). docs/DRAMA_TEST.md
 * - 인물 사진: 브라우저가 줄여 보낸 사진 → 서버가 JPEG 로 다시 만들고 얼굴 확대 사진도 만들어 Kie 에 올린다 (무료, 24시간). 우리 서버에는 남기지 않는다
 * - [시험 만들기] 1번 = 장면 수 × 고른 모델 수 만큼 Kie 작업 (각 1회 과금). 자동 재시도 없음, 키·잔액 오류면 나머지 중단, 같은 요청 동시 1번
 * - 상태 확인은 무료. 결과 영상은 Kie 에 14일 (화면에서 바로 재생·받기)
 */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
/** Kie 가 올린 사진 주소만 받는다 (다른 주소를 모델에 넘기지 않게) */
const KIE_FILE_HOST = /(^|\.)(redpandaai\.co|kie\.ai|aiquickdraw\.com)$/i;
const TASK_ID = /^[\w-]{4,100}$/;
const inFlight = new Map<string, Promise<{ tasks: DramaTask[]; created: number }>>();

function kieUrl(u: unknown): string | null {
  if (typeof u !== "string") return null;
  try {
    const url = new URL(u);
    return url.protocol === "https:" && KIE_FILE_HOST.test(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

function cleanCharacters(raw: unknown): DramaCharacter[] {
  return (Array.isArray(raw) ? raw : [])
    .slice(0, DRAMA_LIMITS.characters)
    .map((c: Partial<DramaCharacter>, i) => ({
      id: `c${i + 1}`,
      name: String(c?.name ?? "").replace(/\s+/g, " ").trim().slice(0, 12) || `인물${i + 1}`,
      description: String(c?.description ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
      imageUrl: kieUrl(c?.imageUrl),
      closeUrl: kieUrl(c?.closeUrl),
      uploadedAt: typeof c?.uploadedAt === "string" ? c.uploadedAt : null,
    }))
    .filter((c) => c.imageUrl);
}

function cleanScenes(raw: unknown): DramaScene[] {
  return (Array.isArray(raw) ? raw : [])
    .slice(0, DRAMA_LIMITS.scenes)
    .map((s: Partial<DramaScene>, i) => ({
      id: /^s\d{1,2}$/.test(String(s?.id)) ? String(s.id) : `s${i + 1}`,
      description: String(s?.description ?? "").trim().slice(0, 600),
      dialogue: String(s?.dialogue ?? "").trim().slice(0, 800),
    }))
    .filter((s) => s.description);
}

function input(model: DramaModelId, scene: DramaScene, cast: DramaCharacter[]): Record<string, unknown> {
  const prompt = buildDramaPrompt(scene, cast, model);
  const sec = DRAMA_LIMITS.durationSec;
  if (model === "minimax-h3") return { prompt, reference_image_urls: cast.map((c) => c.imageUrl!), aspect_ratio: "9:16", duration: sec, resolution: "768P" };
  if (model === "seedance-mini") return { prompt, reference_image_urls: cast.map((c) => c.imageUrl!), aspect_ratio: "9:16", duration: sec, resolution: "720p", generate_audio: true };
  // Kling 3.0: 인물마다 요소 (사진 2장: 전신 + 얼굴 확대), 프롬프트에서 @char1
  return {
    prompt,
    sound: true,
    duration: String(sec),
    aspect_ratio: "9:16",
    mode: "std",
    multi_shots: false,
    kling_elements: cast.slice(0, 3).map((c) => ({ name: klingElementName(c), description: (c.description || c.name).slice(0, 100), element_input_urls: [c.imageUrl!, c.closeUrl ?? c.imageUrl!] })),
  };
}

const errorText = (e: unknown) => (e instanceof VideoAIError || e instanceof AppError ? e.message : "만들지 못했습니다.");

export const dramaService = {
  /** 인물 사진 올리기: 전신 + 얼굴 확대 (Kie 파일, 무료·24시간) */
  async upload(body: { dataUrl?: unknown }): Promise<{ imageUrl: string; closeUrl: string; uploadedAt: string }> {
    await getCurrentUserId();
    const m = String(body.dataUrl ?? "").match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) throw new AppError("VALIDATION", "JPG·PNG·WEBP 사진만 올릴 수 있습니다.");
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > MAX_UPLOAD_BYTES) throw new AppError("VALIDATION", "사진이 너무 큽니다 (8MB 이하).");
    const provider = await getVideoAIProvider();
    if (!provider) throw new AppError("KIE_NOT_CONNECTED", "Kie AI 가 연결되어 있지 않습니다. 설정 › API 연결 센터에서 Kie AI 키를 넣어 주세요.", 409);
    let img: Awaited<ReturnType<typeof loadImage>>;
    try {
      img = await loadImage(buf);
    } catch {
      throw new AppError("VALIDATION", "사진을 읽지 못했습니다.");
    }
    if (img.width < 300 || img.height < 300) throw new AppError("VALIDATION", "사진이 너무 작습니다 (가로·세로 300px 이상).");
    // 전신: 그대로 (긴 쪽 최대 1536)
    const fit = Math.min(1, DRAMA_LIMITS.imageMaxSide / Math.max(img.width, img.height));
    const full = createCanvas(Math.round(img.width * fit), Math.round(img.height * fit));
    full.getContext("2d").drawImage(img, 0, 0, full.width, full.height);
    // 얼굴 확대: 위쪽 가운데 (세로 사진 기준 위 38%), 3:4
    const ch = Math.round(img.height * 0.38);
    const cw = Math.min(img.width, Math.round(ch * 0.75));
    const close = createCanvas(Math.max(300, Math.round(cw * Math.min(1, 1024 / cw))), 0);
    close.height = Math.round((close.width * ch) / cw);
    close.getContext("2d").drawImage(img, Math.round((img.width - cw) / 2), 0, cw, ch, 0, 0, close.width, close.height);
    const [imageUrl, closeUrl] = [await provider.uploadImage(full.toBuffer("image/jpeg", 90)), await provider.uploadImage(close.toBuffer("image/jpeg", 90))];
    return { imageUrl, closeUrl, uploadedAt: new Date().toISOString() };
  },

  /** [시험 만들기]: 장면 × 모델 (각 1회 과금) */
  async create(body: { characters?: unknown; scenes?: unknown; models?: unknown; clientRequestId?: unknown }): Promise<{ tasks: DramaTask[]; created: number }> {
    const userId = await getCurrentUserId();
    const cast = cleanCharacters(body.characters);
    const scenes = cleanScenes(body.scenes);
    const models = [...new Set((Array.isArray(body.models) ? body.models : []).map(String))].filter((id): id is DramaModelId => DRAMA_MODELS.some((m) => m.id === id));
    if (!cast.length) throw new AppError("VALIDATION", "인물 사진을 1명 이상 올려 주세요.");
    if (!scenes.length) throw new AppError("VALIDATION", "장면을 1개 이상 써 주세요.");
    if (!models.length) throw new AppError("VALIDATION", "모델을 1개 이상 골라 주세요.");
    const provider = await getVideoAIProvider();
    if (!provider) throw new AppError("KIE_NOT_CONNECTED", "Kie AI 가 연결되어 있지 않습니다. 설정 › API 연결 센터에서 Kie AI 키를 넣어 주세요.", 409);
    const key = `${userId}:${String(body.clientRequestId ?? "")}`;
    const running = inFlight.get(key);
    if (running) return running;
    const p = (async () => {
      const tasks: DramaTask[] = [];
      let created = 0;
      let stop: string | null = null;
      for (const scene of scenes) {
        for (const modelId of models) {
          const base: DramaTask = { sceneId: scene.id, modelId, taskId: null, state: "fail", resultUrl: null, credits: null, error: null };
          if (stop) {
            tasks.push({ ...base, error: stop });
            continue;
          }
          try {
            const r = await provider.createTask(DRAMA_MODELS.find((m) => m.id === modelId)!.model, input(modelId, scene, cast));
            tasks.push({ ...base, taskId: r.taskId, state: "waiting" });
            created++;
            console.info("[DramaTest]", JSON.stringify({ clientRequestId: String(body.clientRequestId ?? "-").slice(0, 40), scene: scene.id, model: modelId, taskId: r.taskId, cast: cast.length }));
          } catch (e) {
            tasks.push({ ...base, error: errorText(e) });
            console.warn("[DramaTest] fail", JSON.stringify({ scene: scene.id, model: modelId, error: errorText(e).slice(0, 160) }));
            if (e instanceof VideoAIError && (e.code === "AUTH" || e.code === "PAYMENT")) stop = errorText(e);
          }
        }
      }
      return { tasks, created };
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, p);
    return p;
  },

  /** 상태 확인 (무료) */
  async status(body: { tasks?: unknown }): Promise<{ tasks: DramaTask[] }> {
    await getCurrentUserId();
    const provider = await getVideoAIProvider();
    if (!provider) throw new AppError("KIE_NOT_CONNECTED", "Kie AI 가 연결되어 있지 않습니다.", 409);
    const tasks = (Array.isArray(body.tasks) ? body.tasks : []).slice(0, DRAMA_LIMITS.scenes * DRAMA_MODELS.length) as DramaTask[];
    const out: DramaTask[] = [];
    for (const t of tasks) {
      const task: DramaTask = {
        sceneId: String(t?.sceneId ?? "").slice(0, 8),
        modelId: DRAMA_MODELS.some((m) => m.id === t?.modelId) ? t.modelId : "minimax-h3",
        taskId: typeof t?.taskId === "string" && TASK_ID.test(t.taskId) ? t.taskId : null,
        state: ["waiting", "generating", "success", "fail"].includes(String(t?.state)) ? t.state : "fail",
        resultUrl: typeof t?.resultUrl === "string" ? t.resultUrl.slice(0, 1000) : null,
        credits: typeof t?.credits === "number" ? t.credits : null,
        error: typeof t?.error === "string" ? t.error.slice(0, 200) : null,
      };
      if (task.taskId && (task.state === "waiting" || task.state === "generating")) {
        try {
          const s = await provider.status(task.taskId);
          Object.assign(task, { state: s.state, resultUrl: s.resultUrl, credits: s.credits, error: s.error });
        } catch (e) {
          task.error = errorText(e);
        }
      }
      out.push(task);
    }
    return { tasks: out };
  },
};
