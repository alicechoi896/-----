import "server-only";
import { calcTrendScore } from "@/lib/domain/trend-score";
import { SHORTS_MAX_SEC, YOUTUBE_COUNTRIES, categoryLabel, matchesRanges, periodDaysOf } from "@/lib/domain/youtube";
import type { YouTubeTrendItem, YouTubeTrendPage, YouTubeTrendQuery } from "@/lib/types";
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

/** 우리 사이트 주소 (Vercel 이 운영 도메인을 자동으로 넣어 준다. 다른 도메인을 쓰면 APP_ORIGIN 으로 지정) */
const SITE_ORIGIN =
  process.env.APP_ORIGIN ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

interface CachedPage {
  at: number;
  items: YouTubeTrendItem[];
  nextPageToken: string | null;
}
const cache = new Map<string, CachedPage>();

const THUMB_FALLBACK = ["#dbe4ff", "#ffe3e3", "#d3f9d8", "#fff3bf", "#e5dbff", "#c5f6fa"];

const STOPWORDS = new Set(["the", "and", "with", "shorts", "short", "영상", "이것", "정말", "진짜", "그리고", "하는", "있는", "없는"]);

interface SearchResponse {
  items: { id: { videoId?: string } }[];
  nextPageToken?: string;
}
interface VideosResponse {
  items: {
    id: string;
    snippet: {
      title: string;
      description?: string;
      categoryId?: string;
      channelId: string;
      channelTitle: string;
      publishedAt: string;
      tags?: string[];
      thumbnails?: Record<string, { url: string }>;
    };
    statistics: { viewCount?: string; likeCount?: string; commentCount?: string };
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

type VideoResource = VideosResponse["items"][number];

/** videos.list 응답 1건 → YouTubeTrendItem */
function toItem(
  v: VideoResource,
  index: number,
  now: number,
  periodDays: number,
  subscribers: number | null | undefined,
  country: string,
): YouTubeTrendItem {
  const views = Number(v.statistics.viewCount ?? 0);
  const ageDays = Math.max((now - new Date(v.snippet.publishedAt).getTime()) / 86_400_000, 1 / 24);
  const viewsPerDay = Math.round(views / Math.max(ageDays, 1));
  const durationSec = parseIsoDuration(v.contentDetails.duration);
  // 구독자 수를 숨긴 채널은 조회수와 같다고 보고 비율 점수를 중립(1배)으로 둔다
  const subs = subscribers ?? views;
  const thumbs = v.snippet.thumbnails ?? {};
  // 대소문자만 다른 중복 태그는 하나로
  const tags = [...new Map((v.snippet.tags ?? []).map((t) => [t.trim().toLowerCase(), t.trim()])).values()].filter(Boolean);
  return {
    id: `yt_${v.id}`,
    source: "youtube",
    videoId: v.id,
    url: `https://www.youtube.com/watch?v=${v.id}`,
    title: v.snippet.title,
    channelId: v.snippet.channelId,
    channelName: v.snippet.channelTitle,
    channelSubscribers: subs,
    thumbnailColor: THUMB_FALLBACK[index % THUMB_FALLBACK.length],
    thumbnailUrl: (thumbs.medium ?? thumbs.default ?? thumbs.high)?.url,
    category: categoryLabel(v.snippet.categoryId),
    keywords: tags.length ? tags.slice(0, 3) : keywordsFromTitle(v.snippet.title),
    tags: tags.slice(0, 30),
    description: (v.snippet.description ?? "").slice(0, 500),
    country,
    format: durationSec > 0 && durationSec <= SHORTS_MAX_SEC ? "shorts" : "long",
    durationSec,
    views,
    viewsPerDay,
    commentCount: v.statistics.commentCount != null ? Number(v.statistics.commentCount) : null,
    likeCount: v.statistics.likeCount != null ? Number(v.statistics.likeCount) : null,
    publishedAt: v.snippet.publishedAt,
    collectedAt: new Date(now).toISOString(),
    trendScore: calcTrendScore({ views, viewsPerDay, channelSubscribers: subs, ageDays, periodDays }),
  };
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
    // API 키에 '웹사이트(HTTP 리퍼러)' 제한을 건 경우에도 동작하도록 우리 사이트 주소를 Referer 로 보낸다.
    // (서버 요청에는 원래 Referer 가 없어 API_KEY_HTTP_REFERRER_BLOCKED 로 거절된다)
    const res = await fetch(`${BASE}/${path}?${search.toString()}`, {
      cache: "no-store",
      headers: SITE_ORIGIN ? { Referer: `${SITE_ORIGIN}/` } : undefined,
    });
    if (res.ok) return (await res.json()) as T;

    // Google 오류 응답에서 원인 코드만 읽는다 (오류 메시지에 API 키를 넣지 않는다)
    const body = (await res.json().catch(() => null)) as {
      error?: { errors?: { reason?: string }[]; details?: { reason?: string }[] };
    } | null;
    const reason = body?.error?.errors?.[0]?.reason ?? "";
    const detail = body?.error?.details?.find((d) => d.reason)?.reason ?? "";
    const code = [reason, detail].filter(Boolean).join(" / ");
    const suffix = code ? ` [${code}]` : ` [HTTP ${res.status}]`;

    if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
      throw new AppError("YOUTUBE_QUOTA", `YouTube API 일일 할당량을 모두 사용했습니다. 내일 다시 시도하거나 Google Cloud 에서 할당량을 늘려 주세요.${suffix}`, 429);
    }
    if (detail === "API_KEY_HTTP_REFERRER_BLOCKED" || detail === "API_KEY_IP_ADDRESS_BLOCKED" || detail === "API_KEY_ANDROID_APP_BLOCKED" || detail === "API_KEY_IOS_APP_BLOCKED") {
      throw new AppError(
        "YOUTUBE_KEY_RESTRICTED",
        `API 키에 '애플리케이션 제한사항'(웹사이트·IP 등)이 걸려 있어 서버에서 호출할 수 없습니다. Google Cloud → 사용자 인증 정보 → 해당 API 키 → 애플리케이션 제한사항을 '없음'으로 바꿔 주세요. (API 제한사항은 YouTube Data API v3 로 그대로 두면 됩니다)${suffix}`,
        403,
      );
    }
    if (detail === "API_KEY_SERVICE_BLOCKED") {
      throw new AppError(
        "YOUTUBE_KEY_API_RESTRICTED",
        `API 키의 'API 제한사항'에 YouTube Data API v3 가 포함되어 있지 않습니다. Google Cloud → 사용자 인증 정보 → 해당 키 → API 제한사항에서 YouTube Data API v3 를 체크해 주세요.${suffix}`,
        403,
      );
    }
    if (reason === "accessNotConfigured" || detail === "SERVICE_DISABLED") {
      throw new AppError(
        "YOUTUBE_API_DISABLED",
        `이 Google Cloud 프로젝트에서 YouTube Data API v3 가 사용 설정되어 있지 않습니다. API 및 서비스 → 라이브러리 → YouTube Data API v3 → [사용] 을 눌러 주세요. 켠 직후에는 몇 분 걸릴 수 있습니다.${suffix}`,
        403,
      );
    }
    if (reason === "keyInvalid" || detail === "API_KEY_INVALID" || res.status === 400) {
      throw new AppError(
        "YOUTUBE_KEY",
        `YouTube API 키가 올바르지 않습니다. 'AIza' 로 시작하는 API 키인지 확인해 주세요. (OAuth 클라이언트 ID·보안 비밀번호는 여기에 넣지 않습니다)${suffix}`,
        400,
      );
    }
    if (res.status === 403) {
      throw new AppError("YOUTUBE_FORBIDDEN", `YouTube Data API 사용이 거절되었습니다. 키 제한과 API 사용 설정을 확인해 주세요.${suffix}`, 403);
    }
    throw new AppError("YOUTUBE_ERROR", `YouTube API 호출에 실패했습니다.${suffix}`, 502);
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

  async searchTrends(query: YouTubeTrendQuery): Promise<YouTubeTrendPage> {
    // 검색 API 가 지원하는 조건만 캐시 키에 넣는다. 구독자·조회수·댓글 조건은 받아온 뒤 거른다
    const cacheKey = JSON.stringify([
      query.country,
      query.categoryId ?? "",
      query.keyword?.trim() ?? "",
      query.publishedFrom,
      query.publishedTo ?? "",
      query.format === "shorts" ? "short" : "",
      query.pageToken ?? "",
    ]);
    const hit = cache.get(cacheKey);
    let page: CachedPage;
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      page = hit;
    } else {
      page = { at: Date.now(), ...(await this.fetchPage(query)) };
      cache.set(cacheKey, page);
      if (cache.size > 300) cache.delete(cache.keys().next().value!);
    }
    return { items: page.items.filter((i) => matchesRanges(i, query)), nextPageToken: page.nextPageToken, fetched: page.items.length };
  }

