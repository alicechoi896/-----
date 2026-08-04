export interface RuleUpdateRow {
  id: string;
  element: string;
  oldWeight: number;
  newWeight: number;
  performanceResult: string;
  metric: string;
  reason: string;
  analyzedContentCount: number;
  metricComparison: string;
  triggerContents: string[];
  platforms: string[];
  aiInterpretation: string;
  nextImpact: string;
}

export const INITIAL_RULE_ROWS: RuleUpdateRow[] = [
  {
    id: "problem-diagnosis-topic",
    element: "문제 진단형 주제",
    oldWeight: 0.55,
    newWeight: 0.86,
    performanceResult: "상담 신청률 평균 대비 2.3배",
    metric: "상담 전환",
    reason: "고가상품 상담 전환 우수",
    analyzedContentCount: 14,
    metricComparison: "상담 전환율 3.7% (평균 1.6% 대비 2.3배)",
    triggerContents: [
      "콘텐츠를 올려도 상담이 들어오지 않는 이유",
      "조회수는 있는데 왜 문의로 이어지지 않을까요",
      "이 문제, 원인부터 다시 짚어봅니다",
    ],
    platforms: ["네이버 블로그", "유튜브 쇼츠"],
    aiInterpretation:
      "고객이 스스로 문제를 인식하게 만드는 진단형 주제가 상담 전환에서 다른 유형 대비 뚜렷하게 높은 성과를 보였습니다.",
    nextImpact: "다음 콘텐츠 생성 시 문제 진단형 주제가 최우선 후보로 추천됩니다.",
  },
  {
    id: "question-title",
    element: "질문형 제목",
    oldWeight: 0.62,
    newWeight: 0.78,
    performanceResult: "저장률 34% 증가",
    metric: "저장률",
    reason: "고객 문제 인식 유도",
    analyzedContentCount: 21,
    metricComparison: "저장률 5.8% (질문형 미적용 대비 +34%)",
    triggerContents: ["이거 나만 겪는 문제인가요?", "왜 우리 콘텐츠는 매출로 안 이어질까요"],
    platforms: ["인스타그램", "스레드"],
    aiInterpretation: "질문형 제목이 고객의 자기 문제 인식을 유도해 저장 행동으로 이어지는 경향이 확인되었습니다.",
    nextImpact: "제목 생성 시 질문형 문장 구조의 우선순위가 높아집니다.",
  },
  {
    id: "howto-listing",
    element: "노하우 나열형",
    oldWeight: 0.71,
    newWeight: 0.44,
    performanceResult: "조회수는 높지만 구매전환 낮음",
    metric: "구매전환",
    reason: "상품 연결성이 낮음",
    analyzedContentCount: 18,
    metricComparison: "구매전환율 0.4% (전체 평균 1.1% 대비 낮음)",
    triggerContents: ["콘텐츠 자동화 노하우 5가지", "마케팅 잘하는 법 총정리"],
    platforms: ["네이버 블로그", "뉴스레터"],
    aiInterpretation: "정보 나열형 콘텐츠는 조회는 잘 되지만 상품으로 연결되는 구조가 약해 구매 전환이 낮게 나타났습니다.",
    nextImpact: "노하우 나열형 콘텐츠 생성 시 상품 연결 문단이 자동으로 추가됩니다.",
  },
  {
    id: "direct-purchase-cta",
    element: "직접 구매 CTA",
    oldWeight: 0.68,
    newWeight: 0.51,
    performanceResult: "클릭률은 높지만 구매전환 낮음",
    metric: "구매전환",
    reason: "고가상품 즉시 구매 부담",
    analyzedContentCount: 16,
    metricComparison: "구매전환율 0.6% (상담 유도 CTA 대비 낮음)",
    triggerContents: ["지금 바로 구매하기", "오늘만 이 가격"],
    platforms: ["인스타그램", "랜딩페이지"],
    aiInterpretation: "고가 교육 상품에서는 즉시 구매를 요구하는 CTA가 심리적 부담으로 작용해 전환이 낮았습니다.",
    nextImpact: "고가 상품 콘텐츠에서는 직접 구매 CTA 대신 상담 유도 CTA가 우선 적용됩니다.",
  },
  {
    id: "consult-cta",
    element: "상담 유도 CTA",
    oldWeight: 0.48,
    newWeight: 0.79,
    performanceResult: "상담 전환율 우수",
    metric: "상담 신청",
    reason: "고가 교육상품과 적합",
    analyzedContentCount: 19,
    metricComparison: "상담 신청 전환율 3.9% (직접 구매 CTA 대비 6.5배)",
    triggerContents: ["무료 상담 신청하기", "먼저 상담으로 확인해보세요"],
    platforms: ["네이버 블로그", "유튜브 쇼츠", "랜딩페이지"],
    aiInterpretation: "상담이라는 낮은 장벽의 행동 유도가 고가 상품 구매 여정 초반 단계에 더 적합했습니다.",
    nextImpact: "고가 상품 콘텐츠의 기본 CTA가 상담 유도형으로 전환됩니다.",
  },
  {
    id: "long-shorts",
    element: "45초 이상 쇼츠",
    oldWeight: 0.66,
    newWeight: 0.39,
    performanceResult: "평균 시청 유지율 저하",
    metric: "시청 유지율",
    reason: "25~35초 콘텐츠 성과 우수",
    analyzedContentCount: 11,
    metricComparison: "평균 시청 유지율 41% (25~35초 구간 대비 낮음)",
    triggerContents: ["콘텐츠 자동화 A to Z (52초)", "마케팅 전략 완전정복 (61초)"],
    platforms: ["유튜브 쇼츠"],
    aiInterpretation: "45초를 넘는 쇼츠는 후반부 이탈이 급격히 증가해 평균 시청 유지율이 낮게 나타났습니다.",
    nextImpact: "쇼츠 대본 생성 시 권장 길이가 25~35초로 조정됩니다.",
  },
];

