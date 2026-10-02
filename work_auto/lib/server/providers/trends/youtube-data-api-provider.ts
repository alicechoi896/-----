import "server-only";
import type { YouTubeTrendItem, YouTubeTrendQuery } from "@/lib/types";
import { AppError } from "../../http";
import type { VideoMeta, YouTubeTrendProvider } from "../types";

/**
 * YouTube Data API v3 Provider (골격).
 * - testConnection: 실제로 호출한다 (videoCategories.list, 할당량 1 unit).
 * - searchTrends / getVideoMeta: 아직 구현하지 않았다. 구현 순서는 docs/API_PROVIDER_SPEC.md "YouTube" 참고.
 *
 * 구현 메모
 *  1) search.list (type=video, publishedAfter=now-periodDays, regionCode=KR, q=keyword, videoDuration) — 100 units/호출
 *  2) videos.list (part=statistics,contentDetails,snippet, id=…최대 50개) — 1 unit
 *  3) channels.list (part=statistics) 로 구독자 수 — 1 unit
 *  4) lib/domain/trend-score.ts 의 calcTrendScore 로 점수 계산 → YouTubeTrendItem 으로 변환
 *  ※ search.list 는 할당량이 크므로 결과를 캐시(예: 6시간)한다.
 */
export class YouTubeDataApiProvider implements YouTubeTrendProvider {
  readonly id = "youtube-data-api";
  readonly kind = "youtube-trend" as const;
  readonly label = "YouTube Data API";
  private readonly baseUrl = "https://www.googleapis.com/youtube/v3";

  constructor(private readonly apiKey: string) {}

  async testConnection() {
    const testedAt = new Date().toISOString();
    try {
      const url = `${this.baseUrl}/videoCategories?part=snippet&regionCode=KR&key=${encodeURIComponent(this.apiKey)}`;
      const res = await fetch(url, { cache: "no-store" });
      if (res.ok) return { ok: true, message: "YouTube Data API 에 정상적으로 연결되었습니다.", testedAt, mock: false };
      return { ok: false, message: `YouTube 응답 오류 (HTTP ${res.status})`, testedAt, mock: false };
    } catch {
      return { ok: false, message: "YouTube 서버에 연결할 수 없습니다.", testedAt, mock: false };
    }
  }

  async searchTrends(_query: YouTubeTrendQuery): Promise<YouTubeTrendItem[]> {
    void _query;
    throw new AppError("NOT_IMPLEMENTED", "YouTube 트렌드 실제 수집은 아직 구현되지 않았습니다. (docs/NEXT_STEPS.md)", 501);
  }

  async getVideoMeta(_url: string): Promise<VideoMeta> {
    void _url;
    throw new AppError("NOT_IMPLEMENTED", "YouTube 영상 정보 조회는 아직 구현되지 않았습니다. (docs/NEXT_STEPS.md)", 501);
  }
}
