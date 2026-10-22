import "server-only";
import { buildYouTubeTrendItems } from "@/lib/mock/youtube-trends";
import { matchesRanges, periodDaysOf } from "@/lib/domain/youtube";
import type { TrendScope, YouTubeTrendItem, YouTubeTrendPage, YouTubeTrendQuery } from "@/lib/types";
import { seededNumber } from "@/lib/utils";
import { serverConfig } from "../../config";
import type { KeywordEvidenceVideo, VideoMeta, YouTubeTrendProvider, VideoStats } from "../types";

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
  /** 데모: 검색어로 만든 가짜 관련 영상 (외부 호출 없음) */
  async keywordEvidence(seed: string, max: number): Promise<KeywordEvidenceVideo[]> {
    const angles = ["후기", "장단점", "구매 전 꼭 볼 것", "비교", "추천", "언박싱", "사용법", "가성비", "자급제", "카메라 테스트", "배터리", "할인"];
    return Array.from({ length: Math.min(max, 12) }, (_, i) => ({
      title: `${seed} ${angles[i % angles.length]} | 한 달 써 보니`,
      description: `${seed} ${angles[(i + 3) % angles.length]} 정리. ${angles[(i + 5) % angles.length]}`,
      tags: [seed, `${seed} ${angles[i % angles.length]}`, angles[(i + 1) % angles.length]],
      views: 5000 + ((i * 7919) % 90000),
      publishedAt: new Date(Date.now() - i * 5 * 86_400_000).toISOString(),
    }));
  }

  /** 데모: 채널마다 정해진 가짜 영상 ID 15개 */
  async getChannelRecentVideoIds(channelId: string, count: number): Promise<string[]> {
    return Array.from({ length: count }, (_, i) => `${channelId}-recent-${i}`);
  }

  /** 데모: 6개월 동안 쇼츠·롱폼 섞어 36개, 몇 개는 크게 뜸 */
  async getChannelInsight(channelId: string, sinceDays: number) {
    const now = Date.now();
    const titles = ["사기 전에 꼭 볼 3가지", "이거 하나로 끝", "솔직 후기 한 달 써 봄", "가성비 끝판왕 비교", "모르면 손해 보는 꿀팁", "광고 아님 내돈내산"];
    const videos = Array.from({ length: 36 }, (_, i) => {
      const shorts = i % 3 !== 0;
      const base = seededNumber(`${channelId}-v${i}`, 6_000, 14_000) * (shorts ? 1 : 2);
      const hit = i % 7 === 2 ? 4.5 : i % 11 === 5 ? 2.2 : i % 5 === 1 ? 1.6 : 1;
      const views = Math.round(base * hit);
      return {
        videoId: `${channelId.slice(-6)}v${String(i).padStart(3, "0")}`,
        title: `${titles[i % titles.length]} #${i + 1}`,
        url: `https://www.youtube.com/watch?v=demo${i}`,
        thumbnailUrl: null,
        publishedAt: new Date(now - Math.round(((i + 1) * sinceDays * 86_400_000) / 38)).toISOString(),
        durationSec: shorts ? 30 + (i % 4) * 10 : 420 + (i % 5) * 60,
        format: (shorts ? "shorts" : "long") as "shorts" | "long",
        views,
        likes: Math.round(views * 0.03),
        comments: Math.round(views * 0.002),
        tags: ["추천", "리뷰", "꿀템"],
      };
    });
    return {
      channel: {
        channelId,
        title: "데모 채널",
        handle: "@demo-channel",
        description: "데모 모드의 예시 채널입니다.",
        thumbnailUrl: null,
        subscribers: seededNumber(channelId, 12_000, 480_000),
        videoCount: 214,
        totalViews: 38_000_000,
        createdAt: "2021-03-02T00:00:00Z",
        url: "https://www.youtube.com/",
      },
      videos,
      truncated: false,
      units: 3,
    };
  }

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