export const GENERATION_GUIDE_CHANGES = [
  "문제 진단형 콘텐츠를 우선 추천합니다.",
  "질문형 제목의 우선순위를 높입니다.",
  "고가 교육상품에는 직접 구매보다 상담 CTA를 우선 적용합니다.",
  "쇼츠 권장 길이를 25초에서 35초 사이로 조정합니다.",
  "노하우 나열형 콘텐츠에는 고객 문제와 상품 연결 단계를 추가합니다.",
  "출처 없는 과장 수치는 사용하지 않습니다.",
];

export const BEFORE_AFTER_CONTENT = {
  before: {
    version: "v1.3",
    title: "AI 콘텐츠 제작법 5가지",
    structure: ["일반적인 노하우 나열", "직접 구매 CTA", "긴 설명 중심"],
  },
  after: {
    version: "v1.4",
    title: "콘텐츠를 올려도 상담이 들어오지 않는 이유",
    structure: ["고객 문제 진단", "원인 재정의", "해결 기준", "대표자 전문성", "상담 CTA"],
    changeBadges: ["질문형 제목 적용", "문제 진단 구조 적용", "상담 CTA 적용", "문장 길이 단축", "과장 표현 제거"],
  },
};

export interface BrainHistoryEntry {
  version: string;
  title: string;
  changes: string[];
  reflectedData: string[];
  weightChanges?: { element: string; before: number; after: number }[];
  reason: string;
  approver: string;
  reflectedAt: string;
  contentComparison: string;
}

export const STATIC_BRAIN_HISTORY: BrainHistoryEntry[] = [
  {
    version: "v1.2",
    title: "참조 콘텐츠 구조 규칙 반영",
    changes: ["참조 콘텐츠 구조 규칙 추가", "질문형 훅 규칙 추가", "브랜드 금지 표현 추가"],
    reflectedData: ["참조 콘텐츠 URL 분석 6건", "구조 패턴 4개"],
    reason: "경쟁·참조 콘텐츠의 구조 패턴을 분석해 콘텐츠 생성 가이드에 반영",
    approver: "워크스페이스 소유자",
    reflectedAt: "2026-06-02T09:12:00+09:00",
    contentComparison: "훅 문장이 서술형에서 질문형으로 전환되고, 금지 표현이 자동 필터링되기 시작함",
  },
  {
    version: "v1.3",
    title: "고객 상담자료 반영",
    changes: ["고객 상담자료 반영", "문제 진단형 전략 우선순위 상승", "상담 CTA 규칙 추가"],
    reflectedData: ["고객 상담기록 28건", "기존 콘텐츠 42건"],
    reason: "상담 기록 분석 결과 문제 진단형 콘텐츠의 상담 전환 성과가 높게 확인됨",
    approver: "워크스페이스 소유자",
    reflectedAt: "2026-07-10T14:30:00+09:00",
    contentComparison: "전략 추천 1순위가 노하우형에서 문제 진단형으로 변경됨",
  },
];
