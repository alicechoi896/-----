import type { FieldDef, FieldOption, GeneratorConfig, OutputSection } from "./types";

/* ─────────────────────────────────────────────
 * 공용 옵션 / 필드 / 출력 블록
 * 여러 기능에서 같은 의미로 쓰는 항목은 여기서 한 번만 정의한다.
 * ───────────────────────────────────────────── */

export const CATEGORY_OPTIONS: FieldOption[] = [
  "IT/가전",
  "생활/주방",
  "뷰티",
  "건강/식품",
  "육아",
  "반려동물",
  "재테크",
  "여행",
  "자기계발",
].map((v) => ({ value: v, label: v }));

const VIDEO_LENGTH_OPTIONS: FieldOption[] = [
  { value: "15s", label: "Shorts 15초" },
  { value: "30s", label: "Shorts 30초" },
  { value: "shorts", label: "Shorts 60초 이내" },
  { value: "3m", label: "3분 내외" },
  { value: "6m", label: "5~8분" },
  { value: "10m", label: "10분 이상" },
];

/** NAVER 클립 영상 길이 (값은 YouTube 와 같다) */
const CLIP_LENGTH_OPTIONS: FieldOption[] = [
  { value: "15s", label: "15초" },
  { value: "30s", label: "30초" },
  { value: "shorts", label: "60초 이내" },
  { value: "3m", label: "3분 내외" },
  { value: "6m", label: "5~8분" },
  { value: "10m", label: "10분 이상" },
];

const VIDEO_STYLE_OPTIONS: FieldOption[] = ["리뷰형", "비교형", "문제 해결형", "언박싱형", "스토리텔링형"].map((v) => ({
  value: v,
  label: v,
}));

const CLIP_STYLE_OPTIONS: FieldOption[] = ["빠른 요약형", "Before/After", "꿀팁형", "상황극형"].map((v) => ({
  value: v,
  label: v,
}));

const BLOG_STYLE_OPTIONS: FieldOption[] = ["정보 전달형", "친근한 소개형", "전문가 분석형", "비교 정리형"].map((v) => ({
  value: v,
  label: v,
}));

const BLOG_LENGTH_OPTIONS: FieldOption[] = [
  { value: "short", label: "짧게 (약 1,000자)" },
  { value: "medium", label: "보통 (약 2,000자)" },
  { value: "long", label: "길게 (3,000자 이상)" },
];

const INFO_WRITING_TYPES: FieldOption[] = ["일반 정보", "트렌드", "IT", "AI", "생활정보"].map((v) => ({
  value: v,
  label: v,
}));

const F = {
  product: (required = true): FieldDef => ({
    name: "productId",
    label: "제품 선택",
    type: "remote-select",
    source: "products",
    required,
    placeholder: "제품 라이브러리에서 선택",
    hint: "저장된 분석 데이터를 그대로 사용합니다. 상세페이지를 다시 분석하지 않습니다.",
  }),
  youtubeTrend: (label = "참고 트렌드"): FieldDef => ({
    name: "trendId",
    label,
    type: "remote-select",
    source: "youtube-trends",
    placeholder: "YouTube 트렌드에서 선택 (선택 사항)",
    span: 1,
  }),
  naverTrend: (label = "트렌드 선택"): FieldDef => ({
    name: "trendId",
    label,
    type: "remote-select",
    source: "naver-trends",
    placeholder: "네이버 트렌드에서 선택 (선택 사항)",
    span: 1,
  }),
  keywords: (label = "주요 키워드", required = false): FieldDef => ({
    name: "keywords",
    label,
    type: "tags",
    required,
    placeholder: "쉼표로 구분 (예: 무선청소기, 자취템)",
  }),
  category: (span: 1 | 2 = 1): FieldDef => ({
    name: "category",
    label: "카테고리",
    type: "select",
    options: CATEGORY_OPTIONS,
    placeholder: "카테고리 선택",
    required: true,
    span,
  }),
  videoLength: (options: FieldOption[] = VIDEO_LENGTH_OPTIONS): FieldDef => ({
    name: "length",
    label: "영상 길이",
    type: "segmented",
    options,
    defaultValue: "shorts",
  }),
};

