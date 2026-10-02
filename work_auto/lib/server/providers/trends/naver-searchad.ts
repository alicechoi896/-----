import "server-only";
import { createHmac } from "node:crypto";
import type { Keyword } from "@/lib/types";

/**
 * NAVER 검색광고 API — 키워드도구 (연관 키워드 + 월간 검색량 + 경쟁도).
 * 인증: 엑세스라이선스(X-API-KEY) + 비밀키로 만든 서명(X-Signature) + CUSTOMER_ID(X-Customer)
 *   서명 = base64( HMAC-SHA256(비밀키, "{timestamp}.{METHOD}.{URI}") )
 * 문서: https://naver.github.io/searchad-apidoc/
 */

const BASE = "https://api.searchad.naver.com";
const KEYWORDS_TOOL = "/keywordstool";

export interface SearchAdCredentials {
  apiKey: string;
  secretKey: string;
  customerId: string;
}

interface KeywordToolRow {
  relKeyword: string;
  monthlyPcQcCnt: number | string;
  monthlyMobileQcCnt: number | string;
  compIdx?: string;
}

export interface SearchAdKeyword extends Keyword {
  monthlyPc: number;
  monthlyMobile: number;
}

/** "< 10" 같은 값은 5 로 본다 */
const toCount = (v: number | string): number => (typeof v === "number" ? v : /</.test(v) ? 5 : Number(String(v).replace(/[^\d]/g, "")) || 0);

const COMPETITION: Record<string, Keyword["competition"]> = { 높음: "high", 중간: "mid", 낮음: "low" };

export class SearchAdError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function describe(status: number, body: { title?: string; detail?: string; message?: string } | null): string {
  const raw = body?.title || body?.message || body?.detail ? ` · NAVER 메시지: ${body?.title ?? body?.message ?? body?.detail}` : "";
  if (status === 401 || status === 403) {
    return `검색광고 API 인증에 실패했습니다. 엑세스라이선스·비밀키·CUSTOMER_ID 를 다시 확인해 주세요 (searchad.naver.com → 도구 → API 사용 관리).${raw}`;
  }
  if (status === 429) return `검색광고 API 호출이 너무 많습니다. 잠시 후 다시 시도해 주세요.${raw}`;
  return `검색광고 API 오류 (HTTP ${status})${raw}`;
}

/**
 * 힌트 키워드(최대 5개)의 연관 키워드와 월간 검색량.
 * 키워드도구는 공백이 있는 키워드를 받지 않으므로 공백을 지워서 보낸다.
 */
export async function fetchKeywordTool(cred: SearchAdCredentials, hints: string[]): Promise<SearchAdKeyword[]> {
  const hintKeywords = [...new Set(hints.map((h) => h.replace(/\s+/g, "")).filter(Boolean))].slice(0, 5);
  if (!hintKeywords.length) return [];
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", cred.secretKey).update(`${timestamp}.GET.${KEYWORDS_TOOL}`).digest("base64");
  const qs = new URLSearchParams({ hintKeywords: hintKeywords.join(","), showDetail: "1" });
  const res = await fetch(`${BASE}${KEYWORDS_TOOL}?${qs.toString()}`, {
    cache: "no-store",
    headers: {
      "X-Timestamp": timestamp,
      "X-API-KEY": cred.apiKey,
      "X-Customer": cred.customerId,
      "X-Signature": signature,
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { title?: string; detail?: string; message?: string } | null;
    throw new SearchAdError(res.status, describe(res.status, body));
  }
  const data = (await res.json()) as { keywordList?: KeywordToolRow[] };
  return (data.keywordList ?? []).map((r) => {
    const monthlyPc = toCount(r.monthlyPcQcCnt);
    const monthlyMobile = toCount(r.monthlyMobileQcCnt);
    return {
      text: r.relKeyword,
      source: "naver" as const,
      volume: monthlyPc + monthlyMobile,
      competition: r.compIdx ? COMPETITION[r.compIdx] : undefined,
      monthlyPc,
      monthlyMobile,
    };
  });
}
