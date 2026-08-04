export const RECOMMENDATION = {
  strategyName: "문제 진단형 콘텐츠",
  confidence: 87,
};

export const EVIDENCE_SOURCES = [
  { label: "대표자 강의자료", count: 3 },
  { label: "고객 상담기록", count: 28 },
  { label: "기존 콘텐츠", count: 42 },
  { label: "최근 90일 성과 데이터", count: 58 },
];

export const PERFORMANCE_COMPARISON = [
  { label: "문제 진단형 콘텐츠", rate: 3.7 },
  { label: "노하우형 콘텐츠", rate: 1.6 },
  { label: "성공 사례형 콘텐츠", rate: 2.9 },
];

export const APPLIED_RULES = [
  "고객 문제 진단",
  "문제의 원인 재정의",
  "해결 기준 제시",
  "대표자의 전문지식 연결",
  "상담 CTA 배치",
];

export const RULE_FLOW = ["문제 진단", "원인 재정의", "해결 기준", "전문성 근거", "상담 CTA"];

export interface EvidenceDetail {
  type: string;
  name: string;
  description: string;
  usageRate: number;
  analyzedCount: string;
  appliedElements: string[];
  confidence: number;
  lastReflectedAt: string;
}

export const EVIDENCE_DETAILS: EvidenceDetail[] = [
  {
    type: "대표자 강의자료",
    name: "콘텐츠와 상품 사이의 고객 여정",
    description: "대표자가 직접 작성한 강의자료 중 고객 여정 설계 관련 챕터",
    usageRate: 94,
    analyzedCount: "3건",
    appliedElements: ["문제 진단 구조", "전문성 근거 배치"],
    confidence: 94,
    lastReflectedAt: "2026-07-10",
  },
  {
    type: "고객 상담기록",
    name: "'조회수는 있지만 문의가 없다' 관련 질문",
    description: "최근 상담 기록 중 콘텐츠-상담 전환 관련 질문 28건",
    usageRate: 91,
    analyzedCount: "28건",
    appliedElements: ["문제 진단", "원인 재정의"],
    confidence: 91,
    lastReflectedAt: "2026-07-10",
  },
  {
    type: "기존 콘텐츠",
    name: "문제 진단형 콘텐츠 12건",
    description: "과거 발행된 문제 진단형 콘텐츠와 그 성과",
    usageRate: 88,
    analyzedCount: "12건",
    appliedElements: ["평균 상담 전환율 3.7%"],
    confidence: 88,
    lastReflectedAt: "2026-07-22",
  },
  {
    type: "최근 90일 성과",
    name: "노하우형 대비 문제 진단형 상담 전환율 2.3배",
    description: "최근 90일 발행 콘텐츠의 전략 유형별 성과 비교",
    usageRate: 92,
    analyzedCount: "58건",
    appliedElements: ["상담 CTA 배치", "해결 기준 제시"],
    confidence: 92,
    lastReflectedAt: "2026-08-01",
  },
];
