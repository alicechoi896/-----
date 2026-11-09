import "server-only";
import type { ReferenceVideo } from "@/lib/types";
import { AppError } from "../http";
import { runWithoutPaidFallback } from "../automation/context";
import { getCurrentUserId, getRepositories } from "../repositories";
import { videoStorage } from "./storage";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { VIDEO_RENDER_CONFIG } from "@/lib/video-production/config";
import { fetchSource } from "./source";
import { runFfmpeg } from "./ffmpeg";

/**
 * 샤오홍슈 영구 링크 (v0.9.113) — 앱 [공유] 의 단축 링크 xhslink.com/… 는 몇 년이 지나도 살아 있고,
 * 열 때마다 샤오홍슈가 새 임시 열쇠(xsec_token)가 붙은 노트 주소로 넘겨 준다 → 받을 때마다 새로 열어 무료로 받는다 (2026-11-01 직접 확인).
 * 검색 결과로 가져온 긴 주소(xiaohongshu.com/explore/…?xsec_token=…)는 열쇠가 만료되면 열리지 않는다 → 같은 영상의 공유 링크로 바꾼다.
 * 원본 파일은 보관하지 않는다 (영상 제작이 쓰던 7일 임시 캐시 {owner}/src/{id}.mp4 만 그대로).
 */
export const isShortXhsLink = (url: string) => {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === "xhslink.com" || h.endsWith(".xhslink.com");
  } catch {
    return false;
  }
};

/** v0.9.148 보관 목록은 1분 동안 기억 (저장소 폴더를 매번 읽지 않게). 보관·삭제하면 지운다 */
const storedCache = new Map<string, { at: number; ids: Set<string> }>();
export const forgetStored = (owner: string) => storedCache.delete(owner);

/** 원본을 보관한 영상 id */
export async function storedVideoIds(owner?: string): Promise<Set<string>> {
  const o = owner ?? (await getCurrentUserId());
  const hit = storedCache.get(o);
  if (hit && Date.now() - hit.at < 60_000) return new Set(hit.ids);
  const out = await readStored(o);
  storedCache.set(o, { at: Date.now(), ids: out });
  return new Set(out);
}
async function readStored(o: string): Promise<Set<string>> {
  const out = new Set<string>();
  for (let offset = 0; offset < 20_000; offset += 1000) {
    const rows = await videoStorage.list(`${o}/src`, { limit: 1000, offset }).catch(() => []);
    for (const r of rows) {
      const name = r.key.split("/").pop() ?? "";
      if (name.endsWith(".mp4")) out.add(name.slice(0, -4));
    }
    if (rows.length < 1000) break;
  }
  return out;
}

/** 영상 제작에 쓸 수 있는가: 영구 링크(xhslink) 또는 임시 캐시에 원본이 있음 */
// v0.9.143: 원본을 보관했거나, 처음부터 공유 링크(xhslink)로 가져온 영상
export const usableXhsVideo = (v: Pick<ReferenceVideo, "id" | "url" | "platform">, stored: Set<string>) => v.platform === "xiaohongshu" && (isShortXhsLink(v.url) || stored.has(v.id));

/* ───── v0.9.114 TikHub 로 영구 공유 링크 받기 (확인 후, 하루 한도) ───── */
export const TIKHUB_DAILY = { usd: 0.5, perCallUsd: 0.01 } as const;
const kst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const usageKey = (owner: string) => `${owner}/auto/tikhub/${kst()}.json`;

export async function tikhubUsageToday(owner?: string): Promise<{ calls: number; limit: number }> {
  const o = owner ?? (await getCurrentUserId());
  const buf = await videoStorage.download(usageKey(o)).catch(() => null);
  let calls = 0;
  try {
    calls = buf ? Number((JSON.parse(buf.toString("utf8")) as { calls?: number }).calls) || 0 : 0;
  } catch {
    calls = 0;
  }
  return { calls, limit: Math.floor(TIKHUB_DAILY.usd / TIKHUB_DAILY.perCallUsd) };
}



/* ───── v0.9.134 원본 계속 보관 (영상을 가져올 때 받아 둔다 — 링크가 만료돼도 영상 제작·새벽 자동 제작에 쓴다) ───── */
export const srcKeyOf = (owner: string, videoId: string) => `${owner}/src/${videoId}.mp4`;

