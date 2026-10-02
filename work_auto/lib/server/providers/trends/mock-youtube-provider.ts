import "server-only";
import { buildYouTubeTrendItems } from "@/lib/mock/youtube-trends";
import type { YouTubeTrendItem, YouTubeTrendQuery } from "@/lib/types";
import { seededNumber } from "@/lib/utils";
import { serverConfig } from "../../config";
import type { VideoMeta, YouTubeTrendProvider } from "../types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** YouTube 트렌드 Mock — 필터·정렬 로직은 실제 Provider 에서도 같은 결과를 내야 한다 */
export class MockYouTubeTrendProvider implements YouTubeTrendProvider {
  readonly id = "mock-youtube";
  readonly kind = "youtube-trend" as const;
  readonly label = "YouTube (Mock)";

  async testConnection() {
    return { ok: true, message: "Mock YouTube 데이터를 사용합니다.", testedAt: new Date().toISOString(), mock: true };
  }

  async searchTrends(query: YouTubeTrendQuery): Promise<YouTubeTrendItem[]> {
    await sleep(Math.round(serverConfig.mockLatencyMs * 0.6));
    const now = Date.now();
    const keyword = query.keyword?.trim().toLowerCase();

    const items = buildYouTubeTrendItems(now, query.periodDays).filter((item) => {
      const ageDays = (now - new Date(item.publishedAt).getTime()) / 86_400_000;
      if (ageDays > query.periodDays) return false;
      if (query.category && item.category !== query.category) return false;
      if (query.format && query.format !== "all" && item.format !== query.format) return false;
      if (keyword) {
        const haystack = `${item.title} ${item.keywords.join(" ")} ${item.channelName}`.toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      return true;
    });

    const sort = query.sort ?? "trendScore";
    return items.sort((a, b) =>
      sort === "publishedAt" ? b.publishedAt.localeCompare(a.publishedAt) : (b[sort] as number) - (a[sort] as number),
    );
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
}
