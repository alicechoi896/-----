import "server-only";
import { OpenAITTSProvider, type TTSProvider } from "./tts/openai-tts";
import type { ProductSourceInput, ProviderCredentialMap, ProviderId } from "@/lib/types";
import { serverConfig } from "../config";
import { AppError } from "../http";
import { getCurrentUserId, getRepositories } from "../repositories";
import { settingsService } from "../services/settings";
import { decryptSecret } from "../security/crypto";
import { ClaudeProvider } from "./ai/claude-provider";
import { MockAIProvider } from "./ai/mock-ai-provider";
import { OpenAIProvider } from "./ai/openai-provider";
import { ImageTextCollector, MockImageCollector, TextCollector } from "./product/collectors";
import { MockNaverTrendProvider } from "./trends/mock-naver-provider";
import { MockYouTubeTrendProvider } from "./trends/mock-youtube-provider";
import { NaverApiProvider } from "./trends/naver-api-provider";
import { NaverSearchAdProvider } from "./trends/naver-searchad";
import { YouTubeDataApiProvider } from "./trends/youtube-data-api-provider";
import { MockDouyinProvider } from "./douyin/mock-douyin-provider";
import { TikHubDouyinProvider } from "./douyin/tikhub-douyin-provider";
import { BrightDataCollector, type ProductPageCollector } from "./product/brightdata";
import { MockBrightDataCollector } from "./product/mock-brightdata";
import type { DouyinProvider } from "./douyin/types";
import { MockXiaohongshuProvider } from "./xiaohongshu/mock-xiaohongshu-provider";
import { TikHubXiaohongshuProvider } from "./xiaohongshu/tikhub-xiaohongshu-provider";
import { XhsSearchError, type XiaohongshuSearchProvider } from "./xiaohongshu/types";
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
const mockXhs = new MockXiaohongshuProvider();
const mockDouyin = new MockDouyinProvider();

/** 연결된 Provider 의 자격증명을 복호화해서 읽는다 (서버 내부 전용) */
async function loadCredentials<P extends ProviderId>(provider: P): Promise<ProviderCredentialMap[P] | null> {
  const userId = await getCurrentUserId();
  const [conn] = await getRepositories().connections.list((c) => c.userId === userId && c.provider === provider);
  // 마지막 테스트가 실패(error)한 키도 사용한다: 실제 호출에서 원인이 담긴 오류를 보여주기 위해 (Mock 으로 몰래 바꾸지 않음)
  if (!conn || conn.status === "disconnected" || !conn.encryptedCredentials) return null;
  return JSON.parse(decryptSecret(conn.encryptedCredentials)) as ProviderCredentialMap[P];
}

/**
 * 글쓰기·분석 AI 선택:
 *  1) 사용자가 고른 기본 AI(설정)가 연결되어 있으면 그것
 *  2) 아니면 연결된 것 중 Claude → OpenAI 순
 *  3) 아무것도 없으면 Mock
 */
export async function getAIProvider(): Promise<AIProvider> {
  if (serverConfig.providerMode !== "live") return mockAI;
  const [settings, claude, openai] = await Promise.all([
    // 설정 테이블이 아직 없는 등 실패해도 AI 선택은 계속되도록 기본값으로 대신한다
    settingsService.get().catch(() => ({ preferredAi: null })),
    loadCredentials("claude"),
    loadCredentials("openai"),
  ]);
  const make = {
    claude: () => (claude ? new ClaudeProvider(claude.apiKey, serverConfig.claudeModel) : null),
    openai: () => (openai ? new OpenAIProvider(openai.apiKey, serverConfig.openaiModel) : null),
  };
  const preferred = settings.preferredAi ? make[settings.preferredAi]() : null;
  return preferred ?? make.claude() ?? make.openai() ?? mockAI;
}

export async function getYouTubeTrendProvider(): Promise<YouTubeTrendProvider> {
  if (serverConfig.providerMode === "live") {
    const cred = await loadCredentials("youtube");
    if (cred) return new YouTubeDataApiProvider(cred.apiKey);
  }
  return mockYouTube;
}

/**
 * NAVER 트렌드: live 모드에서 키가 연결되어 있으면 실제 데이터 (데이터랩 + 블로그 검색 + 선택: 검색광고 API).
 */
export async function getNaverTrendProvider(): Promise<NaverTrendProvider> {
  if (serverConfig.providerMode === "live") {
    const [cred, ad] = await Promise.all([loadCredentials("naver"), loadCredentials("naver-searchad").catch(() => null)]);
    if (cred) return createNaverProvider(cred, ad);
  }
  return mockNaver;
}

/**
 * 샤오홍슈 영상 검색: live 모드에서는 TikHub 키가 있어야 한다 (가짜 결과로 바꿔치기하지 않음). 데모 모드는 가짜 결과
 */
