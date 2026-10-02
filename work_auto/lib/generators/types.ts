/**
 * Generator Config 타입.
 * 생성형 기능의 "입력 폼"과 "출력 섹션"을 데이터로 정의한다.
 * 클라이언트(ContentGenerator)와 서버(content-generation service)가 같은 정의를 공유한다.
 */

export interface FieldOption {
  value: string;
  label: string;
}

/**
 * 원격 데이터로 채우는 선택 목록의 출처.
 * 새 출처를 추가하면 features/content-generator/useRemoteOptions.ts 에도 추가한다.
 */
export type RemoteSource = "products" | "youtube-trends" | "naver-trends" | "videos" | "styles";

export type FieldType =
  | "text" // 한 줄 입력
  | "textarea" // 여러 줄 입력
  | "select" // 고정 옵션 드롭다운
  | "segmented" // 고정 옵션 2~5개 버튼형
  | "tags" // 쉼표로 구분하는 키워드 입력 → string[]
  | "remote-select"; // 서버 데이터 선택 (제품, 트렌드, 영상, 스타일)

export interface FieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  options?: FieldOption[];
  source?: RemoteSource;
  /** 원격 목록을 거르는 값 (예: styles 는 채널 ID 로 그 채널에 쓸 수 있는 스타일만 보여준다) */
  sourceParam?: string;
  defaultValue?: string;
  /** 2열 그리드에서 차지할 칸 수 (기본 2 = 한 줄 전체) */
  span?: 1 | 2;
}

export type OutputFormat =
  | "text" // 짧은 단일 텍스트 (Hook, CTA)
  | "longtext" // 긴 본문 (대본, 설명글, 블로그 본문)
  | "list" // 번호 목록 (제목 후보, 소제목)
  | "tags"; // 칩 목록 (키워드, 해시태그)

export interface OutputSection {
  key: string;
  label: string;
  format: OutputFormat;
  /** list 형식의 기대 개수 (AI 에 전달하고 Mock 에서도 사용) */
  count?: number;
  description?: string;
}

export interface GeneratorConfig {
  /** lib/registry/features.ts 의 id 와 같아야 한다 */
  featureId: string;
  /** lib/server/ai/prompts 의 템플릿 id */
  promptId: string;
  submitLabel: string;
  fields: FieldDef[];
  outputs: OutputSection[];
  /** 생성 이력 목록에 대표로 보여줄 출력 key (list 면 첫 항목) */
  headlineKey: string;
  /** 제품을 받는 필드 이름 (Product Memory 주입, lastUsedAt 갱신에 사용) */
  productField?: string;
  /** 트렌드를 받는 필드 이름 (Trend Context 주입) */
  trendField?: string;
  /** 사용자 실제 경험 필드 (비어 있으면 정직성 가드레일 활성화) */
  experienceField?: string;
}