/** 출력 항목 (개수는 v0.9.13 사용자 요청 기준: 제목·Hook·CTA 10개, 키워드·태그·블로그 해시태그 30개) */
const O = {
  titles: (label = "제목 후보", count = 10): OutputSection => ({ key: "titles", label, format: "list", count }),
  topics: (): OutputSection => ({ key: "topics", label: "추천 주제", format: "list", count: 3 }),
  hooks: (): OutputSection => ({ key: "hooks", label: "Hook 후보", format: "list", count: 10, description: "첫 3초 안에 시청자를 붙잡는 문장" }),
  ctas: (description = "마지막 행동 유도 문장"): OutputSection => ({ key: "ctas", label: "CTA 후보", format: "list", count: 10, description }),
  script: (label = "대본"): OutputSection => ({ key: "script", label, format: "longtext", description: "말할 문장만 (장면·컷·시간 표시 없음)" }),
  description: (): OutputSection => ({ key: "description", label: "설명글", format: "longtext" }),
  keywords: (label = "키워드", count = 30): OutputSection => ({ key: "keywords", label, format: "tags", count }),
  hashtags: (count = 8): OutputSection => ({ key: "hashtags", label: "해시태그", format: "tags", count }),
  tags: (): OutputSection => ({ key: "tags", label: "태그", format: "tags", count: 30, description: "YouTube 태그 입력칸용 (# 없이)" }),
};

/* ─────────────────────────────────────────────
 * 기능별 Generator Config
 * ───────────────────────────────────────────── */

export const GENERATOR_CONFIGS: Record<string, GeneratorConfig> = {
  "yt-product-video": {
    featureId: "yt-product-video",
    promptId: "youtube.product-video",
    submitLabel: "영상 원고 생성하기",
    productField: "productId",
    trendField: "trendId",
    headlineKey: "titles",
    fields: [
      F.product(),
      F.youtubeTrend(),
      { name: "referenceVideoId", label: "참고 영상", type: "remote-select", source: "videos", placeholder: "영상 URL 가져오기에서 저장한 영상", span: 1 },
      F.keywords(),
      F.videoLength(),
      { name: "style", label: "콘텐츠 스타일", type: "segmented", options: VIDEO_STYLE_OPTIONS, defaultValue: "리뷰형" },
    ],
    outputs: [O.titles(), O.hooks(), O.script(), O.ctas(), O.description(), O.keywords("주요 키워드"), O.tags()],
  },

  "yt-info-video": {
    featureId: "yt-info-video",
    promptId: "youtube.info-video",
    submitLabel: "영상 원고 생성하기",
    trendField: "trendId",
    headlineKey: "titles",
    fields: [
      F.category(),
      F.youtubeTrend(),
      { name: "topic", label: "주제", type: "text", placeholder: "예: 2026년 달라지는 청년 지원 정책", hint: "비워두면 트렌드와 카테고리를 기준으로 주제를 추천합니다." },
      F.keywords(),
      F.videoLength(),
    ],
    outputs: [O.topics(), O.titles(), O.hooks(), O.script(), O.ctas(), O.description(), O.keywords(), O.tags()],
  },

  "clip-product-content": {
    featureId: "clip-product-content",
    promptId: "naver-clip.product-content",
    submitLabel: "클립 원고 생성하기",
    productField: "productId",
    trendField: "trendId",
    headlineKey: "titles",
    fields: [
      F.product(),
      F.naverTrend(),
      { name: "style", label: "콘텐츠 스타일", type: "select", options: CLIP_STYLE_OPTIONS, defaultValue: "빠른 요약형", span: 1 },
      F.keywords(),
      F.videoLength(CLIP_LENGTH_OPTIONS),
    ],
    outputs: [
      O.titles(),
      O.hooks(),
      O.script("클립 대본"),
      O.ctas(),
      O.description(),
      O.keywords(),
      O.hashtags(),
    ],
  },

  "clip-info-content": {
    featureId: "clip-info-content",
    promptId: "naver-clip.info-content",
    submitLabel: "클립 원고 생성하기",
    trendField: "trendId",
    headlineKey: "titles",
    fields: [F.category(), F.naverTrend("현재 트렌드"), F.keywords("키워드"), F.videoLength(CLIP_LENGTH_OPTIONS)],
    outputs: [O.topics(), O.titles(), O.hooks(), O.script("클립 대본"), O.ctas(), O.description(), O.keywords()],
  },

  "blog-product-writing": {
    featureId: "blog-product-writing",
    promptId: "naver-blog.product-writing",
    submitLabel: "블로그 글 생성하기",
    productField: "productId",
    experienceField: "experience",
    headlineKey: "titles",
    fields: [
      F.product(),
      { name: "mainKeyword", label: "메인 키워드", type: "text", required: true, placeholder: "예: 무선청소기 추천", span: 1 },
      { name: "subKeywords", label: "서브 키워드", type: "tags", placeholder: "쉼표로 구분", span: 1 },
      { name: "style", label: "글 스타일", type: "select", options: BLOG_STYLE_OPTIONS, defaultValue: "정보 전달형", span: 1 },
      { name: "length", label: "글 길이", type: "select", options: BLOG_LENGTH_OPTIONS, defaultValue: "medium", span: 1 },
      {
        name: "photos",
        label: "제품 사진",
        type: "images",
        hint: "5장 정도를 권장합니다. 브라우저에서 블로그용으로 줄이고 압축하며, 서버에 저장하지 않습니다. 본문에 [사진1]처럼 자리가 표시됩니다.",
      },
      {
        name: "experience",
        label: "실제 경험",
        type: "textarea",
        placeholder: "직접 사용해 본 경험이 있다면 적어주세요. (예: 2주 사용, 원룸 기준 배터리 1회 충전으로 청소 3번)",
        hint: "비워두면 '직접 사용했다'는 표현 없이 제품 정보 기반의 소개 글로 작성합니다.",
      },
    ],
    outputs: [
      O.titles("제목 후보", 10),
      { key: "body", label: "전체 본문", format: "longtext" },
      { key: "headings", label: "소제목", format: "list", count: 5 },
      { key: "benefits", label: "제품 장점", format: "list", count: 4 },
      { key: "info", label: "정보", format: "list", count: 4, description: "스펙, 구매 전 확인 사항" },
      O.ctas("글 마무리 행동 안내 문장"),
      O.keywords(),
      O.hashtags(30),
    ],
  },

  "blog-info-writing": {
    featureId: "blog-info-writing",
    promptId: "naver-blog.info-writing",
    submitLabel: "블로그 글 생성하기",
    trendField: "trendId",
    headlineKey: "titles",
    fields: [
      { name: "writingType", label: "글 유형", type: "segmented", options: INFO_WRITING_TYPES, defaultValue: "일반 정보", required: true },
      { name: "topic", label: "주제", type: "text", required: true, placeholder: "예: 겨울철 난방비 줄이는 방법" },
      F.naverTrend("참고 트렌드"),
      { name: "mainKeyword", label: "메인 키워드", type: "text", placeholder: "예: 난방비 절약", span: 1 },
      { name: "length", label: "글 길이", type: "select", options: BLOG_LENGTH_OPTIONS, defaultValue: "medium", span: 1 },
    ],
    outputs: [
      O.titles("제목 후보", 10),
      { key: "body", label: "전체 본문", format: "longtext" },
      { key: "headings", label: "소제목", format: "list", count: 5 },
      O.ctas("글 마무리 행동 안내 문장"),
      O.keywords(),
      O.hashtags(30),
    ],
  },

  "blog-auto-writing": {
    featureId: "blog-auto-writing",
    promptId: "naver-blog.auto-writing",
    submitLabel: "자동으로 글 완성하기",
    productField: "productId",
    headlineKey: "titles",
    fields: [
      { name: "topic", label: "주제", type: "text", required: true, placeholder: "한 줄이면 충분합니다. 예: 자취생 겨울 필수템" },
      { name: "writingType", label: "글 유형", type: "segmented", options: [{ value: "정보", label: "정보" }, { value: "제품 소개", label: "제품 소개" }, { value: "트렌드", label: "트렌드" }], defaultValue: "정보" },
      { ...F.product(false), hint: "선택하면 제품 정보를 함께 활용합니다." },
    ],
    outputs: [O.titles(), { key: "body", label: "전체 본문", format: "longtext" }, O.ctas("글 마무리 행동 안내 문장"), O.keywords(), O.hashtags(30)],
  },
};

