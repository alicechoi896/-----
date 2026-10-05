import "server-only";
import type { StyleContext } from "./style-context";
import type {
  ContentProfile,
  ContextSummary,
  GeneratedContent,
  GeneratedValue,
  Product,
  ProductAnalysis,
  ReferenceVideo,
  ScriptFormat,
  TrendOption,
  UserStyle,
} from "@/lib/types";

/**
 * ContextBuilder 가 조립하는 "생성 1회분"의 AI Memory.
 * 프롬프트 템플릿은 이 객체만 보고 Context 블록을 만든다.
 */
export interface GenerationContext {
  /** 콘텐츠 프로필: 무엇을 다루는가 (관심분야·키워드·제외 키워드). 스타일에 연결된 프로필 → 기본 프로필 */
  contentProfile: ContentProfile | null;
  /** Product Memory: 저장된 분석 결과 (재분석하지 않는다) */
  product: { product: Product; analysis: ProductAnalysis } | null;
  /** Style Memory: 채널 기본 스타일 */
  style: UserStyle | null;
  /** 이번 생성용 스타일 지시 (표본 추출 + 영상/블로그 해석). buildStyleContext() 결과 */
  styleContext: StyleContext | null;
  /** Content History: 같은 기능에서 "좋은 결과"로 저장된 예시 (few-shot) */
  exemplars: GeneratedContent[];
  /** 좋은 예시 요약본 (긍정 결과 무작위 + 일반 1개, 최근에 쓴 예시는 덜 고른다) */
  examples: { id: string; kind: "positive" | "general"; text: string }[];
  /** 팀 공통 학습 프로필에서 고른 Insight (없으면 null → 학습 없이 생성) */
  learning: { id: string; version: number; insights: { category: string; text: string; confidence: number }[] } | null;
  /** Feedback Data: 최근 "별로예요" 사유와 사용자 수정본 → 피해야 할 패턴 */
  avoid: { reason: string; edited: Record<string, GeneratedValue> | null }[];
  /** Performance Data: 성과가 좋았던 콘텐츠의 특징 */
  performanceHints: string[];
  /** 현재 트렌드 */
  trend: TrendOption | null;
  referenceVideo: ReferenceVideo | null;
  /** 대본 포맷: 생성 폼에서 고른 것 → 이 유형·채널의 기본 포맷 (영상·클립만, docs/SCRIPT_FORMATS.md) */
  scriptFormat: ScriptFormat | null;
  /** full: 영상·클립 (대본 구조 + 제목) / titles: 블로그 (잘된 제목만 제목 패턴으로) */
  scriptFormatUse: "full" | "titles";
  /** 정직성 가드레일 활성화 여부 (실제 경험 미입력) */
  honestyGuard: boolean;
  /** 결과와 함께 저장할 요약 */
  summary: ContextSummary;
}
