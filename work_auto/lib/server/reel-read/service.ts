import "server-only";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createId, nowIso } from "@/lib/utils";
import { serverConfig } from "../config";
import { AppError } from "../http";
import { getAIProvider, getInstagramProvider, loadCredentials } from "../providers/registry";
import { getCurrentUserId } from "../repositories";
import { safeFetch } from "../security/safe-url";
import { scriptFormatService } from "../services/script-formats";
import { mediaDuration, runFfmpeg } from "../video/ffmpeg";
import { videoStorage } from "../video/storage";

/**
 * 릴스 읽기 (v0.9.175) — 릴스 1개를 받아 말소리 받아쓰기 + 장면마다 화면 설명 + 구조 분석.
 * - 영상: 직접 올리기(무료, Storage 에 바로) 또는 인스타그램 주소 → TikHub 1회 (누를 때만, 확인 후)
 * - 장면: FFmpeg 장면 바뀜(scene > 0.3, 최소 0.6초 간격, 최대 16장) → 장면마다 사진 1장
 * - 말: OpenAI 음성 받아쓰기 (whisper-1, 1분 약 $0.006) · [읽기] AI 1번 (사진 + 받아쓰기 → 요약·장면별·첫 3초·구조·아이디어)
 * 저장 {owner}/reels/list.json · 영상·사진 (DB 변경 없음). 남의 릴스는 공부용 (그대로 다시 올리지 않기)
 */
const MAX_BYTES = 80 * 1024 * 1024;
const MAX_SCENES = 16;

export interface ReelScene {
  t: number;
  frameKey: string;
  screen: string;
  speech: string;
}
export interface ReelRead {
  id: string;
  name: string;
  url: string | null;
  videoKey: string | null;
  duration: number | null;
  transcript: { t: number; end: number; text: string }[];
  summary: string[];
  scenes: ReelScene[];
  first3s: string;
  structure: { hook: string; body: string; cta: string };
  ideas: string[];
  /** 내 분야 (아이디어용) */
  field: string;
  state: "new" | "ready" | "read" | "fail";
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

const listKey = (owner: string) => `${owner}/reels/list.json`;
async function readAll(owner: string): Promise<ReelRead[]> {
  const buf = await videoStorage.download(listKey(owner)).catch(() => null);
  try {
    return buf ? (JSON.parse(buf.toString("utf8")) as ReelRead[]) : [];
  } catch {
    return [];
  }
}
async function writeAll(owner: string, list: ReelRead[]) {
  await videoStorage.put(listKey(owner), Buffer.from(JSON.stringify(list.slice(0, 60))), "application/json", "0");
}
async function own(owner: string, id: unknown) {
  const list = await readAll(owner);
  const r = list.find((x) => x.id === String(id ?? ""));
  if (!r) throw new AppError("NOT_FOUND", "릴스 읽기 기록을 찾을 수 없습니다.", 404);
  return { list, r };
}
async function save(owner: string, list: ReelRead[], r: ReelRead) {
  r.updatedAt = nowIso();
  await writeAll(owner, [r, ...list.filter((x) => x.id !== r.id)]);
  return r;
}
async function withUrls(r: ReelRead) {
  const keys = [...(r.videoKey ? [r.videoKey] : []), ...r.scenes.map((s) => s.frameKey)];
  const urls = keys.length ? await videoStorage.urls(keys, 3600).catch(() => ({}) as Record<string, string>) : {};
  return { ...r, urls };
}
const blank = (owner: string, name: string, url: string | null): ReelRead => {
  const id = createId("reel");
  return { id, name, url, videoKey: null, duration: null, transcript: [], summary: [], scenes: [], first3s: "", structure: { hook: "", body: "", cta: "" }, ideas: [], field: "", state: "new", error: null, createdAt: nowIso(), updatedAt: nowIso() };
};
const vkey = (owner: string, id: string) => `${owner}/reels/${id}/video.mp4`;

/** 인스타그램 릴스 주소 → 코드 */
function reelCode(url: string): string | null {
  const m = url.match(/^https:\/\/(?:www\.)?instagram\.com\/(?:[\w.]+\/)?(?:reel|reels|p)\/([\w-]{5,40})/i);
  return m ? m[1] : null;
}

/** 장면 바뀌는 시각 (0 포함) */
async function sceneTimes(file: string, dur: number): Promise<number[]> {
  const r = await runFfmpeg(["-i", file, "-filter:v", "select='gt(scene,0.3)',showinfo", "-f", "null", "-"], 120_000).catch(() => null);
  const raw = [...(r?.stderr ?? "").matchAll(/pts_time:([0-9.]+)/g)].map((m) => Number(m[1])).filter((t) => Number.isFinite(t));
  const out = [0];
  for (const t of raw) if (t - out[out.length - 1] >= 0.6 && t < dur - 0.2) out.push(t);
  // 장면이 너무 적으면(한 장면 영상) 2초마다
  if (out.length < 3 && dur > 4) for (let t = 2; t < dur - 0.5; t += 2) if (!out.some((x) => Math.abs(x - t) < 0.8)) out.push(t);
  out.sort((a, b) => a - b);
  if (out.length > MAX_SCENES) {
    const step = out.length / MAX_SCENES;
    return Array.from({ length: MAX_SCENES }, (_, i) => out[Math.floor(i * step)]);
  }
  return out;
}

/** OpenAI 음성 받아쓰기 (구간 시각 포함). 키가 없으면 빈 결과 + 안내 */
async function transcribe(audio: Buffer): Promise<{ t: number; end: number; text: string }[] | null> {
  if (serverConfig.providerMode !== "live") return [{ t: 0.2, end: 2, text: "이거 모르면 진짜 손해예요" }, { t: 2.2, end: 5, text: "딱 세 가지만 기억하세요" }];
  const cred = await loadCredentials("openai");
  if (!cred) return null;
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(audio)], { type: "audio/mpeg" }), "audio.mp3");
  form.append("model", "whisper-1");
  form.append("language", "ko");
  form.append("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "segment");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${cred.apiKey}` }, body: form, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new AppError("TRANSCRIBE", `받아쓰기를 하지 못했습니다 (OpenAI HTTP ${res.status}).`, 502);
  const j = (await res.json()) as { segments?: { start: number; end: number; text: string }[]; text?: string };
  const segs = (j.segments ?? []).map((s) => ({ t: Math.round(s.start * 10) / 10, end: Math.round(s.end * 10) / 10, text: String(s.text ?? "").trim() })).filter((s) => s.text);
  return segs.length ? segs : j.text ? [{ t: 0, end: 0, text: j.text.trim() }] : [];
}