/** 기능 ID → 스타일을 고를 채널 */
function styleChannelOf(featureId: string): string {
  return featureId.startsWith("yt-") ? "youtube" : featureId.startsWith("clip-") ? "naver-clip" : "naver-blog";
}

// 모든 생성 기능 폼 마지막에 "스타일"·"콘텐츠 프로필" 선택을 붙인다
//  - 스타일: 비우면 채널 기본 스타일 자동 적용
//  - 콘텐츠 프로필: 프로필이 2개 이상일 때만 보인다. 비우면 스타일에 연결된 프로필 → 기본 프로필
for (const config of Object.values(GENERATOR_CONFIGS)) {
  if (!config.fields.some((f) => f.name === "profileId")) {
    config.fields.push({
      name: "profileId",
      label: "콘텐츠 프로필",
      type: "remote-select",
      source: "profiles",
      placeholder: "자동 (스타일 연결 → 기본 프로필)",
      hideIfSingle: true,
    });
  }
  if (!config.fields.some((f) => f.name === "styleId")) {
    config.fields.push({
      name: "styleId",
      label: "스타일",
      type: "remote-select",
      source: "styles",
      sourceParam: styleChannelOf(config.featureId),
      placeholder: "기본 스타일 자동 적용",
    });
  }
}

export function getGeneratorConfig(featureId: string): GeneratorConfig {
  const config = GENERATOR_CONFIGS[featureId];
  if (!config) throw new Error(`Generator config not found: ${featureId}`);
  return config;
}

export function findGeneratorConfig(featureId: string): GeneratorConfig | undefined {
  return GENERATOR_CONFIGS[featureId];
}
