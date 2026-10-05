import "server-only";
import type { ConnectionTestResult } from "@/lib/types";
import { parseNote, parseSearchResponse } from "./parse";
import { tikhubAccountSummary, tikhubRequest } from "../tikhub/client";
import type { XhsNote, XhsSearchPage, XhsSearchParams, XhsSort, XhsTimeFilter, XiaohongshuSearchProvider } from "./types";

/**
 * TikHub 샤오홍슈 App V2 (docs/XIAOHONGSHU_SEARCH.md).
 * - 공식 문서 확인 (2026-10-05, OpenAPI V5.3.2):
 *   GET /api/v1/xiaohongshu/app_v2/search_notes — keyword, page, sort_type, note_type, time_filter, search_id, search_session_id
 *   GET /api/v1/xiaohongshu/app_v2/get_video_note_detail — note_id
 *   GET /api/v1/tikhub/user/get_user_info — 키 확인 (무료)
 * - 비용: 검색 1회 $0.01, 상세 1회 $0.01, 사용자 정보 0 (get_endpoint_info 기준)
 * - 인증: Authorization: Bearer {키}. 키는 서버에서만 쓰고 오류 메시지·로그에 남기지 않는다
 */

const SORT: Record<XhsSort, string> = {
  general: "general",
  latest: "time_descending",
  likes: "popularity_descending",
  comments: "comment_descending",
  collects: "collect_descending",
};
const TIME: Record<XhsTimeFilter, string> = { all: "不限", day: "一天内", week: "一周内", "half-year": "半年内" };

export class TikHubXiaohongshuProvider implements XiaohongshuSearchProvider {
  readonly id = "tikhub-xiaohongshu";
  readonly label = "TikHub 샤오홍슈";

  constructor(private readonly apiKey: string) {}

  private get(path: string, params: Record<string, string | number | undefined>): Promise<unknown> {
    return tikhubRequest(this.apiKey, "GET", path, params);
  }

  async searchVideos(p: XhsSearchParams): Promise<XhsSearchPage> {
    const body = await this.get("/api/v1/xiaohongshu/app_v2/search_notes", {
      keyword: p.keyword,
      page: p.page,
      sort_type: SORT[p.sort],
      note_type: "视频笔记", // 영상만
      time_filter: TIME[p.timeFilter],
      search_id: p.searchId,
      search_session_id: p.sessionId,
    });
    return parseSearchResponse(body);
  }

  async getVideoDetail(noteId: string): Promise<XhsNote | null> {
    const body = (await this.get("/api/v1/xiaohongshu/app_v2/get_video_note_detail", { note_id: noteId })) as { data?: unknown };
    // 상세 응답도 구조가 문서에 없어 노트 객체를 찾아 읽는다
    const parsed = parseSearchResponse(body).notes.find((n) => n.noteId === noteId);
    if (parsed) return parsed;
    const d = body.data as Record<string, unknown> | undefined;
    return parseNote((d?.data as unknown) ?? d) ?? null;
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const testedAt = new Date().toISOString();
    try {
      // 무료 엔드포인트로 키만 확인한다 (검색 비용을 쓰지 않음)
      const money = await tikhubAccountSummary(this.apiKey);
      return { ok: true, message: `연결 성공${money ? ` · ${money}` : ""} · 검색 1회 약 $0.01 (샤오홍슈·도우인)`, testedAt, mock: false };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "TikHub 에 연결할 수 없습니다.", testedAt, mock: false };
    }
  }
}
