import "server-only";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { SessionInfo } from "@/lib/types";
import type { AiClip, VideoJob, VideoPlan } from "@/lib/types/video-production";
import { aiSourceId } from "@/lib/types/video-production";
import { AI_CLIP_CONFIG, cleanVoiceSpeed, STAY_ANGLES, STAY_CUT_MAX_SEC, STAY_MAX_PHOTOS, estimateAiClipUsd } from "@/lib/video-production/config";
import { createId, nowIso } from "@/lib/utils";
import { lastVoiceSettings } from "../automation/auto-video";
import { serverConfig } from "../config";
import { AppError } from "../http";
import { getAIProvider, getVideoAIProvider } from "../providers/registry";
import { VideoAIError } from "../providers/video-ai/kie";
import { getCurrentUserId, getRepositories } from "../repositories";
import { safeFetch } from "../security/safe-url";
import { productPhotoBuffers } from "../media/photo-sources";
import { aiClipService } from "../video/ai-clips";
import { videoJobService } from "../video/service";
import { videoStorage } from "../video/storage";

/**
 * AI 숙소 영상 (v0.9.156) — 숙소 사진을 살아 움직이게(Kie 이미지→영상) 이어 붙이고, 처음 몇 초 위쪽 제목 + 가운데 자막 + AI 내레이션
 * - 사진: 직접 올리기(기본) 또는 쿠팡 주소 한 번 시도 (막히면 그대로 알림, 다시 부르지 않음)
 * - 사진은 9:16 으로 꽉 채워 우리 저장소에 둔다({owner}/stay/{id}/p{n}.jpg) → Kie 에는 만들 때 올린다 (Kie 사진은 24시간이라)
 * - [대본 만들기] AI 1번 (사진을 보고 컷마다 짧은 대사·움직임 설명) / [살아 움직이게] 사진 1장 = Kie 1회 과금 (확인 후, 자동 재시도 없음)
 * - 프로젝트는 {owner}/stay/projects.json (DB 변경 없음). 상태 확인은 무료
 */
const W = 720;
const H = 1280;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const MOTION_RULE =
  "Locked-off static camera on a tripod, no camera movement (at most a very slow subtle push-in). Keep the scene, room layout, furniture and colors exactly as in the photo. Only natural ambient motion: rising steam, gentle rain, rippling water, flickering fire or candle light, swaying leaves and curtains, drifting clouds or fog, as fits the photo. Photorealistic, calm and cinematic. No people appear unless already in the photo. No text, no captions, no logos, no watermark.";

export interface StayPhoto {
  key: string;
  /** 컷 대사 (자막·내레이션) */
  line: string;
  /** AI 움직임 설명 (영어) */
  motion: string;
  /** v0.9.169 움직임 설명 한글 번역 (보기용, 영어를 고치면 비운다) */
  motionKo?: string;
  /** v0.9.169 이 컷 보이는 시간(초). 없으면 대사 길이만큼 */
  sec?: number | null;
  /** v0.9.174 이 사진이 다른 사진에서 만든 각도면: 원래 사진 key · 각도 */
  fromKey?: string | null;
  angle?: string | null;
}
/** v0.9.183 미리보기 AI 컷 영상 보관 시간 */
const CLIP_PREVIEW_MS = 60 * 60 * 1000;
/** v0.9.183 각도 사진이 이만큼 지나도 '만드는 중'이면 실패로 (Kie 는 보통 1분 안) */
const ANGLE_TIMEOUT_MS = 15 * 60 * 1000;
/** v0.9.174 각도 사진 작업 (Kie Nano Banana Edit) */
export interface StayAngleTask {
  id: string;
  sourceKey: string;
  angle: string;
  taskId: string | null;
  state: "waiting" | "success" | "fail";
  error: string | null;
  /** v0.9.183 Kie 에서는 만들어졌는데 우리 쪽에서 받지 못한 것 → [다시 받기](무료)로 다시 받을 수 있음 */
  refetch?: boolean;
  createdAt: string;
}
export interface StayProject {
  id: string;
  name: string;
  coupangUrl: string;
  note: string;
  titleSmall: string;
  titleBig: string;
  titleSec: number;
  photos: StayPhoto[];
  clips: AiClip[];
  /** AI 컷 id → 사진 key */
  clipKeys: Record<string, string>;
  /** v0.9.159 가져온 제품 라이브러리 숙소 */
  productId?: string | null;
  /** v0.9.174 다른 각도 만들기 작업 */
  angleTasks?: StayAngleTask[];
  /** v0.9.182 완성된 AI 컷 영상 (컷 id → 우리 저장소 key, 미리보기용) */
  clipFiles?: Record<string, string>;
  /** v0.9.183 미리보기 파일 받은 시각 (1시간 뒤 지움 — 렌더는 Kie 에서 따로 받음) */
  clipFileAt?: Record<string, string>;
  /** v0.9.182 이 영상 AI 내레이션 목소리 (없으면 원고로 영상 만들기 마지막 설정) */
  voice?: StayVoice | null;
  jobId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StayVoice {
  ttsEngine: "openai" | "typecast";
  voice: string;
  ttsEmotion?: string;
  voiceStyle?: string;
  voiceSpeed?: number;
}
function cleanVoice(v: unknown): StayVoice | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const s = (x: unknown, n: number) => String(x ?? "").trim().slice(0, n);
  const voice = s(o.voice, 120);
  const speed = Number(o.voiceSpeed);
  return {
    ttsEngine: o.ttsEngine === "openai" ? "openai" : "typecast",
    voice,
    ttsEmotion: s(o.ttsEmotion, 40) || undefined,
    voiceStyle: s(o.voiceStyle, 40) || undefined,
    voiceSpeed: o.voiceSpeed == null || o.voiceSpeed === "" ? undefined : cleanVoiceSpeed(speed),
  };
}

