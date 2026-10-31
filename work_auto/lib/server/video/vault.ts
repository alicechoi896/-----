import "server-only";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ReferenceVideo } from "@/lib/types";
import { AppError } from "../http";
import { runWithoutPaidFallback } from "../automation/context";
import { xhsNoteOf } from "../providers/video/xiaohongshu-resolver";
import { getCurrentUserId, getRepositories } from "../repositories";
import { fetchSource, SourceError } from "./source";
import { videoStorage } from "./storage";
import { VIDEO_RENDER_CONFIG } from "@/lib/video-production/config";

/**
 * 영상 파일 보관함 (v0.9.112) — 샤오홍슈 링크의 임시 열쇠(xsec_token)가 살아 있을 때 원본 파일을 받아 보관해 두고,
 * 영상 제작·새벽 자동 제작은 보관한 파일을 쓴다 (링크가 만료돼도, TikHub 없이).
 * 보관 위치는 영상 제작이 원래 쓰던 원본 캐시와 같다: {owner}/src/{videoId}.mp4 (제품에 연결된 영상은 7일이 지나도 지우지 않는다).
 * 받기는 샤오홍슈 무료 경로만 (TikHub 대체 경로는 쓰지 않음). 막히면 [링크 새로 넣기] 또는 [파일 올리기].
 */
export const vaultKey = (owner: string, videoId: string) => `${owner}/src/${videoId}.mp4`;
const MAX_BYTES = VIDEO_RENDER_CONFIG.maxSourceBytes;

/** 보관된 영상 id 목록 */
export async function storedVideoIds(owner?: string): Promise<Set<string>> {
  const o = owner ?? (await getCurrentUserId());
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

async function ownVideo(videoId: string): Promise<{ owner: string; video: ReferenceVideo }> {
  const owner = await getCurrentUserId();
  const video = await getRepositories().videos.get(String(videoId));
  if (!video || video.userId !== owner) throw new AppError("NOT_FOUND", "영상을 찾을 수 없습니다.", 404);
  return { owner, video };
}

/** 영상들의 보관 상태 */
export async function vaultStatus(ids: string[]): Promise<Record<string, boolean>> {
  const stored = await storedVideoIds();
  return Object.fromEntries(ids.slice(0, 1000).map((id) => [id, stored.has(id)]));
}

/**
 * 무료로 받아 보관 (샤오홍슈 페이지 → 영상 서버). newUrl 을 주면 같은 노트의 새 공유 링크로 바꾼 뒤 받는다.
 * TikHub 로 넘어가지 않는다.
 */
export async function vaultFetch(videoId: string, newUrl?: string): Promise<{ stored: boolean; sizeMB: number }> {
  const { owner, video } = await ownVideo(videoId);
  if (video.platform !== "xiaohongshu") throw new AppError("VALIDATION", "샤오홍슈 영상만 받아 둘 수 있습니다.");
  let v = video;
  if (newUrl?.trim()) {
    const url = newUrl.trim();
    if (!/^https?:\/\//.test(url) || !/xiaohongshu\.com|xhslink\.com/.test(url)) throw new AppError("BAD_URL", "샤오홍슈 공유 링크를 넣어 주세요.");
    const [a, b] = await Promise.all([xhsNoteOf(video.url).catch(() => null), xhsNoteOf(url).catch(() => null)]);
    if (!b) throw new AppError("BAD_URL", "링크에서 샤오홍슈 노트를 찾지 못했습니다. 앱에서 공유 → 링크 복사한 주소를 넣어 주세요.");
    if (a && a.noteId !== b.noteId) throw new AppError("VALIDATION", "다른 영상의 링크입니다. 같은 영상의 공유 링크를 넣어 주세요.");
    v = (await getRepositories().videos.update(video.id, { url }))!;
  }
  const dir = await mkdtemp(path.join(os.tmpdir(), "vault_"));
  try {
    const src = await runWithoutPaidFallback(() => fetchSource(v, dir, 0)).catch((e) => {
      const msg = e instanceof SourceError || e instanceof Error ? e.message : String(e);
      throw new AppError("VAULT_FETCH", `${msg} — [링크 새로 넣기]에 앱에서 새로 복사한 공유 링크를 넣거나, [파일 올리기]로 mp4 를 올려 주세요.`, 400);
    });
    const buf = await readFile(src.file);
    if (buf.length > MAX_BYTES) throw new AppError("VALIDATION", `원본이 너무 큽니다 (${Math.round(buf.length / 1048576)}MB, 최대 ${Math.round(MAX_BYTES / 1048576)}MB).`);
    await videoStorage.put(vaultKey(owner, v.id), buf, "video/mp4");
    console.info("[Vault] fetch", JSON.stringify({ videoId: v.id, mb: Math.round(buf.length / 104857.6) / 10, newUrl: Boolean(newUrl) }));
    return { stored: true, sizeMB: Math.round(buf.length / 104857.6) / 10 };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** 직접 올리기 1) 주소 — 허락받아 가진 mp4 를 그 영상의 원본으로 */
export async function vaultUploadUrl(videoId: string, size: number, fileName: string): Promise<{ url: string; method: "PUT" | "POST"; contentType: string }> {
  const { owner, video } = await ownVideo(videoId);
  if (!/\.(mp4|mov)$/i.test(fileName)) throw new AppError("VALIDATION", "mp4·mov 파일만 올릴 수 있습니다.");
  if (!(size > 0) || size > MAX_BYTES) throw new AppError("VALIDATION", `파일은 ${Math.round(MAX_BYTES / 1048576)}MB 까지 올릴 수 있습니다.`);
  const up = await videoStorage.signedUpload(vaultKey(owner, video.id), "/api/videos/vault/upload");
  return { ...up, contentType: "video/mp4" };
}

/** 데모(Supabase 없음)에서만: 서버 메모리에 올리기 */
export async function vaultUploadMemory(key: string, body: ArrayBuffer): Promise<void> {
  const owner = await getCurrentUserId();
  if (!key.startsWith(`${owner}/src/`) || key.includes("..") || !key.endsWith(".mp4")) throw new AppError("VALIDATION", "잘못된 주소입니다.");
  await videoStorage.put(key, Buffer.from(body), "video/mp4");
}

/** 가져온 직후 받아 두기 (링크가 막 복사돼 열쇠가 살아 있을 때). 실패해도 가져오기는 그대로 — 조용히 넘어간다 */
export async function vaultAfterImport(videos: ReferenceVideo[]): Promise<void> {
  for (const v of videos.filter((x) => x.platform === "xiaohongshu").slice(0, 10)) {
    await vaultFetch(v.id).catch((e) => console.warn("[Vault] after import", JSON.stringify({ videoId: v.id, error: e instanceof Error ? e.message.slice(0, 120) : "?" })));
  }
}
