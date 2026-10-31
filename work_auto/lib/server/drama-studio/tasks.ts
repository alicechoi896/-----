import "server-only";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { AppError } from "../http";
import { getVideoAIProvider } from "../providers/registry";
import { VideoAIError, type VideoAIProvider } from "../providers/video-ai/kie";
import { safeFetch } from "../security/safe-url";
import { runFfmpeg, mediaDuration } from "../video/ffmpeg";
import { videoStorage } from "../video/storage";
import { projectDir } from "./store";
import { buildVideoInput, estimateImageCredits, estimateVideoCredits, hasConflictingInputs, imageModel, validateVideo, videoModel, type VideoOptions } from "@/lib/drama-studio/models";
import { framePrompt, klingName, sheetMeta, sheetPrompt, shotPrompts, videoPrompt, sceneCast } from "@/lib/drama-studio/prompts";
import { markNewResult, newId, swapIntoTimeline } from "@/lib/drama-studio/steps";
import type { DramaCharacter, DramaClip, DramaImage, DramaProject, DramaScene, DramaTask, SheetKind } from "@/lib/drama-studio/types";

/**
 * Kie 작업 (v0.9.81) — 이미지(캐릭터 시트·스토리보드)·영상(장면·묶음).
 * - [만들기] 1번 = 화면에서 작업 수·최소 예상 크레딧을 확인받은 뒤에만 (confirmed). 같은 요청 번호면 다시 만들지 않는다
 * - 상태 확인(무료)은 화면이 열려 있을 때 10초마다, 다시 들어오면 바로. 끝난 결과는 Kie 주소가 만료되기 전에 Storage 로 복사
 * - 자동 재시도 없음. 키·잔액 오류면 나머지 작업은 만들지 않는다
 * - 참고·첫 프레임 이미지는 Storage 서명 주소(24시간)로 Kie 에 넘긴다 (키는 서버에만)
 */
const MAX_TASKS_PER_REQUEST = 30;
const inFlight = new Map<string, Promise<unknown>>();

const now = () => new Date().toISOString();
const errorText = (e: unknown) => (e instanceof VideoAIError || e instanceof AppError ? e.message : "만들지 못했습니다.");

async function provider(): Promise<VideoAIProvider> {
  const p = await getVideoAIProvider();
  if (!p) throw new AppError("KIE_NOT_CONNECTED", "Kie AI 가 연결되어 있지 않습니다. 설정 › API 연결 센터에서 Kie AI 키를 넣어 주세요.", 409);
  return p;
}

const signed = async (keys: string[]) => videoStorage.urls(keys, 86_400);

/** 같은 요청 번호로 이미 만든 작업이 있으면 그대로 돌려준다 (중복 클릭·네트워크 재전송) */
function existing(p: DramaProject, requestId: string): DramaTask[] {
  return p.tasks.filter((t) => t.requestId === requestId);
}

function baseTask(over: Partial<DramaTask> & Pick<DramaTask, "kind" | "target" | "modelId" | "mode" | "prompt" | "requestId">): DramaTask {
  const t = now();
  return { id: newId("tk"), durationSec: null, request: {}, status: "queued", externalTaskId: null, resultUrl: null, storedKey: null, assetId: null, error: null, credits: null, estimatedCredits: null, createdAt: t, updatedAt: t, ...over };
}

/** 이미 승인한 캐릭터 기준 이미지 (정면 → 전신 → 나머지 순) */
export function baseImages(p: DramaProject, charId: string): DramaImage[] {
  const order: SheetKind[] = ["front", "full", "side", "outfit", "expression", "extra"];
  return (p.sheets[charId] ?? []).filter((i) => i.approved).sort((a, b) => order.indexOf(a.kind ?? "extra") - order.indexOf(b.kind ?? "extra"));
}

