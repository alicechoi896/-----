/**
 * 페이지 searchParams 에서 문자열 값만 골라낸다.
 * 생성 화면은 ?productId=…&trendId=… 처럼 폼 필드 이름과 같은 쿼리를 초기값으로 받는다.
 * (ContentGenerator 가 Generator Config 에 있는 필드 이름만 사용한다)
 */
export function pickStringParams(params: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string" && value) out[key] = value;
  }
  return out;
}
