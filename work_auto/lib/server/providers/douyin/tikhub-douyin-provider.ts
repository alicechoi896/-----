import "server-only";
import type { ConnectionTestResult } from "@/lib/types";
import { tikhubAccountSummary, tikhubRequest } from "../tikhub/client";
import { parseDouyinOne, parseDouyinSearch } from "./parse";
import type { DouyinProvider, DouyinSearchPage, DouyinSearchParams, DouyinSort, DouyinVideo } from "./types";

/**
 * TikHub 도우인 (공식 OpenAPI V5.3.2 확인, 2026-10-05)
 * - 검색: POST /api/v1/douyin/search/fetch_video_search_v2 (JSON body) — $0.01/회
 * - 공유 링크: GET /api/v1/douyin/app/v3/fetch_one_video_by_share_url?share_url= — $0.001/회
 *   비어 있으면(문서 안내) 같은 링크로 GET /api/v1/douyin/web/fetch_one_video_by_share_url — APP 이 정상이면 부르지 않는다
 */
const SORT: Record<DouyinSort, string> = { general: "0", likes: "1", latest: "2" };

export class TikHubDouyinProvider implements DouyinProvider {
  readonly id = "tikhub-douyin";
  readonly label = "TikHub 도우인";

  constructor(private readonly apiKey: string) {}

  async searchVideos(p: DouyinSearchParams): Promise<DouyinSearchPage> {
    const body = await tikhubRequest(this.apiKey, "POST", "/api/v1/douyin/search/fetch_video_search_v2", {
      keyword: p.keyword,
      cursor: p.cursor,
      sort_type: SORT[p.sort],
      publish_time: p.publishTime,
      filter_duration: "0",
      content_type: "1", // 영상
      search_id: p.searchId ?? "",
      backtrace: p.backtrace ?? "",
    });
    return parseDouyinSearch(body);
  }

  async resolveShareUrl(shareUrl: string): Promise<DouyinVideo | null> {
    const app = parseDouyinOne(await tikhubRequest(this.apiKey, "GET", "/api/v1/douyin/app/v3/fetch_one_video_by_share_url", { share_url: shareUrl }));
    if (app) return app;
    return parseDouyinOne(await tikhubRequest(this.apiKey, "GET", "/api/v1/douyin/web/fetch_one_video_by_share_url", { share_url: shareUrl }));
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const testedAt = new Date().toISOString();
    try {
      const money = await tikhubAccountSummary(this.apiKey);
      return { ok: true, message: `연결 성공${money ? ` · ${money}` : ""}`, testedAt, mock: false };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "TikHub 에 연결할 수 없습니다.", testedAt, mock: false };
    }
  }
}
