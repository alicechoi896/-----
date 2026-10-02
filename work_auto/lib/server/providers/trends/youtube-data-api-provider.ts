import "server-only";
import { calcTrendScore } from "@/lib/domain/trend-score";
import type { YouTubeTrendItem, YouTubeTrendQuery } from "@/lib/types";
import { AppError } from "../../http";
import type { VideoMeta, YouTubeTrendProvider } from "../types";

/**
 * YouTube Data API v3 Provider (실제 연동).
 *
 * 트렌드 조회 흐름 (호출 1회당 할당량 약 102 units, 기본 할당량은 하루 10,000 units)
 *  1) search.list   기간 안에 게시된 영상을 조회수 순으로 최대 50개   100 units
 *  2) videos.list   조회수, 길이, 태그, 썸네일                          1 unit
 *  3) channels.list 구독자 수                                           1 unit
 *  4) calcTrendScore() 로 점수 계산 → YouTubeTrendItem
 *
 * 같은 조건은 6시간 동안 서버 메모리에 캐시해 할당량을 아낀다.
 * Shorts 판별: 길이 3분(180초) 이하 (2024년 10월부터 Shorts 최대 길이가 3분)
 */

const BASE = "https://www.googleapis.com/youtube/v3";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const SHORTS_MAX_SEC = 180;

const cache = new Map<string, { at: number; items: YouTubeTrendItem[] }>();

const THUMB_FALLBACK = ["#dbe4ff", "#ffe3e3", "#d3f9d8", "#fff3bf", "#e5dbff", "#c5f6fa"];

const STOPWORDS = new Set(["the", "and", "with", "shorts", "short", "영상", "이것", "정말", "진짜", "그리고", "하는", "있는", "없는"]);

interface SearchResponse {
  items: { id: { videoId?: string } }[];
}
interface VideosResponse {
  items: {
    id: string;
    snippet: {
      title: string;
      channelId: string;
      channelTitle: string;
      publishedAt: string;
      tags?: string[];
      thumbnails?: Record<string, { url: string }>;
    };
    statistics: { viewCount?: string };
    contentDetails: { duration: string };
  }[];
}
interface ChannelsResponse {
  items: { id: string; statistics: { subscriberCount?: string; hiddenSubscriberCount?: boolean } }[];
}

/** ISO 8601 기간(PT1H2M3S) → 초 */
export function parseIsoDuration(iso: string): number {
  const m = iso.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  const [, d, h, min, s] = m.map((v) => Number(v ?? 0));
  return d * 86400 + h * 3600 + min * 60 + s;
}

/** URL 에서 YouTube 영상 ID 추출 (watch?v=, youtu.be/, /shorts/, /embed/) */
export function extractYouTubeId(url: string): string | null {
  const m =
    url.match(/[?&]v=([\w-]{11})/) ??
    url.match(/youtu\.be\/([\w-]{11})/) ??
    url.match(/youtube\.com\/(?:shorts|embed|live)\/([\w-]{11})/);
  return m ? m[1] : null;
}

