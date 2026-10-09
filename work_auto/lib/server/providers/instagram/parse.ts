import "server-only";
import type { IgReel } from "@/lib/types/instagram";

/**
 * TikHub 인스타그램 응답 → IgReel (v0.9.53).
 * 공식 문서에 응답 본문 구조가 없어(인스타그램 원본 그대로) 흔한 위치·이름을 너그럽게 읽는다. 없는 값은 null.
 * 흔한 모양: data.items[].media / data.reels[] / data.data.items[] … media = { code, caption.text, play_count|ig_play_count|view_count,
 * like_count, comment_count, taken_at, user.username, image_versions2.candidates[0].url, video_duration }
 */
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const pick = (o: Obj | undefined, ...keys: string[]): unknown => {
  if (!o) return undefined;
  for (const k of keys) {
    const v = k.split(".").reduce<unknown>((cur, part) => (cur && typeof cur === "object" ? (cur as Record<string, unknown>)[part] : undefined), o);
    if (v != null && v !== "") return v;
  }
  return undefined;
};
const num = (v: unknown): number | null => {
  const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? Math.round(n) : null;
};
const iso = (v: unknown): string | null => {
  const n = num(v);
  if (!n || n <= 0) return typeof v === "string" && !Number.isNaN(Date.parse(v)) ? new Date(v).toISOString() : null;
  return new Date(n < 1e12 ? n * 1000 : n).toISOString();
};

/** 미디어 객체처럼 보이는가 (code·shortcode 가 있고 영상/릴스) */
function looksLikeMedia(o: Obj): boolean {
  return typeof (o.code ?? o.shortcode) === "string" && (o.media_type === 2 || o.product_type === "clips" || o.is_video === true || "video_versions" in o || "play_count" in o || "ig_play_count" in o || "video_url" in o);
}

/** 응답 어디에 있든 미디어 객체를 모은다 (깊이 6까지) */
function collect(v: unknown, out: Obj[], depth = 0): void {
  if (depth > 6 || !v) return;
  if (Array.isArray(v)) {
    for (const x of v) collect(x, out, depth + 1);
    return;
  }
  if (!isObj(v)) return;
  if (looksLikeMedia(v)) {
    out.push(v);
    return;
  }
  for (const x of Object.values(v)) collect(x, out, depth + 1);
}

export function parseReel(m: Obj): IgReel | null {
  const code = String(m.code ?? m.shortcode ?? "");
  if (!/^[\w-]{5,40}$/.test(code)) return null;
  const caption = String(pick(m, "caption.text", "edge_media_to_caption.edges.0.node.text", "caption") ?? "").replace(/\s+/g, " ").trim();
  const hashtags = [...new Set((caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((h) => h.slice(1)))].slice(0, 20);
  const thumb = pick(m, "image_versions2.candidates.0.url", "image_versions.items.0.url", "thumbnail_url", "display_url", "thumbnail_src");
  return {
    code,
    url: `https://www.instagram.com/reel/${code}/`,
    caption: caption.slice(0, 500),
    hashtags,
    author: (pick(m, "user.username", "owner.username", "username") as string | undefined) ?? null,
    followers: num(pick(m, "user.follower_count", "owner.edge_followed_by.count", "user.followers")),
    plays: num(pick(m, "play_count", "ig_play_count", "view_count", "video_view_count", "video_play_count")),
    likes: num(pick(m, "like_count", "edge_liked_by.count", "edge_media_preview_like.count")),
    comments: num(pick(m, "comment_count", "edge_media_to_comment.count")),
    postedAt: iso(pick(m, "taken_at", "taken_at_timestamp", "device_timestamp")),
    thumbnailUrl: typeof thumb === "string" && /^https:\/\//.test(thumb) ? thumb : null,
    durationSec: num(pick(m, "video_duration", "clips_metadata.original_sound_info.duration_in_ms")) ?? null,
    videoUrl: (() => {
      const v = pick(m, "video_versions.0.url", "video_url", "video_versions.0.src", "clips_metadata.video_url");
      return typeof v === "string" && /^https:\/\//.test(v) ? v : null;
    })(),
  };
}

export function parseReelSearch(body: unknown): { items: IgReel[]; next: string | null } {
  const found: Obj[] = [];
  collect(isObj(body) ? (body.data ?? body) : body, found);
  const seen = new Set<string>();
  const items: IgReel[] = [];
  for (const m of found) {
    const r = parseReel(m);
    if (r && !seen.has(r.code)) {
      seen.add(r.code);
      items.push(r);
    }
  }
  const data = isObj(body) && isObj(body.data) ? body.data : undefined;
  const next = findToken(data);
  const hasMore = findKey(data, /^(has_more|more_available|has_next_page|hasMore)$/);
  return { items, next: next && hasMore !== false ? next : null };
}

/** 다음 페이지 토큰: 이름이 pagination_token·next_max_id·end_cursor·max_id·cursor 인 문자열·숫자 (깊이 4까지, 미디어 안은 보지 않음) */
const TOKEN_KEY = /^(pagination_token|paginationToken|next_max_id|nextMaxId|end_cursor|endCursor|next_cursor|max_id|cursor|next_page|nextPageToken)$/;
function findToken(v: unknown, depth = 0): string | null {
  if (!isObj(v) || depth > 4 || looksLikeMedia(v)) return null;
  for (const [k, x] of Object.entries(v)) if (TOKEN_KEY.test(k) && (typeof x === "string" || typeof x === "number") && String(x)) return String(x).slice(0, 500);
  for (const x of Object.values(v)) {
    const t = isObj(x) ? findToken(x, depth + 1) : null;
    if (t) return t;
  }
  return null;
}
function findKey(v: unknown, re: RegExp, depth = 0): unknown {
  if (!isObj(v) || depth > 4 || looksLikeMedia(v)) return undefined;
  for (const [k, x] of Object.entries(v)) if (re.test(k) && typeof x === "boolean") return x;
  for (const x of Object.values(v)) {
    const t = isObj(x) ? findKey(x, re, depth + 1) : undefined;
    if (t !== undefined) return t;
  }
  return undefined;
}

/** 응답 모양 요약 (값 없이 키 이름만 — 진단 로그용) */
export function shapeOf(body: unknown): string {
  const data = isObj(body) && isObj(body.data) ? body.data : body;
  if (!isObj(data)) return typeof data;
  return Object.entries(data)
    .slice(0, 12)
    .map(([k, v]) => `${k}:${Array.isArray(v) ? `[${v.length}]` : isObj(v) ? `{${Object.keys(v).slice(0, 8).join(",")}}` : typeof v}`)
    .join(" ");
}
