import "server-only";
import { xhsNoteUrl, type XhsNote } from "./types";

/**
 * TikHub(샤오홍슈 App) 응답 → XhsNote.
 * 공식 문서에는 응답 본문 구조가 없어(ResponseModel.data = 샤오홍슈 원본) 여러 위치·이름을 너그럽게 읽는다.
 * 없는 값은 null 로 둔다 — 화면에 만들어 넣지 않는다.
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

/** "1.2万", "3.4w", "12,345", 123 → 숫자 */
export function parseCount(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : null;
  if (typeof v !== "string") return null;
  const s = v.trim().replace(/,/g, "");
  const m = s.match(/^([\d.]+)\s*(万|w|W|千|k|K)?\+?$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const mul = m[2] === "万" || m[2] === "w" || m[2] === "W" ? 10_000 : m[2] === "千" || m[2] === "k" || m[2] === "K" ? 1_000 : 1;
  return Math.round(n * mul);
}

/** 초·밀리초 타임스탬프 → ISO */
function toIso(v: unknown): string | null {
  const n = typeof v === "string" && /^\d+$/.test(v) ? Number(v) : typeof v === "number" ? v : null;
  if (n == null || n <= 0) return null;
  const ms = n < 1e12 ? n * 1000 : n;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** 영상 길이: 초 또는 밀리초 */
function toSeconds(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n > 3600 ? n / 1000 : n);
}

const NOTE_ID = /^[0-9a-f]{24}$/i;

/** 응답 안의 노트 목록을 찾는다 (items[].note / items[] / notes[] …) */
function findItems(data: unknown): unknown[] {
  const candidates = [
    pick(data as Obj, "data.data.items", "data.items", "items", "data.data.notes", "data.notes", "notes"),
  ];
  for (const c of candidates) if (Array.isArray(c)) return c;
  // 마지막 수단: 노트 ID 를 가진 객체 배열을 찾아 내려간다
  const seen = new Set<unknown>();
  const walk = (v: unknown, depth: number): unknown[] | null => {
    if (depth > 6 || !v || typeof v !== "object" || seen.has(v)) return null;
    seen.add(v);
    if (Array.isArray(v)) {
      if (v.some((x) => isObj(x) && (NOTE_ID.test(String(pick(x, "id", "note_id", "note.id", "note.note_id", "note_card.id", "note_card.note_id") ?? ""))))) return v;
      for (const x of v) {
        const r = walk(x, depth + 1);
        if (r) return r;
      }
      return null;
    }
    for (const x of Object.values(v)) {
      const r = walk(x, depth + 1);
      if (r) return r;
    }
    return null;
  };
  return walk(data, 0) ?? [];
}

export function parseNote(item: unknown): XhsNote | null {
  if (!isObj(item)) return null;
  const note = (isObj(item.note) ? item.note : isObj(item.note_card) ? item.note_card : item) as Obj;
  const noteId = String(pick(note, "id", "note_id") ?? pick(item, "id", "note_id") ?? "");
  if (!NOTE_ID.test(noteId)) return null;
  const type = String(pick(note, "type", "note_type", "model_type") ?? "");
  // 영상만 (타입이 있으면 확인, 없으면 영상 정보가 있는지)
  const hasVideo = Boolean(pick(note, "video_info_v2", "video_info", "video", "video.media"));
  if (type && type !== "video" && !hasVideo) return null;
  if (!type && !hasVideo) return null;
  const xsecToken = (pick(note, "xsec_token") ?? pick(item, "xsec_token") ?? null) as string | null;
  const title = String(pick(note, "display_title", "title") ?? "").trim();
  const desc = String(pick(note, "desc", "description") ?? "").trim() || null;
  const cover = pick(note, "images_list.0.url", "images_list.0.url_size_large", "cover.url", "cover.url_default", "cover.url_pre", "image_list.0.url", "video_info_v2.image.thumbnail", "thumbnail");
  return {
    noteId,
    xsecToken: xsecToken ? String(xsecToken) : null,
    url: xhsNoteUrl(noteId, xsecToken ? String(xsecToken) : null),
    title: title || (desc ? desc.slice(0, 40) : "제목 없음"),
    desc,
    author: (pick(note, "user.nickname", "user.nick_name", "user.name", "author.nickname") as string | undefined) ?? null,
    coverUrl: typeof cover === "string" ? cover.replace(/^http:\/\//, "https://") : null,
    publishedAt: toIso(pick(note, "timestamp", "time", "publish_time", "create_time", "last_update_time")),
    likes: parseCount(pick(note, "liked_count", "likes", "interact_info.liked_count", "like_count")),
    comments: parseCount(pick(note, "comments_count", "comment_count", "interact_info.comment_count")),
    collects: parseCount(pick(note, "collected_count", "collect_count", "interact_info.collected_count")),
    durationSec: toSeconds(pick(note, "video_info_v2.capa.duration", "video_info.duration", "video.capa.duration", "video.duration", "duration")),
  };
}

export function parseSearchResponse(data: unknown): { notes: XhsNote[]; rawCount: number; searchId?: string; sessionId?: string; hasMore: boolean } {
  const items = findItems(data);
  const notes: XhsNote[] = [];
  const seen = new Set<string>();
  for (const it of items) {
    const n = parseNote(it);
    if (n && !seen.has(n.noteId)) {
      seen.add(n.noteId);
      notes.push(n);
    }
  }
  const d = data as Obj;
  const searchId = pick(d, "data.data.search_id", "data.search_id", "search_id") as string | undefined;
  const sessionId = pick(d, "data.data.search_session_id", "data.search_session_id", "search_session_id", "data.data.session_id") as string | undefined;
  const more = pick(d, "data.data.has_more", "data.has_more", "has_more");
  return { notes, rawCount: items.length, searchId, sessionId, hasMore: more == null ? items.length > 0 : Boolean(more) };
}
