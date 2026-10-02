import "server-only";
import type { NaverTrendInsight, NaverTrendQuery } from "@/lib/types";
import { AppError } from "../../http";
import type { NaverTrendProvider } from "../types";

/**
 * NAVER Open API Provider.
 * - testConnection: 실제로 호출한다. 이 서비스가 쓸 **데이터랩(검색어트렌드)** API 로 확인하고,
 *   실패하면 NAVER 가 돌려준 오류 코드로 원인(키 오류 / 앱에 API 미등록 등)을 안내한다.
 * - getInsight: 아직 구현하지 않았다. (registry 에서 트렌드 조회는 계속 Mock 을 쓴다)
 *
 * 구현 메모 (docs/API_PROVIDER_SPEC.md "NAVER")
 *  1) DataLab 검색어 트렌드  POST https://openapi.naver.com/v1/datalab/search      → searchTrend
 *  2) DataLab 쇼핑인사이트   POST https://openapi.naver.com/v1/datalab/shopping/… → 카테고리 급상승
 *  3) 연관 키워드·검색량: 검색광고 API(키워드도구)는 별도 인증(API Key, Secret, Customer ID)이 필요하다
 *  4) contentIdeas 는 위 결과를 AIProvider 로 해석해 만든다 (Provider 끼리 직접 호출하지 말고 Service 에서 조합)
 */

const DATALAB_URL = "https://openapi.naver.com/v1/datalab/search";

/** NAVER 오류 응답 → 사용자 안내 (키 값은 절대 넣지 않는다) */
function describeNaverError(status: number, body: { errorCode?: string; errorMessage?: string } | null): string {
  const code = body?.errorCode ? ` [${body.errorCode}]` : "";
  const raw = body?.errorMessage ? ` · NAVER 메시지: ${body.errorMessage}` : "";
  if (status === 401) {
    return `Client ID 또는 Client Secret 이 올바르지 않습니다. NAVER 개발자센터 → 내 애플리케이션에서 값을 다시 복사해 주세요.${code}${raw}`;
  }
  if (status === 403) {
    return `이 애플리케이션에 '데이터랩(검색어트렌드)' API 가 등록되어 있지 않습니다. NAVER 개발자센터 → 내 애플리케이션 → API 설정 → 사용 API 에 '데이터랩 (검색어트렌드)' 를 추가해 주세요.${code}${raw}`;
  }
  if (status === 429) return `NAVER API 하루 호출 한도를 넘었습니다. 내일 다시 시도해 주세요.${code}${raw}`;
  return `NAVER 응답 오류 (HTTP ${status})${code}${raw}`;
}

export class NaverApiProvider implements NaverTrendProvider {
  readonly id = "naver-open-api";
  readonly kind = "naver-trend" as const;
  readonly label = "NAVER Open API";

  constructor(
    private readonly clientId: string,
    private readonly clientSecret: string,
  ) {}

  private headers() {
    return {
      "X-Naver-Client-Id": this.clientId,
      "X-Naver-Client-Secret": this.clientSecret,
      "Content-Type": "application/json",
    };
  }

  async testConnection() {
    const testedAt = new Date().toISOString();
    const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
    try {
      const res = await fetch(DATALAB_URL, {
        method: "POST",
        headers: this.headers(),
        cache: "no-store",
        body: JSON.stringify({
          startDate: day(8),
          endDate: day(1),
          timeUnit: "date",
          keywordGroups: [{ groupName: "연결테스트", keywords: ["날씨"] }],
        }),
      });
      if (res.ok) {
        return { ok: true, message: "NAVER 데이터랩(검색어트렌드) API 에 정상적으로 연결되었습니다.", testedAt, mock: false };
      }
      const body = (await res.json().catch(() => null)) as { errorCode?: string; errorMessage?: string } | null;
      return { ok: false, message: describeNaverError(res.status, body), testedAt, mock: false };
    } catch {
      return { ok: false, message: "NAVER 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.", testedAt, mock: false };
    }
  }

  async getInsight(_query: NaverTrendQuery): Promise<NaverTrendInsight> {
    void _query;
    throw new AppError("NOT_IMPLEMENTED", "NAVER 트렌드 실제 수집은 아직 구현되지 않았습니다. (docs/NEXT_STEPS.md)", 501);
  }
}
