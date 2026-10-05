import "server-only";
import { AppError } from "../../http";
import { getDouyinProvider } from "../registry";
import { XhsSearchError } from "../xiaohongshu/types";
import { douyinVideoUrl, type DouyinVideo } from "./types";

/**
 * 도우인 링크 → 영상 정보·재생 주소 (링크 붙여넣기 가져오기와 [다운로드]가 같이 쓴다). docs/SOCIAL_VIDEO_SOURCING.md
 * - TikHub fetch_one_video_by_share_url (APP, 비었을 때만 Web) — 회당 $0.001
 * - 검색 응답(Search V2)에 이미 재생 주소가 있으면 rememberDouyinVideos 로 기억해 두고 다운로드 때 그대로 쓴다 (API 0회)
 * - 재생 주소는 만료될 수 있어 서버 메모리에 20분만 둔다. DB 에는 저장하지 않는다
 * - 응답에 있는 주소만 쓴다 (만들어 붙이지 않음, 워터마크 없음도 보장하지 않음)
 */
export const RESOLVED_VIDEO_TTL_MS = 20 * 60 * 1000;
const cache = new Map<string, { at: number; value: DouyinVideo }>();

const keysOf = (v: DouyinVideo) => [v.shareUrl, douyinVideoUrl(v.awemeId)].map((k) => k.trim());

function put(key: string, value: DouyinVideo) {
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 1000) cache.delete(cache.keys().next().value!);
}

/** 검색 결과의 영상(재생 주소 포함)을 기억 — 저장한 뒤 바로 [다운로드]하면 TikHub 를 다시 부르지 않는다 */
export function rememberDouyinVideos(videos: DouyinVideo[]): void {
  for (const v of videos) if (v.playUrls.length) for (const k of keysOf(v)) put(k, v);
}

/** 테스트용 */
export function clearDouyinResolveCache(): void {
  cache.clear();
}

export async function resolveDouyin(url: string): Promise<DouyinVideo> {
  const key = url.trim();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < RESOLVED_VIDEO_TTL_MS) return hit.value;
  let video: DouyinVideo | null;
  try {
    video = await (await getDouyinProvider()).resolveShareUrl(key);
  } catch (e) {
    if (e instanceof XhsSearchError) throw new AppError(`TIKHUB_${e.code}`, e.message, e.code === "NOT_CONNECTED" ? 409 : e.code === "PAYMENT" ? 402 : e.code === "RATE_LIMIT" ? 429 : 502);
    throw e;
  }
  if (!video) throw new AppError("DOUYIN_UNAVAILABLE", "도우인 영상을 찾지 못했습니다. 삭제·비공개·지역 제한 영상이거나 링크가 잘못됐을 수 있습니다.", 404);
  put(key, video);
  for (const k of keysOf(video)) put(k, video);
  return video;
}
