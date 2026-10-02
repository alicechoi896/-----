import type { ChannelId, ID, ISODate } from "./common";

/** 생성 결과의 한 섹션 값: 단일 텍스트 또는 목록 */
export type GeneratedValue = string | string[];

/**
 * 생성에 실제로 사용된 Context 요약.
 * "왜 이런 결과가 나왔는가"를 재현하고 설명하기 위해 결과와 함께 저장한다.
 */
export interface ContextSummary {
  /** 콘텐츠 프로필 (예전 결과에는 없을 수 있다) */
  profile?: { id: ID; name: string } | null;
  product: { id: ID; name: string; analysisVersion: number } | null;
  style: { id: ID; name: string } | null;
  exemplars: { id: ID; label: string }[];
  avoidNotes: string[];
  performanceHints: string[];
  trend: { id: ID; title: string } | null;
  /** 경고나 참고 (예: "실제 경험 미입력 → 사용 후기 표현 금지") */
  notes: string[];
  /** 이번 생성에 실제로 보낸 스타일 표본 (v0.9.9~, 예전 결과에는 없다) */
  styleSamples?: StyleSampleSnapshot | null;
}

/** 나의 스타일에서 이번 생성에 보낸 항목. Hook·CTA·제목 패턴·자주 쓰는 표현은 많으면 무작위 표본이다 */
export interface StyleSampleSnapshot {
  styleId: ID;
  /** video: YouTube·NAVER 클립, blog: NAVER 블로그 (Hook·CTA·제목 패턴 해석이 다르다) */
  medium: "video" | "blog";
  hooks: string[];
  ctas: string[];
  titlePatterns: string[];
  examplePhrases: string[];
  /** 규칙·금지 표현은 항상 전부 보낸다 */
  rulesCount: number;
  bannedCount: number;
  /** 저장된 전체 개수 */
  totals: { examplePhrases: number; hooks: number; ctas: number; titlePatterns: number };
}

/** 같은 제품이나 주제로 만든 생성물을 묶는 단위 (V2부터 UI에서 사용) */
export interface ContentProject {
  id: ID;
  userId: ID;
  channelId: ChannelId;
  title: string;
  productId: ID | null;
  status: "active" | "archived";
  createdAt: ISODate;
  updatedAt: ISODate;
}

export interface GeneratedContent {
  id: ID;
  userId: ID;
  projectId: ID | null;
  featureId: string;
  channelId: ChannelId;
  productId: ID | null;
  /** 사용자가 입력한 폼 값 */
  input: Record<string, unknown>;
  /** outputs[].key → 값 */
  output: Record<string, GeneratedValue>;
  /** 결과 목록에 보여줄 대표 제목 */
  headline: string;
  promptId: string;
  promptVersion: string;
  provider: string;
  model: string;
  context: ContextSummary;
  /** "좋은 결과로 저장" = 이후 생성의 few-shot 예시 후보 */
  isExemplar: boolean;
  rating: "up" | "down" | null;
  createdAt: ISODate;
}

export interface GenerateContentRequest {
  featureId: string;
  input: Record<string, unknown>;
}
