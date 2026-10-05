import { scriptFormatTypeOf } from "@/lib/script-format";
import { CONTENT_FIELDS } from "@/lib/domain/content-fields";
import type { FieldDef, FieldOption, GeneratorConfig, OutputSection } from "./types";

/* ─────────────────────────────────────────────
 * 공용 옵션 / 필드 / 출력 블록
 * 여러 기능에서 같은 의미로 쓰는 항목은 여기서 한 번만 정의한다.
 * ───────────────────────────────────────────── */

/** 카테고리 = 콘텐츠 분야 (lib/domain/content-fields.ts) */
export const CATEGORY_OPTIONS: FieldOption[] = CONTENT_FIELDS.map((v) => ({ value: v, label: v }));

/** 영상 길이 (v0.9.28: 5~8분·10분 이상은 뺐다. 예전 결과의 값은 그대로 보인다) */
const VIDEO_LENGTH_OPTIONS: FieldOption[] = [
  { value: "15s", label: "Shorts 15초" },
  { value: "30s", label: "Shorts 30초" },
  { value: "shorts", label: "Shorts 60초 이내" },
  { value: "3m", label: "3분 내외" },
];

/** NAVER 클립 영상 길이 (값은 YouTube 와 같다) */
const CLIP_LENGTH_OPTIONS: FieldOption[] = [
  { value: "15s", label: "15초" },
  { value: "30s", label: "30초" },
  { value: "shorts", label: "60초 이내" },
  { value: "3m", label: "3분 내외" },
];

/** 제품 홍보 영상·클립 콘텐츠 스타일 (hint 는 AI 에게 같이 보낸다) */
const PRODUCT_VIDEO_STYLES: FieldOption[] = [
  { value: "리뷰형", label: "리뷰형", hint: "써 본 사람 시점으로 장단점을 솔직하게 (실제 경험이 없으면 정보 기반)" },
  { value: "빠른 요약형", label: "빠른 요약형", hint: "핵심 스펙·장점만 빠르게 몰아서" },
  { value: "비교형", label: "비교형", hint: "다른 모델·이전 모델과 차이를 맞대어" },
  { value: "문제 해결형", label: "문제 해결형", hint: "흔한 불편을 짚고 이 제품으로 해결" },
  { value: "구매 전 체크형", label: "구매 전 체크형", hint: "사기 전에 꼭 확인할 점 3가지 위주" },
  { value: "가성비 추천형", label: "가성비 추천형", hint: "가격 대비 좋은 점, 누구에게 맞는지" },
  { value: "꿀팁·활용형", label: "꿀팁·활용형", hint: "잘 쓰는 법·숨은 기능을 알려 주며 자연스럽게 홍보" },
  { value: "Before/After", label: "Before/After", hint: "쓰기 전과 후의 변화를 대비" },
  { value: "언박싱형", label: "언박싱형", hint: "구성품·첫인상을 순서대로" },
  { value: "상황극·스토리형", label: "상황극·스토리형", hint: "일상 장면이나 짧은 이야기 속에서 제품 등장" },
];

/** 정보성 영상·클립 콘텐츠 스타일 */
const INFO_VIDEO_STYLES: FieldOption[] = [
  { value: "핵심 요약형", label: "핵심 요약형", hint: "결론부터, 핵심 3가지로 짧게" },
  { value: "뉴스 브리핑형", label: "뉴스 브리핑형", hint: "무슨 일이 있었는지 사실 위주로 빠르게" },
  { value: "꿀팁 리스트형", label: "꿀팁 리스트형", hint: "바로 써먹을 팁을 번호로" },
  { value: "Q&A형", label: "Q&A형", hint: "많이 묻는 질문에 답하는 방식" },
  { value: "오해 바로잡기형", label: "오해 바로잡기형", hint: "흔한 오해를 짚고 사실을 알려 줌" },
  { value: "비교 정리형", label: "비교 정리형", hint: "선택지 2~3개를 기준별로 비교" },
  { value: "순위·TOP형", label: "순위·TOP형", hint: "TOP 3~5 를 순서대로 (근거 있는 기준으로)" },
  { value: "단계별 방법형", label: "단계별 방법형", hint: "따라 하기 쉬운 순서로 1·2·3단계" },
  { value: "경고·주의형", label: "경고·주의형", hint: "하면 손해 보는 것·주의할 점 위주" },
  { value: "사례 스토리형", label: "사례 스토리형", hint: "실제 있을 법한 사례로 이야기하듯" },
];

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
  // 트렌드: 화면에 보이지 않는다 (v0.9.41). 트렌드 찾기에서 넘어온 값만 서버로 보내 생성에 참고한다
  youtubeTrend: (label = "참고 트렌드"): FieldDef => ({ name: "trendId", label, type: "hidden", source: "youtube-trends" }),
  naverTrend: (label = "트렌드 선택"): FieldDef => ({ name: "trendId", label, type: "hidden", source: "naver-trends" }),
  /** 트렌드 찾기에서 넘어온 주제 (넘어왔을 때만 보인다) */
  trendTopic: (): FieldDef => ({ name: "topic", label: "주제", type: "text", showIfInitial: true, hint: "트렌드 찾기에서 넘어온 주제입니다. 고쳐 써도 됩니다." }),
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
    defaultValue: "15s",
  }),
};