const str = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export const reelReadService = {
  async list() {
    return (await readAll(await getCurrentUserId())).map((r) => ({ id: r.id, name: r.name, state: r.state, updatedAt: r.updatedAt }));
  },
  async get(id: unknown) {
    const { r } = await own(await getCurrentUserId(), id);
    return withUrls(r);
  },
  async remove(id: unknown) {
    const owner = await getCurrentUserId();
    const { list, r } = await own(owner, id);
    for (const k of [r.videoKey, ...r.scenes.map((s) => s.frameKey)]) if (k) await videoStorage.remove(k).catch(() => undefined);
    await writeAll(owner, list.filter((x) => x.id !== r.id));
    return { ok: true };
  },

  /** 직접 올리기 1: 올릴 주소 (브라우저가 Storage 에 바로) */
  async uploadUrl(input: { name?: unknown; size?: unknown }) {
    const owner = await getCurrentUserId();
    if (Number(input.size) > MAX_BYTES) throw new AppError("VALIDATION", "영상이 너무 큽니다 (80MB 이하).");
    const list = await readAll(owner);
    const r = blank(owner, str(input.name, 60).replace(/\.[a-z0-9]+$/i, "") || "올린 릴스", null);
    r.videoKey = vkey(owner, r.id);
    await save(owner, list, r);
    return { id: r.id, ...(await videoStorage.signedUpload(r.videoKey, "/api/reel-read/upload")) };
  },
  /** 데모(Supabase 없음): 영상 본문을 메모리에 */
  async uploadMemory(id: string, body: ArrayBuffer) {
    const owner = await getCurrentUserId();
    const { r } = await own(owner, id);
    if (body.byteLength > MAX_BYTES) throw new AppError("VALIDATION", "영상이 너무 큽니다 (80MB 이하).");
    await videoStorage.put(r.videoKey ?? vkey(owner, r.id), Buffer.from(body), "video/mp4");
  },

  /** 인스타그램 주소 → TikHub 1회로 영상 받기 (확인 필수, 자동 재시도 없음) */
  async fromUrl(input: { url?: unknown; confirmed?: unknown }) {
    if (input.confirmed !== true) throw new AppError("CONFIRM_REQUIRED", "확인 창에서 [받기]를 눌러 주세요.", 409);
    const url = String(input.url ?? "").trim();
    const code = reelCode(url);
    if (!code) throw new AppError("VALIDATION", "인스타그램 릴스 주소(https://www.instagram.com/reel/…)를 넣어 주세요.");
    const owner = await getCurrentUserId();
    const list = await readAll(owner);
    const r = blank(owner, `릴스 ${code}`, url.slice(0, 300));
    const provider = await getInstagramProvider();
    const reel = await provider.fetchReel(code);
    console.info("[ReelRead] tikhub", JSON.stringify({ code, found: Boolean(reel?.videoUrl) }));
    if (!reel?.videoUrl) throw new AppError("NO_VIDEO", "이 릴스의 영상 주소를 받지 못했습니다 (비공개·삭제·막힘). 영상을 저장해 [영상 올리기]로 넣어 주세요.", 422);
    if (reel.caption) r.name = str(reel.caption, 40) || r.name;
    const res = await safeFetch(reel.videoUrl, { signal: AbortSignal.timeout(90_000) });
    if (!res.ok) throw new AppError("UPSTREAM", `영상을 받지 못했습니다 (HTTP ${res.status}). [영상 올리기]로 넣어 주세요.`, 502);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_BYTES) throw new AppError("VALIDATION", "영상이 너무 큽니다 (80MB 이하).");
    r.videoKey = vkey(owner, r.id);
    await videoStorage.put(r.videoKey, buf, "video/mp4");
    return withUrls(await save(owner, list, r));
  },

  /** [읽기] 장면 사진 뽑기 + 받아쓰기(OpenAI) + AI 1번 분석 */
  async read(input: { id?: unknown; field?: unknown }) {
    const owner = await getCurrentUserId();
    const { list, r } = await own(owner, input.id);
    r.field = str(input.field, 80);
    const buf = r.videoKey ? await videoStorage.download(r.videoKey) : null;
    if (!buf) throw new AppError("VALIDATION", "영상이 아직 없습니다. 다시 올려 주세요.");
    const dir = await mkdtemp(path.join(os.tmpdir(), "reel-"));
    try {
      const file = path.join(dir, "v.mp4");
      await writeFile(file, buf);
      const dur = await mediaDuration(file).catch(() => 0);
      if (!dur) throw new AppError("VALIDATION", "영상을 읽지 못했습니다. mp4 로 다시 올려 주세요.");
      r.duration = Math.round(dur * 10) / 10;
      // 장면 사진
      for (const s of r.scenes) await videoStorage.remove(s.frameKey).catch(() => undefined);
      const times = await sceneTimes(file, dur);
      const frames: { t: number; key: string; b64: string }[] = [];
      for (const [i, t] of times.entries()) {
        const jpg = path.join(dir, `f${i}.jpg`);
        const ok = await runFfmpeg(["-y", "-ss", (t + 0.15).toFixed(2), "-i", file, "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "4", jpg], 60_000).catch(() => null);
        if (!ok) continue;
        const img = await readFile(jpg).catch(() => null);
        if (!img) continue;
        const key = `${owner}/reels/${r.id}/f${String(i).padStart(2, "0")}_${Date.now().toString(36)}.jpg`;
        await videoStorage.put(key, img, "image/jpeg");
        frames.push({ t, key, b64: img.toString("base64") });
      }
      // 받아쓰기 (소리가 없으면 건너뜀)
      const mp3 = path.join(dir, "a.mp3");
      const hasAudio = await runFfmpeg(["-y", "-i", file, "-vn", "-ac", "1", "-ar", "16000", "-b:a", "48k", mp3], 90_000).then(() => true).catch(() => false);
      const tr = hasAudio ? await transcribe(await readFile(mp3)) : [];
      r.transcript = tr ?? [];
      const noKey = tr === null;
      // AI 분석 1번
      const ai = await getAIProvider();
      type Out = { summary: string[]; scenes: { screen: string; speech: string }[]; first3s: string; hook: string; body: string; cta: string; ideas: string[] };
      let out: Out;
      if (ai.id === "mock") {
        out = { summary: ["첫 장면에서 손해를 짚어 멈추게 한다", "세 가지를 하나씩 보여 준다", "저장을 부탁하며 끝낸다"], scenes: frames.map((_, i) => ({ screen: `장면 ${i + 1} 화면`, speech: r.transcript[i]?.text ?? "" })), first3s: "큰 글자 + '모르면 손해' 말로 멈추게 함", hook: "손실 회피 질문", body: "3가지 나열", cta: "저장 유도", ideas: ["우리 제품으로 '모르면 손해' 3가지", "전/후 비교 컷", "마지막에 저장 유도"] };
      } else {
        const said = r.transcript.map((s) => `[${s.t.toFixed(1)}~${s.end.toFixed(1)}초] ${s.text}`).join("\n") || "(말소리 없음)";
        const r2 = await ai.generateStructured<Out>({
          task: "reel-read",
          messages: [
            { role: "system", content: "당신은 한국 숏폼(릴스·쇼츠) 분석가다. 장면 사진과 받아쓰기를 보고 사실대로 정리한다. 추측은 '~로 보임'. 답은 JSON 하나." },
            {
              role: "user",
              content: [
                { type: "text" as const, text: `릴스 길이 ${r.duration}초. 장면이 바뀌는 곳마다 사진 1장 (시각 표시).\n[받아쓰기]\n${said}${noKey ? "\n(받아쓰기 없음: OpenAI 키가 연결되지 않음 — 화면 글자로만 판단)" : ""}` },
                ...frames.flatMap((f) => [{ type: "text" as const, text: `[${f.t.toFixed(1)}초 장면]` }, { type: "image" as const, mediaType: "image/jpeg" as const, data: f.b64 }]),
                {
                  type: "text" as const,
                  text: `정리:
- summary: 원본 요약 3줄
- scenes: 위 장면 순서대로 ${frames.length}개. screen = 그 화면에 무엇이 보이는지(구도·인물·제품·화면 글자 포함, 한 문장), speech = 그 장면 시간에 나온 말 (받아쓰기에서, 없으면 빈 문자열)
- first3s: 첫 3초에 어떤 화면과 말로 멈추게 했는지
- hook·body·cta: 첫 3초 / 중간 전개 / 마지막 행동 유도 구조를 한 줄씩
- ideas: 내 분야에 바꿔 쓸 아이디어 3개 (내 분야: ${r.field || "제품·숙소 홍보 숏폼"}). 원본 영상·대본을 그대로 베끼지 않고 구조만 빌린다.`,
                },
              ],
            },
          ],
          outputKeys: ["summary", "scenes", "first3s", "hook", "body", "cta", "ideas"],
          jsonSchema: {
            type: "object",
            additionalProperties: false,
            required: ["summary", "scenes", "first3s", "hook", "body", "cta", "ideas"],
            properties: {
              summary: { type: "array", items: { type: "string" } },
              scenes: { type: "array", items: { type: "object", additionalProperties: false, required: ["screen", "speech"], properties: { screen: { type: "string" }, speech: { type: "string" } } } },
              first3s: { type: "string" },
              hook: { type: "string" },
              body: { type: "string" },
              cta: { type: "string" },
              ideas: { type: "array", items: { type: "string" } },
            },
          },
          variables: { reel: r.id, scenes: frames.length },
          maxTokens: 3500,
        });
        out = r2.data;
      }
      r.summary = (out.summary ?? []).map((x) => str(x, 200)).slice(0, 3);
      r.scenes = frames.map((f, i) => ({ t: Math.round(f.t * 10) / 10, frameKey: f.key, screen: str(out.scenes?.[i]?.screen, 300), speech: str(out.scenes?.[i]?.speech, 300) }));
      r.first3s = str(out.first3s, 300);
      r.structure = { hook: str(out.hook, 200), body: str(out.body, 200), cta: str(out.cta, 200) };
      r.ideas = (out.ideas ?? []).map((x) => str(x, 300)).slice(0, 3);
      r.state = "read";
      r.error = noKey ? "OpenAI 키가 없어 받아쓰기 없이 화면만 읽었습니다 (설정 › API 연결 센터)." : null;
      console.info("[ReelRead] read", JSON.stringify({ id: r.id, dur: r.duration, scenes: frames.length, segs: r.transcript.length }));
      return withUrls(await save(owner, list, r));
    } finally {
      await rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
  },

  /** [대본 포맷에 담기] 받아쓴 대본을 참고 대본으로 + 첫 3초 말을 Hook 으로 (무료) */
  async toFormat(input: { id?: unknown; formatId?: unknown; newFormat?: { name?: unknown; contentType?: unknown } | null }) {
    const owner = await getCurrentUserId();
    const { r } = await own(owner, input.id);
    const text = r.transcript.map((s) => s.text).join("\n").trim();
    if (!text) throw new AppError("VALIDATION", "받아쓴 말이 없습니다 (말소리가 없는 릴스이거나 [읽기] 전).");
    const hook = r.transcript.filter((s) => s.t < 3.5).map((s) => s.text).join(" ").trim().slice(0, 80);
    const example = { title: r.name, views: null, text: text.slice(0, 3000) };
    const formatId = typeof input.formatId === "string" ? input.formatId : "";
    if (!formatId) {
      const format = await scriptFormatService.create({ name: str(input.newFormat?.name, 40) || `릴스에서 · ${r.name.slice(0, 20)}`, contentType: input.newFormat?.contentType === "info" ? "info" : "product", channelIds: [], examples: [example], guideline: "", isDefault: false, hooks: hook ? [hook] : [] } as Parameters<typeof scriptFormatService.create>[0]);
      return { format: { id: format.id, name: format.name } };
    }
    const cur = (await scriptFormatService.list()).find((f) => f.id === formatId);
    if (!cur) throw new AppError("NOT_FOUND", "대본 포맷을 찾을 수 없습니다.", 404);
    const format = await scriptFormatService.update(formatId, { ...cur, examples: [example, ...cur.examples].slice(0, 30), hooks: hook ? [hook, ...(cur.hooks ?? []).filter((h) => h !== hook)] : cur.hooks } as Parameters<typeof scriptFormatService.update>[1]);
    return { format: { id: format.id, name: format.name } };
  },
};
