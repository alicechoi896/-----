/**
 * Generator Config 타입.
 * 생성형 기능의 "입력 폼"과 "출력 섹션"을 데이터로 정의한다.
 * 클라이언트(ContentGenerator)와 서버(content-generation service)가 같은 정의를 공유한다.
 */

export interface FieldOption {
  value: string;
  label: string;
  /** AI 에게 같이 보내는 설명 (예: 콘텐츠 스타일이 무엇인지). 화면에는 툴팁 */
  hint?: string;
}

/**
 * 원격 데이터로 채우는 선택 목록의 출처.
 * 새 출처를 추가하면 features/content-generator/useRemoteOptions.ts 에도 추가한다.
 */
export type RemoteSource = "products" | "youtube-trends" | "naver-trends" | "videos" | "styles" | "profiles" | "script-formats";

export type FieldType =
  | "text" // 한 줄 입력
  | "textarea" // 여러 줄 입력
  | "select" // 고정 옵션 드롭다운
  | "segmented" // 고정 옵션 2~5개 버튼형
  | "tags" // 쉼표로 구분하는 키워드 입력 → string[]
  | "remote-select" // 서버 데이터 선택 (제품, 트렌드, 영상, 스타일)
  | "images"; // 브라우저에서 처리하는 사진 (서버에는 사진 설명 목록만 간다 → string[])

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
  /** 고를 것이 1개 이하이면 필드를 숨긴다 (예: 콘텐츠 프로필이 1개면 자동 적용이라 묻지 않는다) */
  hideIfSingle?: boolean;
  /** 고르는 칸을 보이지 않고, 다른 화면에서 넘어온 값이 있을 때만 '넘어온 항목 · [빼기]'로 보인다 (v0.9.39: 참고 트렌드) */
  onlyWhenSet?: boolean;
  defaultValue?: string;
  /** 2열 그리드에서 차지할 칸 수 (기본 2 = 한 줄 전체) */
  span?: 1 | 2;
}

export type OutputFormat =
  | "text" // 짧은 단일 텍스트 (Hook, CTA)
  | "longtext" // 긴 본문 (대본, 설명글, 블로그 본문)
  | "list" // 번호 목록 (제목 후보, 소제목)
  | "tags" // 칩 목록 (키워드, 해시태그)
  | "cards"; // 긴 글 여러 편 — 카드로 넘겨 본다 (대본 3편, v0.9.28)

/** 배열로 저장하는 형식 (list·tags·cards) */
export const isListFormat = (f: OutputFormat) => f === "list" || f === "tags" || f === "cards";
/** 카드 직접 수정 때 대본 사이 구분선 */
export const CARD_SEPARATOR = "\n\n---\n\n";
export const splitCards = (text: string) => text.split(/\n\s*-{3,}\s*\n/).map((x) => x.trim()).filter(Boolean);

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
