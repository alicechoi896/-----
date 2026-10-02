import "server-only";

/**
 * 서버 환경 설정. 환경변수는 이 파일에서만 읽는다.
 * (.env.local.example 참고)
 */
export const serverConfig = {
  /** mock: 모든 Provider 를 Mock 으로 사용 / live: 연결된 Provider 는 실제 API 호출 */
  providerMode: (process.env.PROVIDER_MODE === "live" ? "live" : "mock") as "mock" | "live",
  /** API Key 암호화용 32바이트 키 (base64). 없으면 개발용 키를 파생해서 쓴다 */
  encryptionKey: process.env.ENCRYPTION_KEY ?? "",
  openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",
  /** Mock 응답 지연 (로딩 상태를 확인하기 위함). 0 이면 지연 없음 */
  mockLatencyMs: Number(process.env.MOCK_LATENCY_MS ?? 700),
};

export function getProviderMode() {
  return serverConfig.providerMode;
}