/** 출력 항목 (개수는 v0.9.13 사용자 요청 기준: 제목·Hook·CTA 10개, 키워드·태그·블로그 해시태그 30개) */
const O = {
  titles: (label = "제목 후보", count = 10): OutputSection => ({ key: "titles", label, format: "list", count }),
  topics: (): OutputSection => ({ key: "topics", label: "추천 주제", format: "list", count: 3 }),
  hooks: (): OutputSection => ({ key: "hooks", label: "Hook 후보", format: "list", count: 10, description: "첫 3초 안에 시청자를 붙잡는 문장" }),
  ctas: (description = "마지막 행동 유도 문장"): OutputSection => ({ key: "ctas", label: "CTA 후보", format: "list", count: 10, description }),
  // 대본은 3편: 좋은 부분을 골라 섞어 쓸 수 있게 (카드로 넘겨 본다, [추가 만들기]로 3편씩 더)
  script: (label = "대본"): OutputSection => ({ key: "script", label, format: "cards", count: 3, description: "서로 다른 대본 3편 · 좋은 부분을 골라 섞어 쓰세요" }),
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
      F.trendTopic(),
      F.keywords(),
      F.videoLength(),
      { name: "style", label: "콘텐츠 스타일", type: "multi", options: PRODUCT_VIDEO_STYLES, defaultValue: "리뷰형", hint: "여러 개 고르면 제목·Hook·대본을 여러 유형으로 섞어 만듭니다." },
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
      { name: "style", label: "콘텐츠 스타일", type: "multi", options: INFO_VIDEO_STYLES, defaultValue: "핵심 요약형", hint: "여러 개 고르면 제목·Hook·대본을 여러 유형으로 섞어 만듭니다." },
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
      F.trendTopic(),
      { name: "style", label: "콘텐츠 스타일", type: "multi", options: PRODUCT_VIDEO_STYLES, defaultValue: "빠른 요약형", hint: "여러 개 고르면 제목·Hook·대본을 여러 유형으로 섞어 만듭니다." },
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
    fields: [
      F.category(),
      F.naverTrend("현재 트렌드"),
      F.trendTopic(),
      F.keywords("키워드"),
      F.videoLength(CLIP_LENGTH_OPTIONS),
      { name: "style", label: "콘텐츠 스타일", type: "multi", options: INFO_VIDEO_STYLES, defaultValue: "핵심 요약형", hint: "여러 개 고르면 제목·Hook·대본을 여러 유형으로 섞어 만듭니다." },
    ],
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
      { name: "style", label: "글 스타일", type: "multi", options: BLOG_STYLE_OPTIONS, defaultValue: "정보 전달형", hint: "여러 개 고르면 제목·본문을 여러 유형으로 섞어 만듭니다." },
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

/** 생성 폼의 '대본 포맷' 드롭다운 (꺼 둠: 스타일에서 고른다) */
const SHOW_FORMAT_PICKER = false;

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
  // 대본 포맷: 생성 폼에서는 고르지 않는다 (v0.9.39 — 나의 스타일에서 고른 포맷 → 없으면 기본 포맷 ★)
  const formatType = SHOW_FORMAT_PICKER ? scriptFormatTypeOf(config.featureId) : null;
  if (formatType && !config.fields.some((f) => f.name === "scriptFormatId")) {
    config.fields.push({
      name: "scriptFormatId",
      label: "대본 포맷",
      type: "remote-select",
      source: "script-formats",
      sourceParam: `${formatType}:${styleChannelOf(config.featureId)}`,
      placeholder: "기본 포맷 자동 적용",
    });
  }
  if (!config.fields.some((f) => f.name === "styleId")) {
    config.fields.push({
      name: "styleId",
      label: "스타일",
      type: "remote-select",
      source: "styles",
      sourceParam: styleChannelOf(config.featureId),
      placeholder: "스타일 선택 (비우면 기본 스타일)",
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
