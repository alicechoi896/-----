import "server-only";
import type {
  ConnectionTestResult,
  NaverTrendInsight,
  NaverTrendMore,
  NaverTrendSection,
  NaverTrendQuery,
  ProductSourceInput,
  RawProductData,
  YouTubeTrendItem,
  YouTubeTrendPage,
  YouTubeTrendQuery,
} from "@/lib/types";

/**
 * ★ Provider Interface
 *
 * 기능 코드(Service)는 아래 인터페이스에만 의존한다.
 * OpenAI SDK 나 외부 API URL 을 Service/Route/컴포넌트에서 직접 호출하지 않는다.
 * 새 AI(Claude, Gemini 등)를 추가할 때는 AIProvider 를 구현한 클래스 1개만 만들면 된다.
 * (docs/API_PROVIDER_SPEC.md)
 */

/** 모든 외부 연동 Provider 의 공통 부분 */
export interface BaseProvider {
  /** 구현체 식별자 (예: "openai", "mock-ai", "youtube-data-api") — 생성 이력에 기록된다 */
  readonly id: string;
  readonly label: string;
  /** API Key/연결 상태 확인 (API 연결 센터의 [테스트]) */
  testConnection(): Promise<ConnectionTestResult>;
}

/* ───────────── AI ───────────── */

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  /** 텍스트만 보내면 문자열, 이미지를 함께 보내면 조각 배열 */
  content: string | ChatContentPart[];
}

/** 메시지 조각: 텍스트 또는 이미지(base64). 이미지는 AI 에 보낸 뒤 저장하지 않는다 */
export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image"; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; data: string };

/** 메시지 내용에서 텍스트만 꺼낸다 (로그, Mock 용) */
export function contentText(content: ChatMessage["content"]): string {
  return typeof content === "string" ? content : content.map((p) => (p.type === "text" ? p.text : "[이미지]")).join("\n");
}

export interface TextGenerationRequest {
  /** 작업 이름 (로그, Mock 분기, 비용 집계용). 예: "content:yt-product-video" */
  task: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface StructuredGenerationRequest extends TextGenerationRequest {
  /** 응답 JSON 의 최상위 key 목록 (응답 검증에 사용) */
  outputKeys: string[];
  /**
   * 응답 JSON 스키마 (선택). 주면 지원하는 AI 는 이 형식을 강제한다 (Claude structured outputs).
   * 객체는 additionalProperties: false + required 를 갖춰야 한다.
   */
  jsonSchema?: Record<string, unknown>;
  /**
   * 프롬프트를 만들 때 쓴 구조화 데이터.
   * 실제 AI 는 messages 만 보지만, Mock 은 이 값으로 결정적인 출력을 만든다.
   */
  variables: Record<string, unknown>;
}

export interface GenerationUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface TextGenerationResult {
  text: string;
  provider: string;
  model: string;
  usage?: GenerationUsage;
}

export interface StructuredGenerationResult<T> {
  data: T;
  provider: string;
  model: string;
  usage?: GenerationUsage;
}

export interface AIProvider extends BaseProvider {
  readonly kind: "ai";
  readonly model: string;
  /** 이미지 입력(상세페이지 이미지 읽기)을 지원하는가 */
  readonly supportsVision: boolean;
  generateText(request: TextGenerationRequest): Promise<TextGenerationResult>;
  /** JSON 객체로 응답을 받는다. 결과 key 검증은 호출하는 Service 가 한다 */
  generateStructured<T extends Record<string, unknown>>(
    request: StructuredGenerationRequest,
  ): Promise<StructuredGenerationResult<T>>;
}

/* ───────────── Trend ───────────── */

export interface VideoMeta {
  url: string;
  platform: "youtube" | "naver" | "xiaohongshu" | "douyin" | "other";
  title: string;
  channelName: string;
  durationSec: number;
  thumbnailColor: string;
  thumbnailUrl?: string;
}

export interface YouTubeTrendProvider extends BaseProvider {
  readonly kind: "youtube-trend";
  /** 조건에 맞는 영상 한 페이지 (최대 50개 조회 → 구독자·조회수·댓글 조건으로 거른 결과) */
  searchTrends(query: YouTubeTrendQuery): Promise<YouTubeTrendPage>;
  /** 영상 1개를 트렌드 항목으로 조회 (북마크한 영상, 생성 화면의 참고 트렌드) */
  getTrendItem(videoId: string): Promise<YouTubeTrendItem | null>;
  getVideoMeta(url: string): Promise<VideoMeta>;
  /** 공개 통계 (조회수·좋아요·댓글). 영상 50개까지 1 unit */
  getVideoStats(videoIds: string[]): Promise<Record<string, VideoStats>>;
}

export interface VideoStats {
  views: number | null;
  likes: number | null;
  comments: number | null;
}

export interface NaverTrendProvider extends BaseProvider {
  readonly kind: "naver-trend";
  getInsight(query: NaverTrendQuery): Promise<NaverTrendInsight>;
  /** [더보기]: offset 부터 10개 더 (급상승은 그때 다음 후보를 더 계산한다) */
  getMore(query: NaverTrendQuery, section: NaverTrendSection, offset: number): Promise<NaverTrendMore>;
}

/** 트렌드 Provider 통칭 */
export type TrendProvider = YouTubeTrendProvider | NaverTrendProvider;

/* ───────────── Product ───────────── */

/**
 * Product Data Collector — "수집"만 담당한다. 해석이나 요약을 하지 않는다.
 * 쇼핑몰마다 구현체를 하나씩 추가한다 (Coupang, SmartStore, 이미지 OCR …).
 * 분석은 ProductAnalyzer(lib/server/services/product-analyzer.ts)가 AIProvider 로 따로 한다.
 */
export interface ProductDataCollector {
  readonly id: string;
  readonly label: string;
  supports(source: ProductSourceInput): boolean;
  collect(source: ProductSourceInput): Promise<RawProductData>;
}
