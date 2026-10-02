import type { ID, ISODate, ProviderId } from "./common";

export type ConnectionStatus = "disconnected" | "connected" | "error";

export interface ConnectionTestResult {
  ok: boolean;
  message: string;
  testedAt: ISODate;
  /** Mock 모드에서 실행된 테스트인지 여부 */
  mock: boolean;
}

/**
 * 사용자가 연결한 외부 API (BYOK).
 * encryptedCredentials 는 서버에서만 다루며, 절대 클라이언트로 내려가지 않는다.
 */
export interface ApiConnection {
  id: ID;
  userId: ID;
  provider: ProviderId;
  status: ConnectionStatus;
  /** AES-256-GCM 암호문 (iv.tag.ciphertext, base64). 미연결이면 null */
  encryptedCredentials: string | null;
  /** UI 표시용 마스킹 값 (예: "sk-…ab12") */
  maskedHint: string | null;
  lastTest: ConnectionTestResult | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}

/** 클라이언트에 노출 가능한 공개 DTO */
export type ApiConnectionPublic = Omit<ApiConnection, "encryptedCredentials" | "userId">;

/** Provider별 입력 자격증명 형태 */
export interface ProviderCredentialMap {
  openai: { apiKey: string };
  claude: { apiKey: string };
  youtube: { apiKey: string };
  /** Open API (데이터랩·검색). ad* 는 v0.9.7 이전에 함께 저장하던 검색광고 키 (목록을 볼 때 naver-searchad 로 옮긴다) */
  naver: { clientId: string; clientSecret: string; adApiKey?: string; adSecretKey?: string; adCustomerId?: string };
  /** 검색광고 API (월간 검색량·연관 키워드·경쟁도) */
  "naver-searchad": { apiKey: string; secretKey: string; customerId: string };
}