/** 샤오홍슈 영상 원본을 받아 Storage 에 보관 (무료 경로만, TikHub 안 씀). 이미 있으면 건너뜀. 성공하면 true */
export async function keepSource(videoId: string): Promise<{ kept: boolean; reason?: string }> {
  const owner = await getCurrentUserId();
  const video = await getRepositories().videos.get(String(videoId));
  if (!video || video.userId !== owner) return { kept: false, reason: "영상을 찾지 못했습니다." };
  if (video.platform !== "xiaohongshu") return { kept: false, reason: "샤오홍슈 영상만 보관합니다." };
  if ((await storedVideoIds(owner)).has(video.id)) return { kept: true };
  const dir = await mkdtemp(path.join(os.tmpdir(), "keep_"));
  try {
    const src = await runWithoutPaidFallback(() => fetchSource(video, dir, 0));
    let size = (await stat(src.file).catch(() => null))?.size ?? 0;
    if (!size) return { kept: false, reason: "원본을 받지 못했습니다." };
    let file = src.file;
    // v0.9.141: 크면 720p 로 줄여 보관 (화질은 쇼츠에 충분)
    if (size > VIDEO_RENDER_CONFIG.sourceCacheMaxBytes) {
      const small = path.join(dir, "small.mp4");
      await runFfmpeg(["-i", src.file, "-vf", "scale='if(gt(iw,ih),-2,720)':'if(gt(iw,ih),720,-2)'", "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-an", small], 240_000);
      file = small;
      size = (await stat(small).catch(() => null))?.size ?? 0;
      if (!size || size > VIDEO_RENDER_CONFIG.sourceCacheMaxBytes) return { kept: false, reason: "원본이 너무 커서 줄여도 45MB 를 넘습니다." };
    }
    await videoStorage.put(srcKeyOf(owner, video.id), await readFile(file), "video/mp4");
    forgetStored(owner);
    console.info("[XhsKeep]", JSON.stringify({ videoId: video.id, bytes: size }));
    await enforceSourceQuota(owner).catch(() => undefined);
    return { kept: true };
  } catch (e) {
    const reason = (e instanceof Error ? e.message : "받지 못했습니다.").slice(0, 160);
    console.warn("[XhsKeep] fail", JSON.stringify({ videoId: video.id, reason }));
    return { kept: false, reason };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}

/**
 * v0.9.142 [다운로드]로 브라우저가 받은 원본을 그대로 보관 — 서버는 샤오홍슈·TikHub 를 부르지 않는다 (올릴 주소만).
 */
export async function keepUploadUrl(videoId: string, size: number): Promise<{ url: string; method: "PUT" | "POST" } | { skip: string }> {
  const owner = await getCurrentUserId();
  const video = await getRepositories().videos.get(String(videoId));
  if (!video || video.userId !== owner) return { skip: "영상을 찾지 못했습니다." };
  if (video.platform !== "xiaohongshu") return { skip: "샤오홍슈 영상만 보관합니다." };
  if ((await storedVideoIds(owner)).has(video.id)) return { skip: "이미 보관했습니다." };
  if (!(size > 0) || size > VIDEO_RENDER_CONFIG.sourceCacheMaxBytes) return { skip: "45MB 를 넘어 보관하지 않습니다." };
  forgetStored(owner);
  return videoStorage.signedUpload(srcKeyOf(owner, video.id), "/api/videos/vault/upload");
}

/** 데모(Supabase 없음): 메모리에 올리기 */
export async function keepUploadMemory(key: string, body: ArrayBuffer): Promise<void> {
  const owner = await getCurrentUserId();
  if (!key.startsWith(`${owner}/src/`) || key.includes("..")) throw new AppError("VALIDATION", "잘못된 주소입니다.");
  await videoStorage.put(key, Buffer.from(body), "video/mp4");
}

/** 보관한 원본: 받은 지 7일(sourceCacheDays) 지난 것은 지우고, 합계가 한도(3GB)를 넘으면 오래된 것부터 지운다 (v0.9.187) */
export async function enforceSourceQuota(owner?: string): Promise<{ total: number; removed: number }> {
  const o = owner ?? (await getCurrentUserId());
  const all: { key: string; createdAt: string | null; size?: number }[] = [];
  for (let offset = 0; offset < 20000; offset += 1000) {
    const rows = await videoStorage.list(`${o}/src`, { limit: 1000, offset }).catch(() => []);
    all.push(...rows);
    if (rows.length < 1000) break;
  }
  let removed = 0;
  // 7일 지난 원본
  const maxAge = VIDEO_RENDER_CONFIG.sourceCacheDays * 24 * 60 * 60 * 1000;
  const fresh: typeof all = [];
  for (const f of all) {
    const at = Date.parse(f.createdAt ?? "");
    if (Number.isFinite(at) && Date.now() - at > maxAge) {
      await videoStorage.remove(f.key).catch(() => undefined);
      removed++;
    } else fresh.push(f);
  }
  if (removed) forgetStored(o);
  all.length = 0;
  all.push(...fresh);
  let total = all.reduce((n, f) => n + (f.size ?? 0), 0);
  const limit = VIDEO_RENDER_CONFIG.sourceKeepMaxBytes;
  if (total <= limit) {
    if (removed) console.info("[XhsKeep] old", JSON.stringify({ removed, total }));
    return { total, removed };
  }
  for (const f of [...all].sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""))) {
    if (total <= limit * 0.9) break;
    await videoStorage.remove(f.key).catch(() => undefined);
    forgetStored(o);
    total -= f.size ?? 0;
    removed++;
  }
  console.info("[XhsKeep] quota", JSON.stringify({ removed, total }));
  return { total, removed };
}

/** 여러 영상을 차례로 보관 (가져오기 뒤 응답 다음에) */
export async function keepSources(videoIds: string[]): Promise<void> {
  for (const id of videoIds.slice(0, 40)) await keepSource(id);
}
