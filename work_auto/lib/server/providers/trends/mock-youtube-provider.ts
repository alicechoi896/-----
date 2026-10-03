import "server-only";
import { buildYouTubeTrendItems } from "@/lib/mock/youtube-trends";
import { matchesRanges, periodDaysOf } from "@/lib/domain/youtube";
import type { TrendScope, YouTubeTrendItem, YouTubeTrendPage, YouTubeTrendQuery } from "@/lib/types";
import { seededNumber } from "@/lib/utils";
import { serverConfig } from "../../config";
import type { VideoMeta, YouTubeTrendProvider, VideoStats } from "../types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 데모 데이터용 프로필 범위 판단: 관심 키워드·세부 관심분야를 "가전" 같은 공통 꼬리말을 떼고 비교한다.
 * (실제 YouTube 는 검색어 q 로 찾으므로 이 함수를 쓰지 않는다)
 */
function mockScopeMatch(haystack: string, scope: TrendScope): boolean {
  const generic = new Set(["추천", "가성비", "신혼", "꿀팁"]);
  const terms = [scope.mainCategory, ...scope.subCategories, ...scope.seedKeywords]
    .flatMap((t) => [t, t.replace(new RegExp(`${scope.mainCategory}$`), "")])
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 2 && !generic.has(t));
  return terms.some((t) => haystack.includes(t));
}

/** YouTube 트렌드 Mock — 필터·정렬 로직은 실제 Provider 에서도 같은 결과를 내야 한다 */
export class MockYouTubeTrendProvider implements YouTubeTrendProvider {
  readonly id = "mock-youtube";
  readonly kind = "youtube-trend" as const;
  readonly label = "YouTube (Mock)";

  async testConnection() {
    return { ok: true, message: "Mock YouTube 데이터를 사용합니다.", testedAt: new Date().toISOString(), mock: true };
  }

  async searchTrends(query: YouTubeTrendQuery): Promise<YouTubeTrendPage> {
    await sleep(Math.round(serverConfig.mockLatencyMs * 0.6));
    const now = Date.now();
    const keyword = query.keyword?.trim().toLowerCase();
    const from = new Date(query.publishedFrom).getTime();
    const to = query.publishedTo ? new Date(query.publishedTo).getTime() + 86_400_000 : now;

    const all = buildYouTubeTrendItems(now, periodDaysOf(query)).map((item) => ({ ...item, country: query.country }));
    const inSearch = all.filter((item) => {
      const t = new Date(item.publishedAt).getTime();
      if (t < from || t > to) return false;
      if (query.categoryId && item.categoryId !== query.categoryId) return false;
      const haystack = `${item.title} ${item.tags.join(" ")} ${item.channelName} ${item.category}`.toLowerCase();
      if (keyword) return haystack.includes(keyword);
      if (query.scope) return mockScopeMatch(haystack, query.scope);
      return true;
    });
    // 데모 데이터는 한 페이지뿐이다
    return { items: inSearch.filter((i) => matchesRanges(i, query)), nextPageToken: null, fetched: inSearch.length };
  }

  async getTrendItem(videoId: string): Promise<YouTubeTrendItem | null> {
    return buildYouTubeTrendItems(Date.now(), 30).find((i) => i.videoId === videoId) ?? null;
  }

  async getVideoMeta(url: string): Promise<VideoMeta> {
    await sleep(Math.round(serverConfig.mockLatencyMs * 0.6));
    const known = buildYouTubeTrendItems(Date.now(), 30).find((i) => i.url === url);
    if (known) {
      return {
        url,
        platform: "youtube",
        title: known.title,
        channelName: known.channelName,
        durationSec: known.durationSec,
        thumbnailColor: known.thumbnailColor,
      };
    }
    const isYouTube = /youtube\.com|youtu\.be/.test(url);
    const isNaver = /naver\.com|naver\.me/.test(url);
    const n = seededNumber(url, 1, 999);
    return {
      url,
      platform: isYouTube ? "youtube" : isNaver ? "naver" : "other",
      title: `가져온 참고 영상 #${n}`,
      channelName: isYouTube ? "YouTube 채널" : isNaver ? "NAVER 클립 크리에이터" : "알 수 없는 채널",
      durationSec: seededNumber(url + "d", 30, 900),
      thumbnailColor: ["#dbe4ff", "#ffe3e3", "#d3f9d8", "#fff3bf"][n % 4],
    };
  }

  /** 데모: 영상 ID 와 시간으로 그럴듯한 숫자 (시간이 지나면 늘어난다) */
  async getVideoStats(videoIds: string[]): Promise<Record<string, VideoStats>> {
    const hours = Math.floor(Date.now() / 3_600_000);
    return Object.fromEntries(
      videoIds.map((id) => {
        const base = seededNumber(id, 800, 40_000);
        const views = base + (hours % 1000) * 7;
        return [id, { views, likes: Math.round(views * 0.03), comments: Math.round(views * 0.002) }];
      }),
    );
  }
}