const listKey = (owner: string) => `${owner}/stay/projects.json`;
async function readAll(owner: string): Promise<StayProject[]> {
  const buf = await videoStorage.download(listKey(owner)).catch(() => null);
  try {
    return buf ? (JSON.parse(buf.toString("utf8")) as StayProject[]) : [];
  } catch {
    return [];
  }
}
async function writeAll(owner: string, list: StayProject[]) {
  await videoStorage.put(listKey(owner), Buffer.from(JSON.stringify(list.slice(0, 30))), "application/json", "0");
}
async function own(owner: string, id: unknown): Promise<{ list: StayProject[]; p: StayProject }> {
  const list = await readAll(owner);
  const p = list.find((x) => x.id === String(id ?? ""));
  if (!p) throw new AppError("NOT_FOUND", "숙소 영상 프로젝트를 찾을 수 없습니다.", 404);
  return { list, p };
}
async function save(owner: string, list: StayProject[], p: StayProject): Promise<StayProject> {
  p.updatedAt = nowIso();
  await writeAll(owner, [p, ...list.filter((x) => x.id !== p.id)]);
  return p;
}

/** 사진 → 9:16 꽉 채우기 (가운데 기준으로 자름) */
async function coverJpeg(buf: Buffer): Promise<Buffer> {
  const img = await loadImage(buf).catch(() => {
    throw new AppError("VALIDATION", "사진을 읽지 못했습니다.");
  });
  const c = createCanvas(W, H);
  const ctx = c.getContext("2d");
  const s = Math.max(W / img.width, H / img.height);
  ctx.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
  return c.toBuffer("image/jpeg", 90);
}
async function smallJpeg(buf: Buffer, w = 360): Promise<string> {
  const img = await loadImage(buf);
  const c = createCanvas(w, Math.round((w * img.height) / img.width));
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toBuffer("image/jpeg", 80).toString("base64");
}

async function addPhoto(owner: string, p: StayProject, buf: Buffer) {
  if (p.photos.length >= STAY_MAX_PHOTOS) throw new AppError("VALIDATION", `사진은 ${STAY_MAX_PHOTOS}장까지입니다.`);
  const key = `${owner}/stay/${p.id}/p${createId("ph").slice(-8)}.jpg`;
  await videoStorage.put(key, await coverJpeg(buf), "image/jpeg");
  p.photos.push({ key, line: "", motion: "" });
}

/** 화면용: 사진 미리보기 주소 (1시간) */
async function withUrls(p: StayProject): Promise<StayProject & { photoUrls: Record<string, string>; clipUrls: Record<string, string> }> {
  const photoUrls = p.photos.length ? await videoStorage.urls(p.photos.map((x) => x.key), 3600).catch(() => ({})) : {};
  // v0.9.182 완성된 AI 컷 미리보기 (컷 id → 주소)
  const files = Object.entries(p.clipFiles ?? {});
  const byKey: Record<string, string> = files.length ? await videoStorage.urls(files.map(([, k]) => k), 3600).catch(() => ({})) : {};
  const clipUrls = Object.fromEntries(files.filter(([, k]) => byKey[k]).map(([id, k]) => [id, byKey[k]]));
  return { ...p, photoUrls, clipUrls };
}

/** v0.9.182 완성된 AI 컷 영상을 우리 저장소에 받아 둔다 (상태 확인 때, 무료 — Kie 결과 주소는 오래 안 가서). 데모(mock://)는 건너뜀 */
async function keepClipFiles(owner: string, p: StayProject): Promise<boolean> {
  const todo = p.clips.filter((c) => c.state === "success" && c.taskId && !p.clipFiles?.[c.id]).slice(0, 3);
  const until = Date.now() + 40_000;
  if (!todo.length) return false;
  const provider = await getVideoAIProvider();
  if (!provider) return false;
  let changed = false;
  for (const c of todo) {
    if (Date.now() > until) break;
    try {
      const st = await provider.status(c.taskId!);
      if (st.state !== "success" || !st.resultUrl || new URL(st.resultUrl).protocol !== "https:") continue;
      const res = await safeFetch(st.resultUrl, { signal: AbortSignal.timeout(60_000), headers: { "User-Agent": UA } });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length < 1000 || buf.length > 60 * 1024 * 1024) continue;
      const key = `${owner}/stay/${p.id}/clip_${c.id}_${createId("v").slice(-6)}.mp4`;
      await videoStorage.put(key, buf, "video/mp4");
      p.clipFiles = { ...(p.clipFiles ?? {}), [c.id]: key };
      p.clipFileAt = { ...(p.clipFileAt ?? {}), [c.id]: nowIso() };
      changed = true;
    } catch (e) {
      // 못 받으면 다음 확인 때 다시 (렌더는 taskId 로 따로 받음)
      console.warn("[Stay] clip preview", JSON.stringify({ project: p.id, clip: c.id, error: e instanceof Error ? e.message.slice(0, 160) : "?" }));
    }
  }
  return changed;
}
async function dropClipFile(p: StayProject, clipId: string) {
  const k = p.clipFiles?.[clipId];
  if (!k) return;
  await videoStorage.remove(k).catch(() => undefined);
  const { [clipId]: _gone, ...rest } = p.clipFiles!;
  void _gone;
  p.clipFiles = rest;
  if (p.clipFileAt) delete p.clipFileAt[clipId];
}
/** v0.9.183 받은 지 1시간 지난 미리보기 영상은 지운다 (저장 공간 절약, 다시 열면 다시 받음) */
async function pruneClipFiles(p: StayProject): Promise<boolean> {
  let changed = false;
  for (const id of Object.keys(p.clipFiles ?? {})) {
    const at = Date.parse(p.clipFileAt?.[id] ?? "");
    if (Number.isFinite(at) && Date.now() - at < CLIP_PREVIEW_MS) continue;
    await dropClipFile(p, id);
    changed = true;
  }
  return changed;
}

