import "server-only";
import type { ReferenceVideo } from "@/lib/types";
import { AppError } from "../http";
import { runWithoutPaidFallback } from "../automation/context";
import { resolveXiaohongshu, xhsNoteOf } from "../providers/video/xiaohongshu-resolver";
import { getCurrentUserId, getRepositories } from "../repositories";
import { videoStorage } from "./storage";

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

/** 7일 임시 캐시에 원본이 있는 영상 id */
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

/** 영상 제작에 쓸 수 있는가: 영구 링크(xhslink) 또는 임시 캐시에 원본이 있음 */
export const usableXhsVideo = (v: Pick<ReferenceVideo, "id" | "url" | "platform">, stored: Set<string>) => v.platform === "xiaohongshu" && (isShortXhsLink(v.url) || stored.has(v.id));

/**
 * 같은 영상의 공유 링크(xhslink)로 바꾸기. 같은 노트인지 확인하고, 실제로 열리는지 무료로 한 번 시험한다 (TikHub 안 씀).
 */
export async function relinkVideo(videoId: string, url: string): Promise<ReferenceVideo> {
  const owner = await getCurrentUserId();
  const video = await getRepositories().videos.get(String(videoId));
  if (!video || video.userId !== owner) throw new AppError("NOT_FOUND", "영상을 찾을 수 없습니다.", 404);
  if (video.platform !== "xiaohongshu") throw new AppError("VALIDATION", "샤오홍슈 영상만 바꿀 수 있습니다.");
  const link = url.trim().match(/https?:\/\/[^\s"'<>，。]+/i)?.[0] ?? "";
  if (!isShortXhsLink(link)) throw new AppError("BAD_URL", "샤오홍슈 앱에서 [공유] → 링크 복사한 xhslink.com 주소를 넣어 주세요 (공유 문구를 통째로 붙여 넣어도 됩니다).");
  const [a, b] = await Promise.all([xhsNoteOf(video.url).catch(() => null), xhsNoteOf(link).catch(() => null)]);
  if (!b) throw new AppError("BAD_URL", "이 공유 링크가 열리지 않습니다. 앱에서 다시 복사해 주세요.");
  if (a && a.noteId !== b.noteId) throw new AppError("VALIDATION", "다른 영상의 공유 링크입니다. 같은 영상의 링크를 넣어 주세요.");
  // 실제로 영상 주소가 나오는지 (무료, TikHub 로 넘어가지 않음)
  await runWithoutPaidFallback(() => resolveXiaohongshu(link)).catch((e) => {
    throw new AppError("XHS_BLOCKED", `공유 링크는 맞지만 지금 영상을 열지 못했습니다 (${e instanceof Error ? e.message.slice(0, 80) : "알 수 없음"}). 잠시 후 다시 시도해 주세요.`, 400);
  });
  console.info("[XhsLink] relink", JSON.stringify({ videoId: video.id, noteId: b.noteId }));
  return (await getRepositories().videos.update(video.id, { url: link }))!;
}
