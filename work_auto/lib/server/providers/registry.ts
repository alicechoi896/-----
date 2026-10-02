import "server-only";
import type { ProductSourceInput, ProviderCredentialMap, ProviderId } from "@/lib/types";
import { serverConfig } from "../config";
import { AppError } from "../http";
import { getCurrentUserId, getRepositories } from "../repositories";
import { decryptSecret } from "../security/crypto";
import { MockAIProvider } from "./ai/mock-ai-provider";
import { OpenAIProvider } from "./ai/openai-provider";
import { MockImageCollector, MockUrlCollector, TextCollector } from "./product/collectors";
import { MockNaverTrendProvider } from "./trends/mock-naver-provider";
import { MockYouTubeTrendProvider } from "./trends/mock-youtube-provider";
import { NaverApiProvider } from "./trends/naver-api-provider";
import { YouTubeDataApiProvider } from "./trends/youtube-data-api-provider";
import type { AIProvider, BaseProvider, NaverTrendProvider, ProductDataCollector, YouTubeTrendProvider } from "./types";

/**
 * ★ Provider Registry — "어떤 구현체를 쓸지" 결정하는 유일한 곳.
 *
 * 규칙
 *  - PROVIDER_MODE=mock  → 항상 Mock
 *  - PROVIDER_MODE=live  → 해당 Provider 가 연결되어 있으면 실제 구현, 아니면 Mock
 *
 * Service 는 getAIProvider() 등만 호출하고, 구현 클래스를 직접 new 하지 않는다.
 */

const mockAI = new MockAIProvider();
const mockYouTube = new MockYouTubeTrendProvider();
const mockNaver = new MockNaverTrendProvider();

/** 연결된 Provider 의 자격증명을 복호화해서 읽는다 (서버 내부 전용) */
async function loadCredentials<P extends ProviderId>(provider: P): Promise<ProviderCredentialMap[P] | null> {
  const userId = await getCurrentUserId();
  const [conn] = await getRepositories().connections.list((c) => c.userId === userId && c.provider === provider);
  if (!conn || conn.status !== "connected" || !conn.encryptedCredentials) return null;
  return JSON.parse(decryptSecret(conn.encryptedCredentials)) as ProviderCredentialMap[P];
}

export async function getAIProvider(): Promise<AIProvider> {
  if (serverConfig.providerMode === "live") {
    const cred = await loadCredentials("openai");
    if (cred) return new OpenAIProvider(cred.apiKey, serverConfig.openaiModel);
    // 향후: Claude/Gemini 연결 여부와 사용자가 고른 기본 AI 에 따라 분기
  }
  return mockAI;
}

export async function getYouTubeTrendProvider(): Promise<YouTubeTrendProvider> {
  if (serverConfig.providerMode === "live") {
    const cred = await loadCredentials("youtube");
    if (cred) return new YouTubeDataApiProvider(cred.apiKey);
  }
  return mockYouTube;
}

/**
 * NAVER 트렌드 조회는 실제 수집(getInsight)을 아직 구현하지 않아, 키를 연결해도 Mock 데이터를 보여준다.
 * (연결 테스트는 createProviderForTest 에서 실제로 호출한다)
 * 실제 수집을 구현하면 아래 주석을 풀어 연결된 경우 NaverApiProvider 를 쓰게 한다.
 */
export async function getNaverTrendProvider(): Promise<NaverTrendProvider> {
  // if (serverConfig.providerMode === "live") {
  //   const cred = await loadCredentials("naver");
  //   if (cred) return new NaverApiProvider(cred.clientId, cred.clientSecret);
  // }
  return mockNaver;
}

/** 입력 유형에 맞는 Collector. 앞에 있을수록 우선한다 (전용 수집기를 앞에 추가) */
const COLLECTORS: ProductDataCollector[] = [new MockUrlCollector(), new MockImageCollector(), new TextCollector()];

export function getProductCollector(source: ProductSourceInput): ProductDataCollector {
  const collector = COLLECTORS.find((c) => c.supports(source));
  if (!collector) throw new AppError("NO_COLLECTOR", "이 입력을 처리할 수집기가 없습니다.");
  return collector;
}

/**
 * API 연결 센터의 [테스트]용: 저장 전·후 자격증명으로 Provider 를 만든다.
 * Mock 모드에서는 외부 호출 없이 형식만 검사한다.
 */
export function createProviderForTest<P extends ProviderId>(provider: P, cred: ProviderCredentialMap[P]): BaseProvider | null {
  if (serverConfig.providerMode !== "live") return null;
  switch (provider) {
    case "openai":
      return new OpenAIProvider((cred as ProviderCredentialMap["openai"]).apiKey, serverConfig.openaiModel);
    case "youtube":
      return new YouTubeDataApiProvider((cred as ProviderCredentialMap["youtube"]).apiKey);
    case "naver": {
      const c = cred as ProviderCredentialMap["naver"];
      return new NaverApiProvider(c.clientId, c.clientSecret);
    }
    default:
      return null;
  }
}

export { loadCredentials };
