import "server-only";
import type { ConnectionTestResult } from "@/lib/types";
import { parseNote, parseSearchResponse } from "./parse";
import { XhsSearchError, type XhsNote, type XhsSearchPage, type XhsSearchParams, type XhsSort, type XhsTimeFilter, type XiaohongshuSearchProvider } from "./types";

/**
 * TikHub 샤오홍슈 App V2 (docs/XIAOHONGSHU_SEARCH.md).
 * - 공식 문서 확인 (2026-10-05, OpenAPI V5.3.2):
 *   GET /api/v1/xiaohongshu/app_v2/search_notes — keyword, page, sort_type, note_type, time_filter, search_id, search_session_id
 *   GET /api/v1/xiaohongshu/app_v2/get_video_note_detail — note_id
 *   GET /api/v1/tikhub/user/get_user_info — 키 확인 (무료)
 * - 비용: 검색 1회 $0.01, 상세 1회 $0.01, 사용자 정보 0 (get_endpoint_info 기준)
 * - 인증: Authorization: Bearer {키}. 키는 서버에서만 쓰고 오류 메시지·로그에 남기지 않는다
 */
const BASE = "https://api.tikhub.io";
const TIMEOUT_MS = 30_000;

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

  private async get(path: string, params: Record<string, string | number | undefined>): Promise<unknown> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") qs.set(k, String(v));
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}?${qs.toString()}`, {
        headers: { Authorization: `Bearer ${this.apiKey}`, Accept: "application/json" },
        signal: ctrl.signal,
        cache: "no-store",
      });
    } catch (e) {
      if ((e as Error).name === "AbortError") throw new XhsSearchError("TIMEOUT", "TikHub 응답이 30초 안에 오지 않았습니다. 잠시 후 다시 시도해 주세요.");
      throw new XhsSearchError("UPSTREAM", "TikHub 에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401) throw new XhsSearchError("AUTH", "TikHub API Key 가 올바르지 않거나 만료되었습니다. API 연결 센터에서 키를 확인해 주세요.");
    if (res.status === 403) throw new XhsSearchError("AUTH", "TikHub 계정에 이 기능 권한이 없습니다 (계정 비활성·이메일 미인증·키 권한). TikHub 대시보드를 확인해 주세요.");
    if (res.status === 402) throw new XhsSearchError("PAYMENT", "TikHub 잔액(크레딧)이 부족합니다. TikHub 에서 충전한 뒤 다시 시도해 주세요.");
    if (res.status === 429) throw new XhsSearchError("RATE_LIMIT", "TikHub 요청이 너무 많습니다 (초당 10회 제한). 잠시 후 다시 시도해 주세요.");
    if (!res.ok) throw new XhsSearchError("UPSTREAM", `TikHub 응답 오류 (HTTP ${res.status}). 잠시 후 다시 시도해 주세요.`);
    const body = (await res.json().catch(() => null)) as { code?: number; data?: unknown } | null;
    if (!body) throw new XhsSearchError("BAD_RESPONSE", "TikHub 응답을 읽지 못했습니다.");
    if (body.code && body.code !== 200) throw new XhsSearchError("UPSTREAM", `TikHub 오류 (code ${body.code}). 잠시 후 다시 시도해 주세요.`);
    return body;
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
      const body = (await this.get("/api/v1/tikhub/user/get_user_info", {})) as { data?: { user_data?: { balance?: number; free_credit?: number } } };
      const u = body.data?.user_data;
      const money = u ? ` · 잔액 $${Number(u.balance ?? 0).toFixed(2)}${u.free_credit ? ` (무료 크레딧 $${Number(u.free_credit).toFixed(2)}, 검색에는 사용 불가)` : ""}` : "";
      return { ok: true, message: `연결 성공${money} · 검색 1회 약 $0.01`, testedAt, mock: false };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "TikHub 에 연결할 수 없습니다.", testedAt, mock: false };
    }
  }
}