export const stayService = {
  async list(): Promise<StayProject[]> {
    return readAll(await getCurrentUserId());
  },

  async get(id: unknown) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, id);
    if (await pruneClipFiles(p)) await save(owner, list, p);
    return withUrls(p);
  },

  async create(input: { name?: unknown }) {
    const owner = await getCurrentUserId();
    const list = await readAll(owner);
    const p: StayProject = { id: createId("stay"), name: String(input.name ?? "").trim().slice(0, 60) || "새 숙소 영상", coupangUrl: "", note: "", titleSmall: "", titleBig: "", titleSec: 2.5, photos: [], clips: [], clipKeys: {}, jobId: null, createdAt: nowIso(), updatedAt: nowIso() };
    return withUrls(await save(owner, list, p));
  },

  async remove(id: unknown): Promise<void> {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, id);
    for (const ph of p.photos) await videoStorage.remove(ph.key).catch(() => undefined);
    for (const k of Object.values(p.clipFiles ?? {})) await videoStorage.remove(k).catch(() => undefined);
    await writeAll(owner, list.filter((x) => x.id !== p.id));
  },

  /** 이름·메모·제목·대사·움직임·사진 순서 고치기 (사진 지우기 포함) */
  async update(input: { id?: unknown; name?: unknown; note?: unknown; titleSmall?: unknown; titleBig?: unknown; titleSec?: unknown; photos?: unknown; voice?: unknown }) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    const str = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
    if (input.name !== undefined) p.name = str(input.name, 60) || p.name;
    if (input.note !== undefined) p.note = String(input.note ?? "").slice(0, 1000);
    if (input.titleSmall !== undefined) p.titleSmall = str(input.titleSmall, 20);
    if (input.titleBig !== undefined) p.titleBig = str(input.titleBig, 24);
    if (input.voice !== undefined) p.voice = cleanVoice(input.voice);
    if (input.titleSec !== undefined && Number.isFinite(Number(input.titleSec))) p.titleSec = Math.min(10, Math.max(1, Number(input.titleSec)));
    if (Array.isArray(input.photos)) {
      const byKey = new Map(p.photos.map((x) => [x.key, x]));
      const next = (input.photos as Partial<StayPhoto>[])
        .map((x): StayPhoto | null => {
          const old = byKey.get(String(x?.key ?? ""));
          if (!old) return null;
          const motion = String(x.motion ?? "").replace(/\s+/g, " ").trim().slice(0, 600);
          // 영어 명령어를 고치면 예전 번역은 맞지 않으니 비운다
          const motionKo = motion === old.motion ? old.motionKo : x.motionKo !== undefined && x.motionKo !== old.motionKo ? str(x.motionKo, 400) : "";
          return { key: old.key, line: str(x.line, 60), motion, motionKo, sec: cleanSec(x.sec), fromKey: old.fromKey ?? null, angle: old.angle ?? null };
        })
        .filter((x): x is StayPhoto => Boolean(x));
      const keep = new Set(next.map((x) => x.key));
      for (const old of p.photos) if (!keep.has(old.key)) await videoStorage.remove(old.key).catch(() => undefined);
      // 지운 사진의 AI 컷도 뺀다 (컷 id 는 사진 key 로 잇는다)
      for (const c of p.clips) if (!keep.has(p.clipKeys?.[c.id] ?? "")) await dropClipFile(p, c.id);
      p.clips = p.clips.filter((c) => keep.has(p.clipKeys?.[c.id] ?? ""));
      p.photos = next;
    }
    return withUrls(await save(owner, list, p));
  },

  /** 사진 직접 올리기 (data URL, 여러 장은 화면이 한 장씩) */
  async upload(input: { id?: unknown; dataUrl?: unknown }) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    const m = String(input.dataUrl ?? "").match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) throw new AppError("VALIDATION", "JPG·PNG·WEBP 사진만 올릴 수 있습니다.");
    const buf = Buffer.from(m[2], "base64");
    if (buf.length > MAX_IMAGE_BYTES) throw new AppError("VALIDATION", "사진이 너무 큽니다 (10MB 이하).");
    await addPhoto(owner, p, buf);
    return withUrls(await save(owner, list, p));
  },

  /** 쿠팡 주소 한 번 시도 (무료, 다시 부르지 않음). 막히면 직접 올리기로 */
  async fromCoupang(input: { id?: unknown; url?: unknown }) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    const url = String(input.url ?? "").trim();
    if (!/^https:\/\/([\w-]+\.)*coupang\.com\//i.test(url)) throw new AppError("VALIDATION", "쿠팡 주소(https://…coupang.com/…)를 넣어 주세요.");
    p.coupangUrl = url.slice(0, 500);
    const res = await safeFetch(url, { signal: AbortSignal.timeout(15_000), headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "ko-KR,ko;q=0.9" } }).catch(() => null);
    const html = res && res.ok ? await res.text().catch(() => "") : "";
    const found = [...new Set([...(html.match(/https?:\/\/[\w.-]*coupangcdn\.com\/[^"'\s)\\]+?\.(?:jpe?g|png|webp)/gi) ?? [])].map((u) => u.replace(/^http:/, "https:")))]
      .filter((u) => !/(icon|logo|sprite|badge|blank)/i.test(u))
      .slice(0, STAY_MAX_PHOTOS - p.photos.length);
    let added = 0;
    for (const u of found) {
      try {
        const r = await safeFetch(u, { signal: AbortSignal.timeout(15_000), headers: { "User-Agent": UA, Referer: url, Accept: "image/*" } });
        if (!r.ok) continue;
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length < 15_000 || buf.length > MAX_IMAGE_BYTES) continue; // 너무 작은 건 아이콘
        await addPhoto(owner, p, buf);
        added++;
      } catch {
        // 못 받은 사진은 건너뛴다
      }
    }
    console.info("[Stay] coupang", JSON.stringify({ status: res?.status ?? 0, found: found.length, added }));
    await save(owner, list, p);
    return { project: await withUrls(p), added, blocked: !res || !res.ok, status: res?.status ?? 0 };
  },

  /** v0.9.159 제품 라이브러리의 숙소(분류 '숙소')에서 사진·이름·사실 메모 가져오기 (무료, 외부 AI 없음) */
  async fromProduct(input: { id?: unknown; productId?: unknown; replace?: unknown }) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    const productId = String(input.productId ?? "");
    const repo = getRepositories();
    const product = await repo.products.get(productId);
    if (!product || product.userId !== owner) throw new AppError("NOT_FOUND", "제품을 찾을 수 없습니다.", 404);
    const analysis = (await repo.productAnalyses.list((a) => a.productId === productId, { productId }).catch(() => [])).sort((a, b) => b.version - a.version)[0];
    // v0.9.172 제품 라이브러리 '내 사진'(직접 올려 관리하는 숙소 사진) → 쇼핑몰 수집 사진 순
    // 다른 숙소로 바꿔 가져오면 예전 숙소 사진은 뺀다 (같은 숙소면 이어 붙임)
    if (input.replace === true || (p.productId && p.productId !== productId)) {
      for (const ph of p.photos) await videoStorage.remove(ph.key).catch(() => undefined);
      p.photos = [];
      for (const k of Object.values(p.clipFiles ?? {})) await videoStorage.remove(k).catch(() => undefined);
      p.clips = [];
      p.clipKeys = {};
      p.clipFiles = {};
      p.clipFileAt = {};
    }
    const bufs = await productPhotoBuffers(productId, STAY_MAX_PHOTOS - p.photos.length);
    let added = 0;
    for (const buf of bufs) {
      try {
        await addPhoto(owner, p, buf);
        added++;
      } catch {
        // 못 읽은 사진은 건너뛴다
      }
    }
    const urls = bufs;
    p.productId = productId;
    if (!p.name || p.name === "새 숙소 영상") p.name = product.name.slice(0, 60);
    if (!p.note.trim() && analysis) {
      const sm = analysis.summary;
      p.note = [sm.oneLiner, ...(sm.keyFeatures ?? []), ...(sm.differentiators ?? [])].filter(Boolean).join(" / ").slice(0, 1000);
    }
    await save(owner, list, p);
    return { project: await withUrls(p), added, found: urls.length };
  },

  /** v0.9.169 [한글 번역] AI 1번 (글만): 움직임 명령어(영어)를 한글로 — 보기용, Kie 에는 영어 그대로 */
  async translate(input: { id?: unknown }) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    const todo = p.photos.filter((ph) => ph.motion.trim());
    if (!todo.length) throw new AppError("VALIDATION", "번역할 움직임 명령어가 없습니다.");
    const ai = await getAIProvider();
    let ko: string[];
    if (ai.id === "mock") ko = todo.map((ph) => `(번역) ${ph.motion}`);
    else {
      const r = await ai.generateStructured<{ items: string[] }>({
        task: "stay-translate",
        messages: [
          { role: "system", content: "영상 AI 명령어(영어)를 자연스러운 한국어로 옮긴다. 뜻을 더하거나 빼지 않는다. 답은 JSON 하나." },
          { role: "user", content: `아래 ${todo.length}개를 순서대로 한국어로 옮겨 items 배열로:\n${todo.map((ph, i) => `${i + 1}. ${ph.motion}`).join("\n")}` },
        ],
        outputKeys: ["items"],
        jsonSchema: { type: "object", additionalProperties: false, required: ["items"], properties: { items: { type: "array", items: { type: "string" } } } },
        variables: { stay: p.name, count: todo.length },
        maxTokens: 1500,
      });
      ko = r.data.items ?? [];
    }
    todo.forEach((ph, i) => {
      if (ko[i]) ph.motionKo = String(ko[i]).trim().slice(0, 400);
    });
    return withUrls(await save(owner, list, p));
  },

  /** [대본 만들기] AI 1번: 사진을 보고 제목 2줄 + 컷마다 대사·움직임 */
  async script(input: { id?: unknown }) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    if (p.photos.length < 3) throw new AppError("VALIDATION", "사진을 3장 이상 넣어 주세요.");
    const ai = await getAIProvider();
    const n = p.photos.length;
    let data: { titleSmall: string; titleBig: string; cuts: { line: string; motion: string; motionKo?: string }[] };
    if (ai.id === "mock") {
      data = { titleSmall: "비 오는 날", titleBig: `${p.name.slice(0, 12)} 히노끼탕`, cuts: p.photos.map((_, i) => ({ line: ["여기 진짜 숙소인데", "통창 앞 노천탕이", "료칸 그대로예요", "밤엔 불멍까지", "지금 저장해두세요"][i % 5], motion: "gentle steam rising, light rain", motionKo: "김이 은은하게 오르고 가랑비가 내림" })) };
    } else {
      const images = await Promise.all(p.photos.map(async (ph) => smallJpeg((await videoStorage.download(ph.key))!)));
      const parts = [
        { type: "text" as const, text: `숙소: ${p.name}${p.note ? `\n메모(사실 정보): ${p.note}` : ""}\n아래 사진 ${n}장이 영상 컷 순서다. 사진마다 번호를 붙여 보낸다.${sameGroups(p)}` },
        ...images.flatMap((data, i) => [{ type: "text" as const, text: `[사진 ${i + 1}]` }, { type: "image" as const, mediaType: "image/jpeg" as const, data }]),
        {
          type: "text" as const,
          text: `세로 숏폼 숙소 소개 영상(약 ${Math.round(n * 1.5)}초)을 만든다. 컷 하나 = 사진 하나 = 약 1.5초. 영상은 계속 흐르고 대사는 컷과 따로 이어 읽는다.
- titleSmall: 영상 처음 2~3초 위쪽 작은 줄 (상황·날씨·계절, 8자 이내, 예: "비 오는 날")
- titleBig: 위쪽 큰 줄 (숙소의 가장 센 한 방, 12자 이내, 예: "액자창 앞 히노끼탕")
- cuts: 사진 순서대로 ${n}개. line = 그 사진 위 가운데 자막이자 내레이션. 4~14자, 한 호흡, 존댓말 구어체("~예요/~고요/~거죠"). 컷을 이어 읽으면 한 문장 흐름이 되게 (예: "글램핑인데" → "돌 노천탕이" → "료칸 그대로예요" → … → "지금 저장해두세요"). 첫 컷은 궁금하게, 마지막 컷은 저장·예약 유도.
- 사진에 실제로 보이는 것과 메모의 사실만 말한다. 가격·평점·리뷰 수·순위·할인은 쓰지 않는다.
- motion: 그 사진에서 자연스럽게 움직일 것만 영어로 (예: "steam rising from the hot spring, light rain falling, water rippling"). 카메라는 움직이지 않는다. 사진에 없는 사람·물건을 더하지 않는다.
- motionKo: motion 을 그대로 한국어로 옮긴 것 (사람이 읽는 용도).`,
        },
      ];
      const r = await ai.generateStructured<typeof data>({
        task: "stay-script",
        messages: [
          { role: "system", content: "당신은 한국 숙소 숏폼(릴스·쇼츠) 작가다. 짧고 감성적인 구어체로, 사진에 보이는 것만 근거로 쓴다. 답은 JSON 하나." },
          { role: "user", content: parts },
        ],
        outputKeys: ["titleSmall", "titleBig", "cuts"],
        jsonSchema: {
          type: "object",
          additionalProperties: false,
          required: ["titleSmall", "titleBig", "cuts"],
          properties: {
            titleSmall: { type: "string" },
            titleBig: { type: "string" },
            cuts: { type: "array", items: { type: "object", additionalProperties: false, required: ["line", "motion", "motionKo"], properties: { line: { type: "string" }, motion: { type: "string" }, motionKo: { type: "string" } } } },
          },
        },
        variables: { stay: p.name, photos: n },
        maxTokens: 2500,
      });
      data = r.data;
    }
    p.titleSmall = String(data.titleSmall ?? "").trim().slice(0, 20);
    p.titleBig = String(data.titleBig ?? "").trim().slice(0, 24);
    p.photos = p.photos.map((ph, i) => ({ ...ph, line: String(data.cuts?.[i]?.line ?? ph.line).trim().slice(0, 60), motion: String(data.cuts?.[i]?.motion ?? ph.motion).trim().slice(0, 600), motionKo: String(data.cuts?.[i]?.motionKo ?? "").trim().slice(0, 400) }));
    return withUrls(await save(owner, list, p));
  },

  /** 예상 비용 (아직 안 만든 사진만) */
  estimate(p: StayProject): { count: number; usd: number } {
    const todo = p.photos.filter((ph) => !clipOf(p, ph.key) || clipOf(p, ph.key)!.state === "fail");
    return { count: todo.length, usd: estimateAiClipUsd(todo.map(() => "product" as const)).usd };
  },

  /** [살아 움직이게] 아직 안 만든(또는 실패한) 사진만 Kie 작업 — 사진 1장 = 1회 과금. 확인(confirmed) 필수 */
  async animate(input: { id?: unknown; confirmed?: unknown }) {
    if (input.confirmed !== true) throw new AppError("CONFIRM_REQUIRED", "확인 창에서 [만들기]를 눌러 주세요.", 409);
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    const provider = await getVideoAIProvider();
    if (!provider) throw new AppError("KIE_NOT_CONNECTED", "Kie AI 가 연결되어 있지 않습니다. 설정 › API 연결 센터에서 Kie AI 키를 넣어 주세요.", 409);
    let created = 0;
    for (const ph of p.photos) {
      const old = clipOf(p, ph.key);
      if (old && old.state !== "fail") continue;
      const id = old?.id ?? nextClipId(p);
      if (old) await dropClipFile(p, old.id);
      const clip: AiClip = old ?? { id, mode: "product", prompt: "", imageUrl: null, taskId: null, state: "draft", model: null, credits: null, error: null };
      try {
        const buf = await videoStorage.download(ph.key);
        if (!buf) throw new AppError("NOT_FOUND", "사진 파일이 없습니다. 다시 올려 주세요.", 404);
        const imageUrl = await provider.uploadImage(buf);
        const prompt = `Vertical 9:16 video made from this photo of a Korean accommodation. ${ph.motion || "Subtle natural ambient motion."} ${MOTION_RULE}`.slice(0, 1500);
        const r = await provider.createTask(AI_CLIP_CONFIG.product.model, { prompt, image_urls: [imageUrl], duration: AI_CLIP_CONFIG.product.duration, resolution: AI_CLIP_CONFIG.product.resolution, audio: false });
        Object.assign(clip, { prompt: ph.motion.slice(0, 500), imageUrl, taskId: r.taskId, model: r.model, state: "waiting", error: null, credits: null });
        created++;
        console.info("[Stay] clip", JSON.stringify({ project: p.id, clip: id, taskId: r.taskId }));
      } catch (e) {
        Object.assign(clip, { state: "fail", taskId: null, error: e instanceof Error ? e.message.slice(0, 200) : "만들지 못했습니다." });
        if (e instanceof VideoAIError && (e.code === "AUTH" || e.code === "PAYMENT")) {
          setClip(p, ph.key, clip);
          break;
        }
      }
      setClip(p, ph.key, clip);
    }
    return { project: await withUrls(await save(owner, list, p)), created };
  },

  /**
   * v0.9.174 [다른 각도 만들기] 사진마다 고른 각도로 같은 장소를 다른 자리에서 찍은 사진 (Kie Nano Banana Edit, 1장 = 4크레딧).
   * 확인(confirmed) 필수, 자동 재시도 없음. 끝나면 원래 사진 바로 뒤에 들어간다 (status)
   */
  async angles(input: { id?: unknown; keys?: unknown; angles?: unknown; confirmed?: unknown }) {
    if (input.confirmed !== true) throw new AppError("CONFIRM_REQUIRED", "확인 창에서 [만들기]를 눌러 주세요.", 409);
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    const provider = await getVideoAIProvider();
    if (!provider) throw new AppError("KIE_NOT_CONNECTED", "Kie AI 가 연결되어 있지 않습니다. 설정 › API 연결 센터에서 Kie AI 키를 넣어 주세요.", 409);
    const keys = (Array.isArray(input.keys) ? input.keys.map(String) : []).filter((k) => p.photos.some((ph) => ph.key === k));
    const angles = (Array.isArray(input.angles) ? input.angles.map(String) : []).filter((a) => STAY_ANGLES.some((x) => x.value === a));
    if (!keys.length || !angles.length) throw new AppError("VALIDATION", "사진과 각도를 골라 주세요.");
    const waiting = (p.angleTasks ?? []).filter((t) => t.state === "waiting").length;
    const room = STAY_MAX_PHOTOS - p.photos.length - waiting;
    const jobs = keys.flatMap((k) => angles.map((a) => ({ k, a }))).slice(0, Math.max(0, Math.min(12, room)));
    if (!jobs.length) throw new AppError("VALIDATION", `사진은 ${STAY_MAX_PHOTOS}장까지입니다. 안 쓰는 사진을 빼 주세요.`);
    const tasks = (p.angleTasks ??= []);
    const uploaded = new Map<string, string>();
    let created = 0;
    for (const { k, a } of jobs) {
      const t: StayAngleTask = { id: createId("sa"), sourceKey: k, angle: a, taskId: null, state: "waiting", error: null, createdAt: nowIso() };
      try {
        if (!uploaded.has(k)) {
          const buf = await videoStorage.download(k);
          if (!buf) throw new AppError("NOT_FOUND", "사진 파일이 없습니다.", 404);
          uploaded.set(k, await provider.uploadImage(buf));
        }
        const ang = STAY_ANGLES.find((x) => x.value === a)!;
        const prompt = `Re-photograph EXACTLY the same place shown in the reference photo of a Korean accommodation, from a different camera position: ${ang.en}. Keep the same architecture, materials, colors, furniture, season, weather and lighting; do not add or remove objects, and do not change the place. Photorealistic travel photography, natural light, vertical 9:16 composition. No people, no text, no logo, no watermark.`;
        const r = await provider.createTask("google/nano-banana-edit", { prompt, image_urls: [uploaded.get(k)!], output_format: "jpeg", aspect_ratio: "9:16" });
        t.taskId = r.taskId;
        created++;
        console.info("[Stay] angle", JSON.stringify({ project: p.id, angle: a, taskId: r.taskId }));
      } catch (e) {
        Object.assign(t, { state: "fail", error: e instanceof Error ? e.message.slice(0, 200) : "만들지 못했습니다." });
        tasks.push(t);
        if (e instanceof VideoAIError && (e.code === "AUTH" || e.code === "PAYMENT")) break;
        continue;
      }
      tasks.push(t);
    }
    p.angleTasks = tasks.slice(-60);
    return { project: await withUrls(await save(owner, list, p)), created };
  },

  /** 상태 확인 (무료): AI 컷 + 각도 사진 */
  async status(input: { id?: unknown; refetch?: unknown }) {
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    let changed = false;
    // v0.9.183 [다시 받기] (무료): Kie 에서는 만들어졌는데 우리 쪽에서 못 받은 각도 사진을 다시 받는다 (다시 만들지 않음)
    if (input.refetch === true) {
      for (const t of p.angleTasks ?? []) if (canRefetch(t)) Object.assign(t, { state: "waiting", error: null, refetch: false, createdAt: nowIso() });
      changed = true;
    }
    const busy = p.clips.filter((c) => c.state === "waiting" || c.state === "generating");
    if (busy.length) {
      const r = await aiClipService.status({ clips: p.clips });
      const byId = new Map(r.clips.map((c) => [c.id, c]));
      p.clips = p.clips.map((c) => ({ ...c, ...(byId.get(c.id) ?? {}), imageUrl: c.imageUrl }));
      changed = true;
    }
    const angleBusy = (p.angleTasks ?? []).filter((t) => t.state === "waiting" && t.taskId);
    if (angleBusy.length) {
      const provider = await getVideoAIProvider();
      for (const t of provider ? angleBusy : []) {
        try {
          const st = await provider!.status(t.taskId!);
          console.info("[Stay] angle status", JSON.stringify({ project: p.id, taskId: t.taskId, state: st.state, hasUrl: Boolean(st.resultUrl), error: st.error ? st.error.slice(0, 120) : null }));
          if (st.state === "waiting" || st.state === "generating") {
            if (Date.now() - Date.parse(t.createdAt) > ANGLE_TIMEOUT_MS) {
              Object.assign(t, { state: "fail", error: "15분이 지나도 끝나지 않았습니다. Kie 로그를 확인해 주세요." });
              changed = true;
            }
            continue;
          }
          changed = true;
          if (st.state === "fail" || !st.resultUrl) {
            Object.assign(t, { state: "fail", error: (st.error ?? "만들지 못했습니다.").slice(0, 200) });
            continue;
          }
          const src = p.photos.find((x) => x.key === t.sourceKey);
          if (!src || p.photos.length >= STAY_MAX_PHOTOS) throw new Error(src ? `사진은 ${STAY_MAX_PHOTOS}장까지입니다.` : "원래 사진을 뺐습니다.");
          let img: Buffer;
          if (serverConfig.providerMode !== "live" && st.resultUrl.startsWith("mock://")) {
            // 데모: 원래 사진을 그대로 (흐름 시험용)
            const b = await videoStorage.download(src.key);
            if (!b) throw new Error("원래 사진 파일이 없습니다.");
            img = b;
          } else {
            if (new URL(st.resultUrl).protocol !== "https:") throw new Error("결과 주소가 https 가 아닙니다.");
            const res = await safeFetch(st.resultUrl, { signal: AbortSignal.timeout(60_000), headers: { "User-Agent": UA, Accept: "image/*" } });
            if (!res.ok) throw new Error(`사진을 받지 못했습니다 (HTTP ${res.status}).`);
            img = Buffer.from(await res.arrayBuffer());
          }
          const key = `${owner}/stay/${p.id}/p${createId("ph").slice(-8)}.jpg`;
          await videoStorage.put(key, await coverJpeg(img), "image/jpeg");
          // 원래 사진(과 이미 들어간 같은 사진의 각도들) 바로 뒤에, 움직임은 원래 사진 것을 이어받는다
          let at = p.photos.findIndex((x) => x.key === src.key);
          while (at + 1 < p.photos.length && p.photos[at + 1].fromKey === src.key) at++;
          p.photos.splice(at + 1, 0, { key, line: "", motion: src.motion, motionKo: src.motionKo, sec: null, fromKey: src.key, angle: t.angle });
          t.state = "success";
          // 하나 받을 때마다 저장 (상태 확인이 중간에 끊겨도 받은 사진은 남게)
          await save(owner, list, p);
        } catch (e) {
          const msg = (e instanceof Error ? e.message : "받지 못했습니다.").slice(0, 200);
          console.warn("[Stay] angle fetch", JSON.stringify({ project: p.id, taskId: t.taskId, kie: e instanceof VideoAIError, error: msg }));
          if (e instanceof VideoAIError) {
            // Kie 확인이 잠깐 안 되는 것 → 다음 확인 때 다시 (오래 걸리면 위에서 실패로)
            t.error = `확인 중 오류 — 다시 확인합니다 (${msg})`;
          } else Object.assign(t, { state: "fail", error: msg, refetch: true });
          changed = true;
        }
      }
    }
    if (await pruneClipFiles(p)) changed = true;
    if (await keepClipFiles(owner, p)) changed = true;
    if (changed) await save(owner, list, p);
    return withUrls(p);
  },

  /** [영상 만들기]: 완성된 AI 컷으로 계획을 만들어 렌더 작업을 만든다 (렌더는 응답 뒤) */
  async render(input: { id?: unknown }, session: SessionInfo): Promise<VideoJob> {
    void session;
    const owner = await getCurrentUserId();
    const { list, p } = await own(owner, input.id);
    const voice = await lastVoiceSettings(owner).catch(() => ({}) as Partial<VideoPlan>);
    const scenes = p.photos
      .map((ph, i) => {
        const c = clipOf(p, ph.key);
        return c && c.state === "success" ? { index: i, narration: ph.line, sfx: null, arrow: false, attention: false, sourceVideoId: aiSourceId(c.id), pinned: true, holdSec: ph.sec ?? null } : null;
      })
      .filter((x): x is NonNullable<typeof x> => Boolean(x));
    if (!scenes.length) throw new AppError("VALIDATION", "완성된 AI 컷이 없습니다. ③ 살아 움직이게를 먼저 해 주세요.");
    if (!scenes.some((x) => x.narration.trim())) throw new AppError("VALIDATION", "대사가 하나도 없습니다. ② 제목·대사를 만들어 주세요.");
    const plan = {
      contentId: null,
      channelId: "youtube",
      selectedTitle: `${p.titleSmall} ${p.titleBig}`.trim() || p.name,
      topLine1: p.titleSmall,
      topLine2: p.titleBig,
      script: scenes.map((s) => s.narration).join("\n"),
      sourceMode: "ai",
      sourceVideoIds: [],
      scenes,
      ending: false,
      bgm: null,
      ...voice,
      ...(p.voice?.voice ? { ttsEngine: p.voice.ttsEngine, voice: p.voice.voice, ttsEmotion: p.voice.ttsEmotion, voiceStyle: p.voice.voiceStyle, voiceSpeed: p.voice.voiceSpeed ?? (voice as Partial<VideoPlan>).voiceSpeed } : {}),
      narrationOn: true,
      captions: true,
      meme: false,
      aiClips: p.clips,
      stay: true,
      titleSec: p.titleSec,
    } as unknown as VideoPlan;
    const job = await videoJobService.create({ plan });
    p.jobId = job.id;
    await save(owner, list, p);
    return job;
  },
};

