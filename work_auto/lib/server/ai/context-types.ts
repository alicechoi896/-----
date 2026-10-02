import "server-only";
import type {
  ContextSummary,
  GeneratedContent,
  GeneratedValue,
  Product,
  ProductAnalysis,
  ReferenceVideo,
  TrendOption,
  UserStyle,
} from "@/lib/types";

/**
 * ContextBuilder 가 조립하는 "생성 1회분"의 AI Memory.
 * 프롬프트 템플릿은 이 객체만 보고 Context 블록을 만든다.
 */
export interface GenerationContext {
  /** Product Memory: 저장된 분석 결과 (재분석하지 않는다) */
  product: { product: Product; analysis: ProductAnalysis } | null;
  /** Style Memory: 채널 기본 스타일 */
  style: UserStyle | null;
  /** Content History: 같은 기능에서 "좋은 결과"로 저장된 예시 (few-shot) */
  exemplars: GeneratedContent[];
  /** Feedback Data: 최근 "별로예요" 사유와 사용자 수정본 → 피해야 할 패턴 */
  avoid: { reason: string; edited: Record<string, GeneratedValue> | null }[];
  /** Performance Data: 성과가 좋았던 콘텐츠의 특징 */
  performanceHints: string[];
  /** 현재 트렌드 */
  trend: TrendOption | null;
  referenceVideo: ReferenceVideo | null;
  /** 정직성 가드레일 활성화 여부 (실제 경험 미입력) */
  honestyGuard: boolean;
  /** 결과와 함께 저장할 요약 */
  summary: ContextSummary;
}