  private async fetchPage(query: YouTubeTrendQuery): Promise<{ items: YouTubeTrendItem[]; nextPageToken: string | null }> {
    const now = Date.now();
    const country = YOUTUBE_COUNTRIES.find((c) => c.code === query.country) ?? YOUTUBE_COUNTRIES[0];
    const periodDays = periodDaysOf(query, now);
    const search = await this.get<SearchResponse>("search", {
      part: "snippet",
      type: "video",
      order: "viewCount",
      regionCode: country.code,
      relevanceLanguage: country.lang,
      maxResults: 50,
      publishedAfter: new Date(query.publishedFrom).toISOString(),
      publishedBefore: query.publishedTo ? new Date(new Date(query.publishedTo).getTime() + 86_400_000).toISOString() : undefined,
      videoCategoryId: query.categoryId,
      videoDuration: query.format === "shorts" ? "short" : undefined,
      q: query.keyword?.trim() || undefined,
      pageToken: query.pageToken,
    });
    const nextPageToken = search.nextPageToken ?? null;
    const ids = search.items.map((i) => i.id.videoId).filter((id): id is string => Boolean(id));
    if (ids.length === 0) return { items: [], nextPageToken };

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

    const items = videos.items.map((v, i) => toItem(v, i, now, periodDays, subsByChannel.get(v.snippet.channelId), country.code));
    return { items, nextPageToken };
  }

  /** 영상 ID 로 트렌드 항목 1개 조회 (북마크·생성 화면의 참고 트렌드용, 2 units) */
  async getTrendItem(videoId: string): Promise<YouTubeTrendItem | null> {
    const res = await this.get<VideosResponse>("videos", { part: "snippet,statistics,contentDetails", id: videoId });
    const v = res.items[0];
    if (!v) return null;
    const ch = await this.get<ChannelsResponse>("channels", { part: "statistics", id: v.snippet.channelId });
    const c = ch.items[0];
    const subs = c && !c.statistics.hiddenSubscriberCount ? Number(c.statistics.subscriberCount ?? 0) : undefined;
    return toItem(v, 0, Date.now(), 30, subs, "KR");
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