/** 컷 시간: 1~5초 (AI 컷이 5초라 그 안에서), 0.5초 단위. 없으면 대사 길이만큼 */
function cleanSec(v: unknown): number | null {
  const n = Number(v);
  if (v == null || v === "" || !Number.isFinite(n) || n <= 0) return null;
  return Math.min(STAY_CUT_MAX_SEC, Math.max(1, Math.round(n * 2) / 2));
}

/** v0.9.174 같은 장소를 다른 각도로 만든 컷 묶음 → 대본 AI 에 알림 (대사는 컷마다 끊지 않고 이어서) */
function sameGroups(p: StayProject): string {
  const idx = new Map(p.photos.map((ph, i) => [ph.key, i + 1]));
  const groups = new Map<string, number[]>();
  for (const [i, ph] of p.photos.entries()) if (ph.fromKey && idx.has(ph.fromKey)) groups.set(ph.fromKey, [...(groups.get(ph.fromKey) ?? [idx.get(ph.fromKey)!]), i + 1]);
  if (!groups.size) return "";
  return `\n같은 장소를 여러 각도로 보여 주는 컷 묶음: ${[...groups.values()].map((g) => `[${g.join("·")}]`).join(" ")} — 묶음 안에서는 한 문장을 이어서 나눠 말한다 (예: "보는 사람마다 다" → "노천탕이에요" → "처마 밑 탕에").`;
}

