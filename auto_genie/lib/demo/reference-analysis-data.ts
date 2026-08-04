export const DEFAULT_REFERENCE_URL = "https://blog.naver.com/marketing-insight/223456789";

export const ANALYSIS_PURPOSES = ["구조 분석", "훅 분석", "CTA 분석", "브랜드 말투 분석"] as const;
export type AnalysisPurpose = (typeof ANALYSIS_PURPOSES)[number];

export function detectPlatform(url: string): string {
  const lower = url.toLowerCase();
  if (lower.includes("blog.naver.com") || lower.includes("brunch.co.kr")) return "네이버 블로그";
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "유튜브";
  if (lower.includes("instagram.com")) return "인스타그램";
  if (lower.includes("threads.net")) return "스레드";
  if (!url) return "-";
  return "웹페이지";
}

export interface PipelineStep {
  id: string;
  label: string;
}

export const ANALYSIS_STEPS: PipelineStep[] = [
  { id: "validate", label: "URL 유효성 검사" },
  { id: "platform", label: "플랫폼 유형 판별" },
  { id: "extract", label: "본문 및 메타데이터 추출" },
  { id: "split", label: "콘텐츠 요소 분리" },
  { id: "pattern", label: "구조 패턴 분석" },
  { id: "brand", label: "브랜드 적합성 검토" },
  { id: "result", label: "분석 결과 생성" },
];

export const REFERENCE_EXCERPT = `"요즘 콘텐츠는 열심히 올리는데 왜 상담 문의는 안 늘어날까요?
저도 처음엔 그냥 열심히만 하면 되는 줄 알았습니다.
그런데 조회수 높은 콘텐츠 100개를 직접 뜯어보고 나서야 이유를 알았어요..."
(이하 본문 생략 — 시제품용 짧은 예시 발췌)`;

export const EXTRACTED_STRUCTURE_SUMMARY = {
  hookType: "질문형 문제 제기",
  contentFlow: ["문제", "원인", "실패 사례", "해결 방법", "상품 연결"],
  ctaPosition: "해결 방법 제시 직후",
  avgSentenceLength: 18.4,
  keyExpressionStyles: [
    "짧은 문장",
    "직접적인 질문",
    "구체적인 사례",
    "고객의 실패 경험을 먼저 제시",
    "해결 방법 뒤에 상품을 연결",
  ],
  excludedElements: ["브랜드 과장 표현", "출처 없는 수치", "무조건적인 성공 표현", "타사 고유 문구"],
};

export interface ExtractedElementCard {
  label: string;
  value: string;
}

export const EXTRACTED_ELEMENT_CARDS: ExtractedElementCard[] = [
  { label: "훅", value: "질문형 문제 제기" },
  { label: "문제 제기 방식", value: "고객이 겪는 상황을 1인칭으로 재현" },
  { label: "전개 순서", value: "문제 → 원인 → 실패 사례 → 해결 방법 → 상품 연결" },
  { label: "사례 배치", value: "원인 설명 직후, 해결 방법 제시 전" },
  { label: "CTA 유형", value: "상담 유도형" },
  { label: "CTA 위치", value: "해결 방법 제시 직후" },
  { label: "평균 문장 길이", value: "18.4자" },
  { label: "금지 표현", value: "브랜드 과장, 출처 없는 수치" },
];

export const ANALYSIS_EVIDENCE = [
  { label: "분석한 문단", value: 12 },
  { label: "추출한 문장", value: 38 },
  { label: "확인한 CTA", value: 3 },
  { label: "발견한 구조 패턴", value: 6 },
  { label: "브랜드 충돌 가능 요소", value: 2 },
];

export const BRAIN_REFLECTION_RESULT = [
  "신규 콘텐츠 구조 규칙 4개 추가",
  "브랜드 금지 표현 2개 추가",
  "CTA 배치 규칙 1개 추가",
];
