import "server-only";
import { AppError } from "../../http";
import { getDouyinProvider } from "../registry";
import { XhsSearchError } from "../xiaohongshu/types";
import type { DouyinVideo } from "./types";

/**
 * 도우인 링크 → 영상 정보·재생 주소 (URL 가져오기와 다운로드가 같이 쓴다). docs/SOCIAL_VIDEO_SOURCING.md
 * - TikHub fetch_one_video_by_share_url (APP, 비었을 때만 Web) — 회당 $0.001
 * - 같은 링크는 10분 동안 다시 부르지 않는다 (가져오기 직후 다운로드 등)
 * - 재생 주소는 응답에 있는 것만 쓴다 (만들어 붙이지 않음, 워터마크 없음도 보장하지 않음)
 */
const cache = new Map<string, { at: number; value: DouyinVideo }>();
const TTL = 10 * 60 * 1000;

export async function resolveDouyin(url: string): Promise<DouyinVideo> {
  const key = url.trim();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.value;
  let video: DouyinVideo | null;
  try {
    video = await (await getDouyinProvider()).resolveShareUrl(key);
  } catch (e) {
    if (e instanceof XhsSearchError) throw new AppError(`TIKHUB_${e.code}`, e.message, e.code === "NOT_CONNECTED" ? 409 : e.code === "PAYMENT" ? 402 : e.code === "RATE_LIMIT" ? 429 : 502);
    throw e;
  }
  if (!video) throw new AppError("DOUYIN_UNAVAILABLE", "도우인 영상을 찾지 못했습니다. 삭제·비공개·지역 제한 영상이거나 링크가 잘못됐을 수 있습니다.", 404);
  cache.set(key, { at: Date.now(), value: video });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return video;
}