// AI 컷 ↔ 사진 잇기 (clipKeys: 컷 id → 사진 key)
function clipOf(p: StayProject, key: string): AiClip | undefined {
  const id = Object.entries(p.clipKeys ?? {}).find(([, k]) => k === key)?.[0];
  return id ? p.clips.find((c) => c.id === id) : undefined;
}
function setClip(p: StayProject, key: string, clip: AiClip) {
  p.clipKeys = { ...(p.clipKeys ?? {}), [clip.id]: key };
  p.clips = [...p.clips.filter((c) => c.id !== clip.id), clip];
}
function nextClipId(p: StayProject): string {
  const used = new Set(p.clips.map((c) => c.id));
  for (let i = 1; i <= 99; i++) if (!used.has(`ai${i}`)) return `ai${i}`;
  throw new AppError("VALIDATION", "AI 컷이 너무 많습니다.");
}

/** v0.9.183 다시 받을 수 있는 각도 사진: Kie 가 실패라고 한 것이 아니고 작업 번호가 있는 것 (예전 기록은 오류 문구로 판단) */
export function canRefetch(t: StayAngleTask): boolean {
  if (t.state !== "fail" || !t.taskId) return false;
  if (t.refetch !== undefined) return t.refetch;
  return !/^AI 컷을 만들지 못했습니다|^15분이 지나도/.test(t.error ?? "");
}
