import "server-only";
import type { ConnectionTestResult } from "@/lib/types";
import type { IgReel } from "@/lib/types/instagram";
import { nowIso } from "@/lib/utils";

/**
 * 인스타그램 해시태그 검색 — Meta 공식 Instagram Graph API (v0.9.57, 무료). docs/INSTAGRAM_TRENDS.md
 * - GET /{ig-user-id}/recently_searched_hashtags : 최근 7일에 찾은 해시태그 (한도 확인, 한도에 안 셈)
 * - GET /ig_hashtag_search?user_id=&q=           : 해시태그 → id (★ 7일에 서로 다른 해시태그 30개까지)
 * - GET /{hashtag-id}/top_media|recent_media      : 인기·최근(24시간) 게시물, 50개씩, after 커서
 * 조회수·작성자·썸네일은 공식 API 가 주지 않는다 (null). 영상은 media_url 로 바로 재생한다.
 * 토큰은 Authorization 헤더로만 보내고 로그·오류에 넣지 않는다.
 */
export const GRAPH_BASE = "https://graph.facebook.com/v23.0";
export const META_HASHTAG_LIMIT = 30;
const TIMEOUT_MS = 20_000;
const MEDIA_FIELDS = "id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count";

export type MetaErrorCode = "AUTH" | "PERMISSION" | "QUOTA" | "RATE_LIMIT" | "NOT_FOUND" | "TIMEOUT" | "UPSTREAM";

export class MetaGraphError extends Error {
  constructor(
    public code: MetaErrorCode,
    message: string,
  ) {
    super(message);
  }
}

type Obj = Record<string, unknown>;

export interface MetaQuota {
  used: number;
  limit: number;
}

export interface MetaHashtagSearch {
  items: IgReel[];
  next: string | null;
  quota: MetaQuota;
  /** 이번에 해시태그 한도를 1개 썼는지 (이번 주에 처음 찾은 해시태그) */
  newHashtag: boolean;
  /** 사진·앨범이라 뺀 수 */
  skipped: number;
}

export interface MetaInstagramProvider {
  readonly id: string;
  searchHashtag(tag: string, next?: string | null, kind?: "top" | "recent"): Promise<MetaHashtagSearch>;
}

export { toHashtag } from "@/lib/instagram";