/** 작업 만들기 (Kie 1회씩). 키·잔액 오류면 남은 것은 만들지 않음 */
async function submit(prov: VideoAIProvider, tasks: DramaTask[], model: (t: DramaTask) => string, input: (t: DramaTask) => Promise<Record<string, unknown>>): Promise<void> {
  let stop: string | null = null;
  for (const t of tasks) {
    if (stop) {
      Object.assign(t, { status: "fail", error: stop, updatedAt: now() });
      continue;
    }
    try {
      t.status = "requesting";
      const body = await input(t);
      if (hasConflictingInputs(body)) throw new AppError("VALIDATION", "첫·끝 프레임과 참고 이미지를 한 요청에 함께 넣을 수 없습니다.");
      const r = await prov.createTask(model(t), body);
      Object.assign(t, { externalTaskId: r.taskId, status: "generating", updatedAt: now() });
      console.info("[DramaStudio]", JSON.stringify({ task: t.id, kind: t.kind, model: t.modelId, mode: t.mode, requestId: t.requestId.slice(0, 40), externalTaskId: r.taskId }));
    } catch (e) {
      Object.assign(t, { status: "fail", error: errorText(e), updatedAt: now() });
      console.warn("[DramaStudio] create fail", JSON.stringify({ task: t.id, error: errorText(e).slice(0, 160) }));
      if (e instanceof VideoAIError && (e.code === "AUTH" || e.code === "PAYMENT")) stop = errorText(e);
    }
  }
}

/* ───── 이미지 ───── */
export interface ImageJob {
  target: { type: "sheet"; charId: string; sheetKind: SheetKind } | { type: "frame"; sceneId: string };
  prompt?: string;
}

export function planImageTasks(p: DramaProject, jobs: ImageJob[], modelId: string, requestId: string): DramaTask[] {
  const m = imageModel(modelId);
  if (!m) throw new AppError("VALIDATION", "지원하지 않는 이미지 모델입니다.");
  if (!jobs.length) throw new AppError("VALIDATION", "만들 이미지를 골라 주세요.");
  if (jobs.length > MAX_TASKS_PER_REQUEST) throw new AppError("VALIDATION", `한 번에 최대 ${MAX_TASKS_PER_REQUEST}장입니다.`);
  return jobs.map((j) => {
    let prompt = j.prompt?.trim() ?? "";
    if (j.target.type === "sheet") {
      const c = p.characters.find((x) => x.id === (j.target as { charId: string }).charId);
      if (!c) throw new AppError("VALIDATION", "등장인물을 찾지 못했습니다.");
      prompt ||= sheetPrompt(c, j.target.sheetKind, m.maxReferenceImages > 0 && baseImages(p, c.id).length > 0);
    } else {
      const s = p.scenario.scenes.find((x) => x.id === (j.target as { sceneId: string }).sceneId);
      if (!s) throw new AppError("VALIDATION", "장면을 찾지 못했습니다.");
      prompt ||= framePrompt(s, p.characters, p.settings.aspect, m.maxReferenceImages ? frameRefs(p, s).chars : []);
    }
    return baseTask({ kind: "image", target: j.target, modelId, mode: m.maxReferenceImages ? "reference" : "text", prompt, requestId, estimatedCredits: estimateImageCredits(modelId, 1) });
  });
}

/** 스토리보드 이미지에 넣을 기준 이미지: 장면 인물마다 승인한 기준 이미지 앞 2장 (최대 10장) */
function frameRefs(p: DramaProject, s: DramaScene): { chars: DramaCharacter[]; keys: string[] } {
  const chars: DramaCharacter[] = [];
  const keys: string[] = [];
  for (const c of sceneCast(s, p.characters)) {
    const imgs = baseImages(p, c.id).slice(0, 2);
    if (!imgs.length || keys.length >= 10) continue;
    chars.push(c);
    keys.push(imgs[0].key);
  }
  // 같은 인물의 두 번째 기준 이미지는 남는 칸에
  for (const c of chars) {
    const second = baseImages(p, c.id)[1];
    if (second && keys.length < 10) keys.push(second.key);
  }
  return { chars, keys };
}