export async function getXiaohongshuSearchProvider(): Promise<XiaohongshuSearchProvider> {
  if (serverConfig.providerMode !== "live") return mockXhs;
  const cred = await loadCredentials("tikhub");
  if (!cred) throw new XhsSearchError("NOT_CONNECTED", "TikHub API 가 연결되어 있지 않습니다. 설정 › API 연결 센터에서 TikHub 키를 연결해 주세요.");
  return new TikHubXiaohongshuProvider(cred.apiKey);
}

/** AI 음성 (영상 자동 제작): OpenAI 키가 연결되어 있을 때만. 데모·미연결이면 null → 음성 없이 자막 시간으로 만든다 */
export async function getTTSProvider(): Promise<TTSProvider | null> {
  if (serverConfig.providerMode !== "live") return null;
  const openai = await loadCredentials("openai");
  return openai ? new OpenAITTSProvider(openai.apiKey) : null;
}

/** 도우인 (검색·공유 링크): TikHub 키 필요 (샤오홍슈와 같은 키). 데모 모드는 가짜 결과 */
export async function getDouyinProvider(): Promise<DouyinProvider> {
  if (serverConfig.providerMode !== "live") return mockDouyin;
  const cred = await loadCredentials("tikhub");
  if (!cred) throw new XhsSearchError("NOT_CONNECTED", "TikHub API 가 연결되어 있지 않습니다. 설정 › API 연결 센터에서 TikHub 키를 연결해 주세요.");
  return new TikHubDouyinProvider(cred.apiKey);
}

/** 상품 상세페이지 수집 (쿠팡·스마트스토어): Bright Data 토큰 필요. 데모 모드는 가짜 수집기 */
const mockBrightData = new MockBrightDataCollector();
export async function getProductPageCollector(): Promise<ProductPageCollector> {
  if (serverConfig.providerMode !== "live") return mockBrightData;
  const cred = await loadCredentials("brightdata");
  if (!cred) throw new AppError("BRIGHTDATA_NOT_CONNECTED", "Bright Data API 연결이 필요합니다. 설정 › API 연결 센터에서 Bright Data 토큰을 연결해 주세요.", 409);
  return new BrightDataCollector(cred.apiKey);
}

/** 검색광고 키: 별도 연결(naver-searchad), 없으면 예전처럼 NAVER 연결 안에 저장된 값 */
function createNaverProvider(c: ProviderCredentialMap["naver"], ad: ProviderCredentialMap["naver-searchad"] | null = null): NaverApiProvider {
  const legacy = c.adApiKey && c.adSecretKey && c.adCustomerId ? { apiKey: c.adApiKey, secretKey: c.adSecretKey, customerId: c.adCustomerId } : null;
  return new NaverApiProvider(c.clientId, c.clientSecret, ad ?? legacy);
}

/**
 * 입력 유형에 맞는 Collector. 앞에 있을수록 우선한다 (전용 수집기를 앞에 추가).
 * - live: URL 은 실제 웹페이지 수집, 이미지는 AI 가 읽은 텍스트로 수집 (예시 제품으로 바꿔치기하지 않음)
 * - mock(데모): 예시 카탈로그 사용
 */
const LIVE_COLLECTORS: ProductDataCollector[] = [new ImageTextCollector(), new TextCollector()];
const MOCK_COLLECTORS: ProductDataCollector[] = [new ImageTextCollector(), new MockImageCollector(), new TextCollector()];

export function getProductCollector(source: ProductSourceInput): ProductDataCollector {
  // 서버 직접 접속 수집은 v0.9.11 에서 뺐다. 상품 URL 은 v0.9.36 부터 /api/products/learn-url (Bright Data, 쿠팡·스마트스토어) 로만
  if (source.type === "url") {
    throw new AppError("URL_NOT_SUPPORTED", "상품 URL 은 '상품 URL' 탭(쿠팡·스마트스토어, Bright Data)으로 학습해 주세요. 그 밖의 쇼핑몰은 상세페이지를 캡처해 '이미지 업로드'로 올리거나 '텍스트 직접 입력'을 이용해 주세요.");
  }
  const collectors = serverConfig.providerMode === "live" ? LIVE_COLLECTORS : MOCK_COLLECTORS;
  const collector = collectors.find((c) => c.supports(source));
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
    case "claude":
      return new ClaudeProvider((cred as ProviderCredentialMap["claude"]).apiKey, serverConfig.claudeModel);
    case "youtube":
      return new YouTubeDataApiProvider((cred as ProviderCredentialMap["youtube"]).apiKey);
    case "naver":
      return createNaverProvider(cred as ProviderCredentialMap["naver"]);
    case "naver-searchad":
      return new NaverSearchAdProvider(cred as ProviderCredentialMap["naver-searchad"]);
    case "tikhub":
      return new TikHubXiaohongshuProvider((cred as ProviderCredentialMap["tikhub"]).apiKey);
    case "brightdata": {
      const c = new BrightDataCollector((cred as ProviderCredentialMap["brightdata"]).apiKey);
      return { id: c.id, label: "Bright Data", testConnection: () => c.testConnection() } as BaseProvider;
    }
    default:
      return null;
  }
}

export { loadCredentials };
