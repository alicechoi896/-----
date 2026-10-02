import "server-only";
import type { NaverTrendInsight, NaverTrendQuery } from "@/lib/types";
import { AppError } from "../../http";
import type { NaverTrendProvider } from "../types";

/**
 * NAVER Open API Provider (골격).
 * - testConnection: 실제로 호출한다 (검색 API blog.json, display=1).
 * - getInsight: 아직 구현하지 않았다.
 *
 * 구현 메모 (docs/API_PROVIDER_SPEC.md "NAVER")
 *  1) DataLab 검색어 트렌드  POST https://openapi.naver.com/v1/datalab/search      → searchTrend
 *  2) DataLab 쇼핑인사이트   POST https://openapi.naver.com/v1/datalab/shopping/… → 카테고리 급상승
 *  3) 연관 키워드·검색량: 검색광고 API(키워드도구)는 별도 인증(API Key, Secret, Customer ID)이 필요하다
 *  4) contentIdeas 는 위 결과를 AIProvider 로 해석해 만든다 (Provider 끼리 직접 호출하지 말고 Service 에서 조합)
 */
export class NaverApiProvider implements NaverTrendProvider {
  readonly id = "naver-open-api";
  readonly kind = "naver-trend" as const;
  readonly label = "NAVER Open API";

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  private headers() {
    return { "X-Naver-Client-Id": this.clientId, "X-Naver-Client-Secret": this.clientSecret };
  }

  async testConnection() {
    const testedAt = new Date().toISOString();
    try {
      const res = await fetch("https://openapi.naver.com/v1/search/blog.json?query=test&display=1", {
        headers: this.headers(),
        cache: "no-store",
      });
      if (res.ok) return { ok: true, message: "NAVER API 에 정상적으로 연결되었습니다.", testedAt, mock: false };
      return { ok: false, message: `NAVER 응답 오류 (HTTP ${res.status})`, testedAt, mock: false };
    } catch {
      return { ok: false, message: "NAVER 서버에 연결할 수 없습니다.", testedAt, mock: false };
    }
  }

  async getInsight(_query: NaverTrendQuery): Promise<NaverTrendInsight> {
    void _query;
    throw new AppError("NOT_IMPLEMENTED", "NAVER 트렌드 실제 수집은 아직 구현되지 않았습니다. (docs/NEXT_STEPS.md)", 501);
  }
}