/** 이미지 요청 input. extraRefs = 아직 고정 전이지만 이번에 먼저 만든 기준 이미지(정면) */
async function imageInput(p: DramaProject, t: DramaTask, modelId: string, extraRefs: string[] = []): Promise<Record<string, unknown>> {
  const m = imageModel(modelId)!;
  let refKeys: string[] = [];
  if (m.maxReferenceImages) {
    if (t.target.type === "sheet") {
      const charId = t.target.charId;
      refKeys = [...extraRefs, ...baseImages(p, charId).map((i) => i.key)].filter((k, i, a) => a.indexOf(k) === i).slice(0, 4);
      // 자동 프롬프트였으면 '같은 사람' 지시가 들어간 프롬프트로
      const c = p.characters.find((x) => x.id === charId);
      if (c && refKeys.length && t.prompt === sheetPrompt(c, t.target.sheetKind, false)) t.prompt = sheetPrompt(c, t.target.sheetKind, true);
    } else if (t.target.type === "frame") {
      const sceneId = t.target.sceneId;
      refKeys = frameRefs(p, p.scenario.scenes.find((s) => s.id === sceneId)!).keys;
    }
  }
  const aspect = t.target.type === "sheet" ? sheetMeta(t.target.sheetKind).aspect : p.settings.aspect;
  const urls = await signed(refKeys);
  const refUrls = refKeys.map((k) => urls[k]).filter(Boolean);
  t.request = { model: m.model, aspect_ratio: aspect, references: refKeys };
  // 참고 이미지가 없으면 글만 모델로 (Nano Banana Edit 는 이미지가 꼭 필요)
  if (m.maxReferenceImages && !refUrls.length) {
    t.modelId = "nano-banana";
    t.mode = "text";
    return { prompt: t.prompt, output_format: "png", aspect_ratio: aspect };
  }
  t.modelId = modelId;
  t.mode = m.maxReferenceImages ? "reference" : "text";
  return m.maxReferenceImages ? { prompt: t.prompt, image_urls: refUrls.slice(0, m.maxReferenceImages), output_format: "png", aspect_ratio: aspect } : { prompt: t.prompt, output_format: "png", aspect_ratio: aspect };
}

/**
 * v0.9.87 얼굴 일관성: 기준 이미지를 고정하지 않은 인물의 여러 종류(정면·측면·전신·표정…)를 한 번에 만들면
 * 장마다 글로만 그려 얼굴이 모두 달랐다 → 그 인물은 정면(없으면 첫 종류) 1장을 먼저 만들고,
 * 나머지는 '기다림'으로 두었다가 정면이 끝나면 그 이미지를 참고로 넣어 보낸다 (확인한 장수 그대로, 추가 비용 없음).
 */
function chainSheets(p: DramaProject, tasks: DramaTask[]): void {
  const byChar = new Map<string, DramaTask[]>();
  for (const t of tasks) if (t.target.type === "sheet") byChar.set(t.target.charId, [...(byChar.get(t.target.charId) ?? []), t]);
  for (const [charId, list] of byChar) {
    if (list.length < 2 || baseImages(p, charId).length) continue;
    const anchor = list.find((t) => t.target.type === "sheet" && t.target.sheetKind === "front") ?? list[0];
    for (const t of list) if (t !== anchor) t.dependsOn = anchor.id;
  }
}