/** Graph API 게시물 1개 → 화면용. 사진·앨범은 null (릴스만) */
export function parseMetaMedia(m: Obj): IgReel | null {
  if (String(m.media_type ?? "") !== "VIDEO") return null;
  const permalink = typeof m.permalink === "string" ? m.permalink : "";
  const code = permalink.match(/\/(?:reels?|p|tv)\/([\w-]+)/)?.[1] ?? String(m.id ?? "");
  if (!code) return null;
  const caption = typeof m.caption === "string" ? m.caption : "";
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    code,
    url: permalink || `https://www.instagram.com/reel/${code}/`,
    caption,
    hashtags: [...new Set((caption.match(/#[\p{L}\p{N}_]+/gu) ?? []).map((h) => h.slice(1)))].slice(0, 20),
    author: null,
    followers: null,
    plays: null,
    likes: num(m.like_count),
    comments: num(m.comments_count),
    postedAt: typeof m.timestamp === "string" ? new Date(m.timestamp).toISOString() : null,
    thumbnailUrl: null,
    durationSec: null,
    videoUrl: typeof m.media_url === "string" ? m.media_url : null,
  };
}

function errorFrom(status: number, body: Obj | null): MetaGraphError {
  const e = (body?.error ?? {}) as { code?: number; error_subcode?: number; message?: string };
  const code = Number(e.code ?? 0);
  const msg = String(e.message ?? "");
  if (code === 190 || status === 401) return new MetaGraphError("AUTH", "Instagram 공식 API 토큰이 올바르지 않거나 만료되었습니다. API 연결 센터에서 새 토큰을 넣어 주세요.");
  if (/hashtag/i.test(msg) && /limit|30/i.test(msg)) return new MetaGraphError("QUOTA", "이번 주 해시태그 검색 한도(30개)를 다 썼습니다. 이미 찾은 해시태그는 계속 볼 수 있습니다.");
  if ([4, 17, 32, 613].includes(code) || status === 429) return new MetaGraphError("RATE_LIMIT", "Instagram 공식 API 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.");
  if (code === 10 || code === 200 || status === 403)
    return new MetaGraphError("PERMISSION", "Instagram 공식 API 권한이 없습니다. Meta 앱에 instagram_basic 권한과 'Instagram Public Content Access' 기능이 승인되었는지 확인해 주세요.");
  if (code === 100 || status === 404) return new MetaGraphError("NOT_FOUND", "Instagram 비즈니스 계정 ID 또는 해시태그를 찾지 못했습니다. 연결 정보를 확인해 주세요.");
  return new MetaGraphError("UPSTREAM", `Instagram 공식 API 응답 오류 (HTTP ${status}). 잠시 후 다시 시도해 주세요.`);
}

export class GraphInstagramProvider implements MetaInstagramProvider {
  readonly id = "meta-instagram";
  readonly label = "Instagram 공식 API";
  /** 해시태그 → id (같은 서버 안에서 다시 찾지 않는다) */
  private static ids = new Map<string, string>();

  constructor(
    private readonly token: string,
    private readonly igUserId: string,
  ) {}

  private async get(path: string, params: Record<string, string>): Promise<Obj> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${GRAPH_BASE}${path}?${new URLSearchParams(params).toString()}`, {
        headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" },
        signal: ctrl.signal,
        cache: "no-store",
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw new MetaGraphError("TIMEOUT", "Instagram 공식 API 응답이 20초 안에 오지 않았습니다. 잠시 후 다시 시도해 주세요.");
      throw new MetaGraphError("UPSTREAM", "Instagram 공식 API 에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      clearTimeout(timer);
    }
    const body = (await res.json().catch(() => null)) as Obj | null;
    if (!res.ok || !body || body.error) throw errorFrom(res.status, body);
    return body;
  }

  /** 최근 7일에 찾은 해시태그 (id, 이름은 줄 때만) */
  private async recent(): Promise<{ id: string; name: string | null }[]> {
    const body = await this.get(`/${this.igUserId}/recently_searched_hashtags`, { fields: "id,name", limit: String(META_HASHTAG_LIMIT) });
    const data = Array.isArray(body.data) ? (body.data as Obj[]) : [];
    return data.map((d) => ({ id: String(d.id ?? ""), name: typeof d.name === "string" ? d.name.toLowerCase() : null })).filter((d) => d.id);
  }

  async searchHashtag(tag: string, next?: string | null, kind: "top" | "recent" = "top"): Promise<MetaHashtagSearch> {
    const name = tag.toLowerCase();
    const recent = await this.recent();
    let id = GraphInstagramProvider.ids.get(`${this.igUserId}:${name}`) ?? recent.find((r) => r.name === name)?.id ?? null;
    const already = Boolean(id && recent.some((r) => r.id === id));
    let newHashtag = false;
    if (!already) {
      // 한도를 다 썼으면 부르지 않는다 (Meta 가 거절)
      if (recent.length >= META_HASHTAG_LIMIT) throw new MetaGraphError("QUOTA", "이번 주 해시태그 검색 한도(30개)를 다 썼습니다. 이미 찾은 해시태그는 계속 볼 수 있습니다.");
      if (!id) {
        const found = await this.get("/ig_hashtag_search", { user_id: this.igUserId, q: name });
        id = String(((found.data as Obj[] | undefined) ?? [])[0]?.id ?? "") || null;
        if (!id) throw new MetaGraphError("NOT_FOUND", `#${tag} 해시태그를 찾지 못했습니다.`);
        GraphInstagramProvider.ids.set(`${this.igUserId}:${name}`, id);
      }
      newHashtag = true;
    }
    const params: Record<string, string> = { user_id: this.igUserId, fields: MEDIA_FIELDS, limit: "50" };
    if (next) params.after = next;
    const body = await this.get(`/${id}/${kind === "recent" ? "recent_media" : "top_media"}`, params);
    const raw = Array.isArray(body.data) ? (body.data as Obj[]) : [];
    const items = raw.map(parseMetaMedia).filter((r): r is IgReel => Boolean(r));
    const paging = (body.paging ?? {}) as { next?: string; cursors?: { after?: string } };
    return {
      items,
      next: paging.next && paging.cursors?.after ? paging.cursors.after : null,
      quota: { used: Math.min(META_HASHTAG_LIMIT, recent.length + (newHashtag ? 1 : 0)), limit: META_HASHTAG_LIMIT },
      newHashtag,
      skipped: raw.length - items.length,
    };
  }

  /** API 연결 센터 [테스트]: 계정 이름 확인 (한도에 안 셈) */
  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const me = await this.get(`/${this.igUserId}`, { fields: "username" });
      const recent = await this.recent().catch(() => null);
      return {
        ok: true,
        message: `@${String(me.username ?? "")} 계정으로 연결되었습니다${recent ? ` · 이번 주 해시태그 ${recent.length}/${META_HASHTAG_LIMIT}` : ""}`,
        testedAt: nowIso(),
        mock: false,
      };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "연결을 확인하지 못했습니다.", testedAt: nowIso(), mock: false };
    }
  }
}

const mockSearched = new Set<string>();

/** 데모: 가짜 해시태그 결과 (조회수·작성자 없음 = 실제 공식 API 와 같은 모양) */
export class MockMetaInstagramProvider implements MetaInstagramProvider {
  readonly id = "mock-meta-instagram";
  async searchHashtag(tag: string, next?: string | null): Promise<MetaHashtagSearch> {
    const s = mockSearched;
    const newHashtag = !s.has(tag);
    if (newHashtag && s.size >= META_HASHTAG_LIMIT) throw new MetaGraphError("QUOTA", "이번 주 해시태그 검색 한도(30개)를 다 썼습니다. 이미 찾은 해시태그는 계속 볼 수 있습니다.");
    s.add(tag);
    const page = next ? Number(next) || 1 : 0;
    const now = Date.now();
    const items: IgReel[] = Array.from({ length: 10 }, (_, i) => {
      const k = page * 10 + i;
      const likes = Math.round(60_000 / (k + 1.5));
      return {
        code: `META${String(k).padStart(4, "0")}${tag.length}`,
        url: `https://www.instagram.com/reel/META${String(k).padStart(4, "0")}/`,
        caption: `${tag} ${["사기 전에 꼭 볼 3가지", "이거 하나로 끝", "솔직 후기", "가성비 끝판왕", "모르면 손해"][k % 5]} #${tag} #추천템 #살림꿀팁`,
        hashtags: [tag, "추천템", "살림꿀팁"],
        author: null,
        followers: null,
        plays: null,
        likes,
        comments: Math.round(likes * 0.05),
        postedAt: new Date(now - (k + 1) * 86_400_000 * 1.3).toISOString(),
        thumbnailUrl: null,
        durationSec: null,
        videoUrl: null,
      };
    });
    return { items, next: page < 1 ? String(page + 1) : null, quota: { used: s.size, limit: META_HASHTAG_LIMIT }, newHashtag, skipped: 0 };
  }
}

/** 테스트용: 데모 한도 초기화 */
export function resetMockMetaQuota() {
  mockSearched.clear();
}