/** 태그가 없을 때 제목에서 키워드 후보를 뽑는다 */
function keywordsFromTitle(title: string): string[] {
  return Array.from(
    new Set(
      title
        .replace(/[#[\](){}|,.!?…"'“”‘’~:;/\\]/g, " ")
        .split(/\s+/)
        .map((w) => w.trim())
        .filter((w) => w.length >= 2 && !STOPWORDS.has(w.toLowerCase()) && !/^\d+$/.test(w)),
    ),
  ).slice(0, 3);
}

export class YouTubeDataApiProvider implements YouTubeTrendProvider {
  readonly id = "youtube-data-api";
  readonly kind = "youtube-trend" as const;
  readonly label = "YouTube Data API";

  constructor(private readonly apiKey: string) {}

  private async get<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") search.set(k, String(v));
    search.set("key", this.apiKey);
    const res = await fetch(`${BASE}/${path}?${search.toString()}`, { cache: "no-store" });
    if (res.ok) return (await res.json()) as T;

    // 오류 메시지에 API 키가 들어가지 않도록 reason 만 사용한다
    const body = (await res.json().catch(() => null)) as { error?: { errors?: { reason?: string }[] } } | null;
    const reason = body?.error?.errors?.[0]?.reason ?? "";
    if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
      throw new AppError("YOUTUBE_QUOTA", "YouTube API 일일 할당량을 모두 사용했습니다. 내일 다시 시도하거나 Google Cloud 에서 할당량을 늘려 주세요.", 429);
    }
    if (reason === "keyInvalid" || res.status === 400) {
      throw new AppError("YOUTUBE_KEY", "YouTube API 키가 올바르지 않습니다. API 연결 센터에서 키를 확인해 주세요.", 400);
    }
    if (res.status === 403) {
      throw new AppError("YOUTUBE_FORBIDDEN", "YouTube Data API 사용 권한이 없습니다. Google Cloud 에서 YouTube Data API v3 가 사용 설정되어 있는지, 키 제한에 포함되어 있는지 확인해 주세요.", 403);
    }
    throw new AppError("YOUTUBE_ERROR", `YouTube API 호출에 실패했습니다 (HTTP ${res.status}${reason ? `, ${reason}` : ""}).`, 502);
  }

  async testConnection() {
    const testedAt = new Date().toISOString();
    try {
      await this.get("videoCategories", { part: "snippet", regionCode: "KR" });
      return { ok: true, message: "YouTube Data API 에 정상적으로 연결되었습니다.", testedAt, mock: false };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "YouTube 서버에 연결할 수 없습니다.", testedAt, mock: false };
    }
  }

  async searchTrends(query: YouTubeTrendQuery): Promise<YouTubeTrendItem[]> {
    const q = [query.keyword?.trim(), query.category?.replace("/", " ")].filter(Boolean).join(" ");
    const cacheKey = JSON.stringify({ q, p: query.periodDays, f: query.format ?? "all" });
    const hit = cache.get(cacheKey);
    let items: YouTubeTrendItem[];

    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      items = hit.items;
    } else {
      items = await this.fetchTrends(q, query);
      cache.set(cacheKey, { at: Date.now(), items });
    }

    const filtered = items.filter((i) => !query.format || query.format === "all" || i.format === query.format);
    const sort = query.sort ?? "trendScore";
    return [...filtered].sort((a, b) =>
      sort === "publishedAt" ? b.publishedAt.localeCompare(a.publishedAt) : (b[sort] as number) - (a[sort] as number),
    );
  }

  private async fetchTrends(q: string, query: YouTubeTrendQuery): Promise<YouTubeTrendItem[]> {
    const now = Date.now();
    const search = await this.get<SearchResponse>("search", {
      part: "snippet",
      type: "video",
      order: "viewCount",
      regionCode: "KR",
      relevanceLanguage: "ko",
      maxResults: 50,
      publishedAfter: new Date(now - query.periodDays * 86_400_000).toISOString(),
      videoDuration: query.format === "shorts" ? "short" : undefined,
      q: q || undefined,
    });
    const ids = search.items.map((i) => i.id.videoId).filter((id): id is string => Boolean(id));
    if (ids.length === 0) return [];

    const videos = await this.get<VideosResponse>("videos", {
      part: "snippet,statistics,contentDetails",
      id: ids.join(","),
      maxResults: 50,
    });
    const channelIds = Array.from(new Set(videos.items.map((v) => v.snippet.channelId)));
    const channels = await this.get<ChannelsResponse>("channels", { part: "statistics", id: channelIds.join(","), maxResults: 50 });
    const subsByChannel = new Map(
      channels.items.map((c) => [c.id, c.statistics.hiddenSubscriberCount ? null : Number(c.statistics.subscriberCount ?? 0)]),
    );

    return videos.items.map((v, i) => {
      const views = Number(v.statistics.viewCount ?? 0);
      const ageDays = Math.max((now - new Date(v.snippet.publishedAt).getTime()) / 86_400_000, 1 / 24);
      const viewsPerDay = Math.round(views / Math.max(ageDays, 1));
      const durationSec = parseIsoDuration(v.contentDetails.duration);
      // 구독자 수를 숨긴 채널은 조회수와 같다고 보고 비율 점수를 중립(1배)으로 둔다
      const subs = subsByChannel.get(v.snippet.channelId) ?? views;
      const thumbs = v.snippet.thumbnails ?? {};
      return {
        id: `yt_${v.id}`,
        source: "youtube",
        videoId: v.id,
        url: `https://www.youtube.com/watch?v=${v.id}`,
        title: v.snippet.title,
        channelName: v.snippet.channelTitle,
        channelSubscribers: subs,
        thumbnailColor: THUMB_FALLBACK[i % THUMB_FALLBACK.length],
        thumbnailUrl: (thumbs.medium ?? thumbs.default ?? thumbs.high)?.url,
        category: query.category ?? "전체",
        keywords: (v.snippet.tags?.slice(0, 3) ?? []).length ? v.snippet.tags!.slice(0, 3) : keywordsFromTitle(v.snippet.title),
        format: durationSec > 0 && durationSec <= SHORTS_MAX_SEC ? "shorts" : "long",
        durationSec,
        views,
        viewsPerDay,
        publishedAt: v.snippet.publishedAt,
        collectedAt: new Date(now).toISOString(),
        trendScore: calcTrendScore({ views, viewsPerDay, channelSubscribers: subs, ageDays, periodDays: query.periodDays }),
      } satisfies YouTubeTrendItem;
    });
  }

  async getVideoMeta(url: string): Promise<VideoMeta> {
    const videoId = extractYouTubeId(url);
    if (!videoId) {
      // YouTube 가 아닌 영상(NAVER 클립 등)은 아직 메타데이터를 조회할 수 없어 기본 정보만 저장한다
      const host = (() => {
        try {
          return new URL(url).hostname;
        } catch {
          return "알 수 없는 주소";
        }
      })();
      return {
        url,
        platform: /naver/.test(host) ? "naver" : "other",
        title: `${host} 영상`,
        channelName: "-",
        durationSec: 0,
        thumbnailColor: THUMB_FALLBACK[0],
      };
    }
    const res = await this.get<VideosResponse>("videos", { part: "snippet,contentDetails,statistics", id: videoId });
    const v = res.items[0];
    if (!v) throw new AppError("VIDEO_NOT_FOUND", "영상을 찾을 수 없습니다. 비공개이거나 삭제된 영상일 수 있습니다.", 404);
    const thumbs = v.snippet.thumbnails ?? {};
    return {
      url: `https://www.youtube.com/watch?v=${v.id}`,
      platform: "youtube",
      title: v.snippet.title,
      channelName: v.snippet.channelTitle,
      durationSec: parseIsoDuration(v.contentDetails.duration),
      thumbnailColor: THUMB_FALLBACK[0],
      thumbnailUrl: (thumbs.medium ?? thumbs.default)?.url,
    };
  }
}