export async function createImageTasks(owner: string, p: DramaProject, jobs: ImageJob[], modelId: string, requestId: string): Promise<DramaTask[]> {
  const dup = existing(p, requestId);
  if (dup.length) return dup;
  const key = `${owner}:${p.id}:${requestId}`;
  if (inFlight.has(key)) return (await inFlight.get(key)) as DramaTask[];
  const run = (async () => {
    const prov = await provider();
    const tasks = planImageTasks(p, jobs, modelId, requestId);
    chainSheets(p, tasks);
    await submit(
      prov,
      tasks.filter((t) => !t.dependsOn),
      // 참고 이미지가 없어 글만 모델로 바꾼 경우까지 (input 을 만든 뒤 정한다)
      (t) => imageModel(t.modelId)!.model,
      (t) => imageInput(p, t, modelId),
    );
    // 기다리는 작업은 요청한 모델을 기억해 둔다
    for (const t of tasks.filter((x) => x.dependsOn)) t.request = { model: imageModel(modelId)!.model, wantModel: modelId };
    return tasks;
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, run);
  return run;
}

/* ───── 영상 ───── */
export interface VideoJob {
  sceneIds: string[];
  options: VideoOptions;
  prompt?: string;
  /** first_last: 끝 프레임으로 쓸 장면 (없으면 다음 장면) */
  lastSceneId?: string;
}

/** 같은 장소인가 (공백·괄호 무시) */
const samePlace = (a: string, b: string) => {
  const n = (x: string) => x.replace(/\s+|[()（）·,.-]/g, "").toLowerCase();
  return Boolean(n(a)) && n(a) === n(b);
};

/**
 * v0.9.93 앞 클립에 이어 만들기: 장면별 '첫 프레임' 작업들 중, 바로 앞 장면과 장소가 같은 장면은
 * 앞 클립이 끝나면 그 마지막 프레임을 첫 프레임으로 보낸다 (동작·위치가 이어지고 얼굴이 바뀌지 않게). 장소가 바뀌면 그 장면 스토리보드에서 시작
 */
function chainVideos(p: DramaProject, tasks: DramaTask[]): void {
  const order = (t: DramaTask) => p.scenario.scenes.findIndex((s) => s.id === (t.target as { sceneIds: string[] }).sceneIds[0]);
  const single = tasks.filter((t) => t.mode === "first_frame" && (t.target as { sceneIds: string[] }).sceneIds.length === 1).sort((a, b) => order(a) - order(b));
  for (let i = 1; i < single.length; i++) {
    const prev = single[i - 1];
    const cur = single[i];
    if (order(cur) !== order(prev) + 1) continue;
    const a = p.scenario.scenes[order(prev)];
    const b = p.scenario.scenes[order(cur)];
    if (samePlace(a.location, b.location)) cur.dependsOn = prev.id;
  }
}

function approvedFrame(p: DramaProject, sceneId: string): DramaImage | null {
  const list = p.storyboard[sceneId] ?? [];
  return list.find((i) => i.approved) ?? null;
}

export function planVideoTasks(p: DramaProject, jobs: VideoJob[], requestId: string, chain = false): DramaTask[] {
  if (!jobs.length) throw new AppError("VALIDATION", "만들 장면을 골라 주세요.");
  if (jobs.length > MAX_TASKS_PER_REQUEST) throw new AppError("VALIDATION", `한 번에 최대 ${MAX_TASKS_PER_REQUEST}개 작업입니다.`);
  // 이어 만들 장면 (앞 장면도 이번에 만들고, 같은 장소)
  const picked = new Set(jobs.filter((j) => j.sceneIds.length === 1 && j.options.mode === "first_frame").map((j) => j.sceneIds[0]));
  const chained = (sceneId: string) => {
    if (!chain) return false;
    const i = p.scenario.scenes.findIndex((s) => s.id === sceneId);
    const prev = p.scenario.scenes[i - 1];
    return Boolean(prev && picked.has(prev.id) && picked.has(sceneId) && samePlace(prev.location, p.scenario.scenes[i].location));
  };
  const tasks = jobs.map((j) => {
    const scenes = j.sceneIds.map((id) => p.scenario.scenes.find((s) => s.id === id)).filter((s): s is DramaScene => Boolean(s));
    if (!scenes.length || scenes.length !== j.sceneIds.length) throw new AppError("VALIDATION", "장면을 찾지 못했습니다.");
    const o = j.options;
    const refs = videoRefs(p, scenes, o);
    const lastId = j.lastSceneId ?? p.scenario.scenes[p.scenario.scenes.findIndex((s) => s.id === scenes[scenes.length - 1].id) + 1]?.id;
    const errs = validateVideo(o, { first: Boolean(approvedFrame(p, scenes[0].id)) || (scenes.length === 1 && chained(scenes[0].id)), last: Boolean(lastId && approvedFrame(p, lastId)), references: refs.keys.length, scenes: scenes.length });
    if (errs.length) throw new AppError("VALIDATION", `${scenes.map((s) => p.scenario.scenes.indexOf(s) + 1).join("·")}번 장면: ${errs[0]}`);
    const prompt = j.prompt?.trim() || videoPrompt(scenes, p.characters, o, refs.chars);
    return baseTask({
      kind: "video",
      target: { type: "clip", sceneIds: scenes.map((s) => s.id) },
      modelId: o.modelId,
      mode: o.mode,
      prompt,
      durationSec: o.mode === "multi_shot" ? (o.shotSecs ?? []).reduce((a, b) => a + b, 0) : o.durationSec,
      request: { options: o, lastSceneId: lastId ?? null },
      requestId,
      estimatedCredits: estimateVideoCredits(o),
    });
  });
  if (chain) chainVideos(p, tasks);
  return tasks;
}

/** 참고 이미지: 장면들의 승인 스토리보드 + 등장인물 기준 이미지 (Kling 은 인물 요소) */
function videoRefs(p: DramaProject, scenes: DramaScene[], o: VideoOptions): { chars: DramaCharacter[]; keys: string[] } {
  const m = videoModel(o.modelId);
  if (o.mode !== "reference" || !m) return { chars: [], keys: [] };
  const chars = [...new Set(scenes.flatMap((s) => sceneCast(s, p.characters)))].filter((c) => baseImages(p, c.id).length > 0);
  if (m.family === "kling") {
    const keys = chars.slice(0, 3).flatMap((c) => baseImages(p, c.id).slice(0, 4).map((i) => i.key));
    return { chars: chars.slice(0, 3), keys };
  }
  // 인물 기준 이미지(정면) 먼저 → 장면 스토리보드 (최대 장수까지)
  const keys = [...chars.map((c) => baseImages(p, c.id)[0].key), ...scenes.map((s) => approvedFrame(p, s.id)?.key).filter((k): k is string => Boolean(k))];
  return { chars, keys: keys.slice(0, m.maxReferenceImages) };
}

async function videoInput(p: DramaProject, t: DramaTask, firstOverride?: string): Promise<Record<string, unknown>> {
  const o = (t.request as { options: VideoOptions }).options;
  const lastSceneId = (t.request as { lastSceneId: string | null }).lastSceneId;
  const sceneIds = (t.target as { sceneIds: string[] }).sceneIds;
  const scenes = sceneIds.map((id) => p.scenario.scenes.find((s) => s.id === id)!);
  const first = firstOverride ?? approvedFrame(p, scenes[0].id)?.key ?? null;
  const last = lastSceneId ? (approvedFrame(p, lastSceneId)?.key ?? null) : null;
  const refs = videoRefs(p, scenes, o);
  const urls = await signed([first ?? "", last ?? "", ...refs.keys]);
  const input = buildVideoInput(o, {
    prompt: t.prompt,
    firstUrl: o.mode === "first_frame" || o.mode === "first_last" || o.mode === "multi_shot" ? (first ? urls[first] : null) : null,
    lastUrl: o.mode === "first_last" && last ? urls[last] : null,
    referenceUrls: refs.keys.map((k) => urls[k]).filter(Boolean),
    shots: o.mode === "multi_shot" ? shotPrompts(scenes, p.characters, o) : undefined,
    elements: refs.chars.map((c) => ({ name: klingName(c), description: c.appearanceEn || c.appearance || c.name, urls: baseImages(p, c.id).slice(0, 4).map((i) => urls[i.key]).filter(Boolean) })).filter((e) => e.urls.length >= 2),
  });
  // 저장용: 서명 주소 대신 Storage 키
  t.request = { ...t.request, input: JSON.parse(JSON.stringify(input, (_k, v) => (typeof v === "string" && v.startsWith("http") ? "(signed-url)" : v))), first, last, references: refs.keys, ...(firstOverride ? { chainedFrom: firstOverride } : {}) };
  return input;
}

/** 앞 클립의 마지막 프레임 → Storage 이미지 키 (이어 만들기) */
async function lastFrameOf(clipKey: string): Promise<string | null> {
  const buf = await videoStorage.download(clipKey);
  if (!buf) return null;
  const dir = await mkdtemp(path.join(os.tmpdir(), "ds_last_"));
  try {
    const src = path.join(dir, "c.mp4");
    const out = path.join(dir, "last.png");
    await (await import("node:fs/promises")).writeFile(src, buf);
    await runFfmpeg(["-sseof", "-0.2", "-i", src, "-frames:v", "1", "-update", "1", out], 60_000);
    const key = clipKey.replace(/\/clip\/([^/]+)\.mp4$/, "/img/last_$1.png");
    if (key === clipKey) return null;
    await videoStorage.put(key, await readFile(out), "image/png");
    return key;
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function createVideoTasks(owner: string, p: DramaProject, jobs: VideoJob[], requestId: string, chain = false): Promise<DramaTask[]> {
  const dup = existing(p, requestId);
  if (dup.length) return dup;
  const key = `${owner}:${p.id}:${requestId}`;
  if (inFlight.has(key)) return (await inFlight.get(key)) as DramaTask[];
  const run = (async () => {
    const prov = await provider();
    const tasks = planVideoTasks(p, jobs, requestId, chain);
    await submit(
      prov,
      tasks.filter((t) => !t.dependsOn),
      (t) => videoModel(t.modelId)!.model,
      (t) => videoInput(p, t),
    );
    return tasks;
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, run);
  return run;
}

/* ───── 상태 확인 → 결과 보관 ───── */
const ACTIVE = (t: DramaTask) => t.status === "generating" || t.status === "requesting";

async function demoResult(kind: "image" | "video", aspect: string, label: string): Promise<Buffer> {
  const [w, h] = aspect === "16:9" ? [1280, 720] : aspect === "1:1" ? [900, 900] : aspect === "3:4" ? [768, 1024] : [720, 1280];
  if (kind === "image") {
    const c = createCanvas(w, h);
    const ctx = c.getContext("2d");
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#334155");
    g.addColorStop(1, "#0f172a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = `${Math.round(w / 14)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText("DEMO", w / 2, h / 2 - w / 20);
    ctx.font = `${Math.round(w / 24)}px sans-serif`;
    ctx.fillText(label.slice(0, 24), w / 2, h / 2 + w / 16);
    return c.toBuffer("image/png");
  }
  const dir = await mkdtemp(path.join(os.tmpdir(), "ds_demo_"));
  try {
    const out = path.join(dir, "a.mp4");
    await runFfmpeg(["-f", "lavfi", "-i", `testsrc2=size=${w}x${h}:rate=24:duration=3`, "-f", "lavfi", "-i", "sine=frequency=330:duration=3", "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", out], 60_000);
    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function fetchResult(url: string, kind: "image" | "video"): Promise<Buffer> {
  const u = new URL(url);
  // Kie 결과 파일 서버는 모델마다 달라 주소 제한 대신 https + 내부망 차단(safeFetch)만
  if (u.protocol !== "https:") throw new Error("결과 주소가 https 가 아닙니다.");
  const res = await safeFetch(url, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`결과 파일을 받지 못했습니다 (HTTP ${res.status}).`);
  const buf = Buffer.from(await res.arrayBuffer());
  const max = kind === "video" ? 45 * 1024 * 1024 : 15 * 1024 * 1024;
  if (buf.length > max) throw new Error(`결과 파일이 너무 큽니다 (${Math.round(buf.length / 1048576)}MB).`);
  return buf;
}

/** 진행 중인 작업 상태 확인 (무료) → 끝난 것은 Storage 로 복사하고 이미지·클립으로 잇는다. 바뀐 것이 있으면 true */
export async function syncTasks(owner: string, p: DramaProject): Promise<boolean> {
  const active = p.tasks.filter(ACTIVE).slice(0, 30);
  const waiting = p.tasks.filter((t) => t.status === "queued" && t.dependsOn);
  if (!active.length && !waiting.length) return false;
  const prov = await provider();
  const demo = prov.id.startsWith("mock");
  let changed = await releaseWaiting(prov, p);
  for (const t of active) {
    if (!t.externalTaskId) {
      // 만들다 끊긴 작업 (서버가 멈춤) — 30분 넘으면 실패로
      if (Date.now() - Date.parse(t.updatedAt) > 30 * 60_000) Object.assign(t, { status: "fail", error: "작업을 만들다 멈췄습니다. 다시 만들어 주세요.", updatedAt: now() });
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
      const aspect = t.kind === "image" ? String((t.request as { aspect_ratio?: string }).aspect_ratio ?? p.settings.aspect) : p.settings.aspect;
      const buf = demo ? await demoResult(t.kind, aspect, t.target.type === "clip" ? "video" : t.target.type) : await fetchResult(s.resultUrl, t.kind);
      const ext = t.kind === "image" ? (buf.subarray(1, 4).toString() === "PNG" ? "png" : "jpg") : "mp4";
      const key = `${projectDir(owner, p.id)}/${t.kind === "image" ? "img" : "clip"}/${t.id}.${ext}`;
      await videoStorage.put(key, buf, t.kind === "image" ? (ext === "png" ? "image/png" : "image/jpeg") : "video/mp4");
      Object.assign(t, { status: "success", resultUrl: demo ? null : s.resultUrl, storedKey: key, credits: s.credits, error: null, updatedAt: now() });
      attachResult(p, t, key, demo ? 3 : null);
      if (t.kind === "video") await fixClipDuration(p, t, buf).catch(() => undefined);
      if (p.tasks.some((x) => x.dependsOn === t.id && x.status === "queued")) changed = (await releaseWaiting(prov, p)) || changed;
    } catch (e) {
      // 상태 확인 실패는 다음에 다시 (작업은 그대로). 결과 복사 실패는 오류로 남긴다
      const msg = errorText(e) === "만들지 못했습니다." && e instanceof Error ? e.message : errorText(e);
      if (!(e instanceof VideoAIError)) {
        Object.assign(t, { status: "fail", error: msg.slice(0, 200), updatedAt: now() });
        changed = true;
      }
    }
  }
  return changed;
}

/** 기준 이미지 작업이 끝난 '기다림' 작업: 성공이면 그 이미지를 참고로 넣어 보내고, 실패면 보내지 않는다 (비용 없음) */
async function releaseWaiting(prov: VideoAIProvider, p: DramaProject): Promise<boolean> {
  const ready = p.tasks.filter((t) => t.status === "queued" && t.dependsOn && p.tasks.some((a) => a.id === t.dependsOn && (a.status === "success" || a.status === "fail")));
  if (!ready.length) return false;
  const go: DramaTask[] = [];
  for (const t of ready) {
    const anchor = p.tasks.find((a) => a.id === t.dependsOn)!;
    if (anchor.status === "fail" || !anchor.storedKey) {
      Object.assign(t, { status: "fail", error: t.kind === "video" ? "앞 장면 클립을 만들지 못해 이어서 만들지 않았습니다 (비용 없음). 앞 장면부터 다시 만들어 주세요." : "먼저 만드는 기준 이미지(정면)를 만들지 못해 보내지 않았습니다 (비용 없음). 다시 만들어 주세요.", updatedAt: now() });
      continue;
    }
    go.push(t);
  }
  const videos = go.filter((t) => t.kind === "video");
  for (const t of videos) {
    const anchor = p.tasks.find((a) => a.id === t.dependsOn)!;
    const frame = await lastFrameOf(anchor.storedKey!);
    // 마지막 프레임을 못 뽑으면 그 장면 스토리보드에서 시작 (스토리보드도 없으면 실패 — 비용 없음)
    await submit(prov, [t], (x) => videoModel(x.modelId)!.model, (x) => videoInput(p, x, frame ?? undefined));
  }
  go.splice(0, go.length, ...go.filter((t) => t.kind !== "video"));
  if (go.length) {
    const want = (t: DramaTask) => String((t.request as { wantModel?: string }).wantModel ?? "nano-banana-edit");
    await submit(
      prov,
      go,
      (t) => imageModel(t.modelId)!.model,
      (t) => imageInput(p, t, want(t), [p.tasks.find((a) => a.id === t.dependsOn)!.storedKey!]),
    );
  }
  return true;
}

function attachResult(p: DramaProject, t: DramaTask, key: string, demoSec: number | null): void {
  const at = now();
  if (t.target.type === "sheet") {
    const list = (p.sheets[t.target.charId] ??= []);
    const version = list.filter((i) => i.kind === (t.target as { sheetKind: SheetKind }).sheetKind).length + 1;
    const img: DramaImage = { id: newId("im"), key, prompt: t.prompt, modelId: t.modelId, source: "ai", createdAt: at, version, approved: false, kind: t.target.sheetKind };
    list.push(img);
    t.assetId = img.id;
    markNewResult(p, "sheets");
  } else if (t.target.type === "frame") {
    const list = (p.storyboard[t.target.sceneId] ??= []);
    const img: DramaImage = { id: newId("im"), key, prompt: t.prompt, modelId: t.modelId, source: "ai", createdAt: at, version: list.length + 1, approved: false };
    list.push(img);
    t.assetId = img.id;
    markNewResult(p, "storyboard");
  } else {
    const clip: DramaClip = { id: newId("cl"), sceneIds: t.target.sceneIds, key, source: "ai", modelId: t.modelId, mode: t.mode, prompt: t.prompt, durationSec: demoSec ?? t.durationSec ?? 5, createdAt: at, approved: false, taskId: t.id };
    p.clips.push(clip);
    t.assetId = clip.id;
    swapIntoTimeline(p, clip);
    markNewResult(p, "video");
  }
}

async function fixClipDuration(p: DramaProject, t: DramaTask, buf: Buffer): Promise<void> {
  const clip = p.clips.find((c) => c.id === t.assetId);
  if (!clip) return;
  const dir = await mkdtemp(path.join(os.tmpdir(), "ds_len_"));
  try {
    const f = path.join(dir, "c.mp4");
    await (await import("node:fs/promises")).writeFile(f, buf);
    const d = await mediaDuration(f);
    if (d > 0) clip.durationSec = Number(d.toFixed(2));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
