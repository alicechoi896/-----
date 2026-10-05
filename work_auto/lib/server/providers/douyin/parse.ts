import "server-only";
import { parseCount } from "../xiaohongshu/parse";
import { douyinVideoUrl, type DouyinSearchPage, type DouyinVideo } from "./types";

/**
 * TikHub 도우인 응답 → DouyinVideo.
 * 문서 기준 (fetch_video_search_v2): business_data[].data.aweme_info { aweme_id, desc, create_time, author.nickname,
 *   video.play_addr.url_list, video.cover.url_list, video.duration(ms), statistics.digg_count/comment_count/collect_count/share_count, share_url },
 *   cursor, has_more(1/0). 단일 영상(fetch_one_video_by_share_url)은 aweme_detail 등 — 위치가 달라도 aweme_id 를 가진 객체를 찾는다.
 */
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const at = (o: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((cur, k) => (cur && typeof cur === "object" ? (cur as Obj)[k] : undefined), o);
const first = (o: unknown, ...paths: string[]) => {
  for (const p of paths) {
    const v = at(o, p);
    if (v != null && v !== "") return v;
  }
  return undefined;
};
const urls = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && /^https?:\/\//.test(x)) : []);

function toIso(v: unknown): string | null {
  const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : typeof v === "number" ? v : null;
  if (n == null || n <= 0) return null;
  const d = new Date(n < 1e12 ? n * 1000 : n);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function parseAweme(a: unknown): DouyinVideo | null {
  if (!isObj(a)) return null;
  const awemeId = String(first(a, "aweme_id", "aweme_id_str") ?? "");
  if (!/^\d{8,25}$/.test(awemeId)) return null;
  // 영상만 (이미지 묶음 aweme_type 68 등은 images 가 있다)
  if (Array.isArray(a.images) && a.images.length && !at(a, "video.play_addr")) return null;
  const desc = String(first(a, "desc", "preview_title") ?? "").trim() || null;
  const dur = Number(first(a, "video.duration", "duration") ?? NaN);
  const play = [
    ...urls(at(a, "video.play_addr.url_list")),
    ...(Array.isArray(at(a, "video.bit_rate")) ? (at(a, "video.bit_rate") as unknown[]).flatMap((b) => urls(at(b, "play_addr.url_list"))) : []),
  ];
  const share = first(a, "share_url", "share_info.share_url");
  return {
    awemeId,
    title: (desc ?? "").split("\n")[0].slice(0, 80) || "제목 없음",
    desc,
    author: (first(a, "author.nickname") as string | undefined) ?? null,
    coverUrl: urls(first(a, "video.cover.url_list", "video.origin_cover.url_list", "video.dynamic_cover.url_list"))[0] ?? null,
    shareUrl: typeof share === "string" && /^https?:\/\//.test(share) ? share : douyinVideoUrl(awemeId),
    publishedAt: toIso(first(a, "create_time")),
    durationSec: Number.isFinite(dur) && dur > 0 ? Math.round(dur > 1000 ? dur / 1000 : dur) : null,
    likes: parseCount(first(a, "statistics.digg_count")),
    comments: parseCount(first(a, "statistics.comment_count")),
    collects: parseCount(first(a, "statistics.collect_count")),
    shares: parseCount(first(a, "statistics.share_count")),
    playUrls: [...new Set(play)],
  };
}

/** aweme_id 를 가진 객체를 모두 찾는다 (응답 위치가 조금 달라도) */
function findAwemes(data: unknown): unknown[] {
  const list = first(data, "data.business_data", "data.data.business_data", "business_data");
  if (Array.isArray(list)) return list.map((x) => first(x, "data.aweme_info", "aweme_info") ?? x);
  const out: unknown[] = [];
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number) => {
    if (depth > 7 || !v || typeof v !== "object" || seen.has(v)) return;
    seen.add(v);
    if (isObj(v) && v.aweme_id && (v.video || v.desc != null)) {
      out.push(v);
      return;
    }
    for (const x of Array.isArray(v) ? v : Object.values(v)) walk(x, depth + 1);
  };
  walk(data, 0);
  return out;
}

export function parseDouyinSearch(data: unknown): DouyinSearchPage {
  const raw = findAwemes(data);
  const seen = new Set<string>();
  const videos: DouyinVideo[] = [];
  for (const a of raw) {
    const v = parseAweme(a);
    if (v && !seen.has(v.awemeId)) {
      seen.add(v.awemeId);
      videos.push(v);
    }
  }
  const cursor = Number(first(data, "data.cursor", "data.data.cursor", "cursor"));
  const more = first(data, "data.has_more", "data.data.has_more", "has_more");
  return {
    videos,
    rawCount: raw.length,
    cursor: Number.isFinite(cursor) ? cursor : undefined,
    searchId: (first(data, "data.search_id", "data.extra.search_request_id", "data.log_pb.impr_id", "data.data.search_id") as string | undefined) ?? undefined,
    backtrace: (first(data, "data.backtrace", "data.data.backtrace") as string | undefined) ?? undefined,
    hasMore: more == null ? raw.length > 0 : more === 1 || more === true || more === "1",
  };
}

/** 단일 영상 응답: 비었거나 볼 수 없는 영상(filter_list)이면 null */
export function parseDouyinOne(data: unknown): DouyinVideo | null {
  const a = first(data, "data.aweme_detail", "data.aweme_details.0", "data.data.aweme_detail", "aweme_detail");
  return parseAweme(a) ?? parseDouyinSearch(data).videos[0] ?? null;
}
