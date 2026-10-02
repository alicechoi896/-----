import type {
  ApiConnection,
  AuditLog,
  UserSettings,
  GeneratedContent,
  PerformanceMetric,
  Product,
  ProductAnalysis,
  ProductSource,
  ReferenceVideo,
  RolePermission,
  SavedFilter,
  SavedTrend,
  UserProfile,
  UserFeedback,
  UserStyle,
} from "@/lib/types";
import { PRODUCT_CATALOG } from "./product-catalog";

export const DEMO_USER_ID = "demo-user";

/** 저장소 전체 상태. 실제 DB 의 테이블과 1:1 로 대응한다 (docs/DATA_MODEL.md) */
export interface StoreState {
  profiles: UserProfile[];
  rolePermissions: RolePermission[];
  auditLogs: AuditLog[];
  settings: UserSettings[];
  connections: ApiConnection[];
  products: Product[];
  productSources: ProductSource[];
  productAnalyses: ProductAnalysis[];
  contents: GeneratedContent[];
  styles: UserStyle[];
  feedback: UserFeedback[];
  performance: PerformanceMetric[];
  videos: ReferenceVideo[];
  savedFilters: SavedFilter[];
  savedTrends: SavedTrend[];
}

const DAY = 86_400_000;

export function createSeedState(now: number = Date.now()): StoreState {
  const iso = (daysAgo: number) => new Date(now - daysAgo * DAY).toISOString();
  const userId = DEMO_USER_ID;

  const products: Product[] = [];
  const productSources: ProductSource[] = [];
  const productAnalyses: ProductAnalysis[] = [];

  PRODUCT_CATALOG.slice(0, 3).forEach((entry, i) => {
    const productId = `prd_seed${i + 1}`;
    const analysisId = `pan_seed${i + 1}`;
    const createdAt = iso(20 - i * 5);
    const a = entry.analysis;
    products.push({
      id: productId,
      userId,
      name: a.basicInfo.name,
      brand: a.basicInfo.brand,
      category: a.basicInfo.category,
      seller: a.basicInfo.seller,
      imageUrl: null,
      sourceUrl: a.basicInfo.url,
      oneLiner: a.summary.oneLiner,
      keyBenefits: a.summary.keyBenefits,
      tags: entry.tags,
      currentAnalysisId: analysisId,
      createdAt,
      updatedAt: createdAt,
      lastUsedAt: i === 2 ? null : iso(i + 1),
    });
    productSources.push({
      id: `psrc_seed${i + 1}`,
      productId,
      type: "url",
      raw: { ...entry.raw, sourceType: "url", collectedBy: "mock-collector", collectedAt: createdAt },
      createdAt,
    });
    productAnalyses.push({
      id: analysisId,
      productId,
      version: 1,
      ...a,
      meta: { provider: "mock", model: "mock-analyzer-v1", promptId: "product.analysis", promptVersion: "1.0.0" },
      createdAt,
    });
  });

  const styles: UserStyle[] = [
    {
      id: "sty_seed1",
      userId,
      name: "친근한 리뷰어",
      channelIds: ["youtube"],
      tone: "친근하고 빠른 말투, 반말 없이 존댓말",
      description: "첫 문장에서 시청자의 불편을 짚고, 30초 안에 핵심 장점을 보여준다.",
      rules: ["첫 문장은 질문형 Hook", "장점은 3개까지만", "가격은 '20만 원 이하'처럼 구간으로 표현"],
      examplePhrases: ["이거 하나면 정리 끝이에요", "딱 세 가지만 보세요"],
      bannedPhrases: ["무조건 사세요", "역대급"],
      hooks: ["아직도 이렇게 하세요?", "딱 30초만 보시면 됩니다"],
      ctas: ["더 자세한 정보는 고정 댓글에 있어요", "도움이 됐다면 구독 부탁드려요"],
      isDefault: true,
      createdAt: iso(30),
      updatedAt: iso(10),
    },
    {
      id: "sty_seed2",
      userId,
      name: "차분한 정보 블로거",
      channelIds: ["naver-blog"],
      tone: "차분하고 신뢰감 있는 설명체",
      description: "검색 의도에 맞는 소제목 구조, 표와 체크리스트를 적극적으로 쓴다.",
      rules: ["소제목은 5개 내외", "본문 첫 단락에 메인 키워드 포함", "마지막에 요약 체크리스트"],
      examplePhrases: ["구매 전에 이 세 가지를 확인해 보세요"],
      bannedPhrases: ["대박", "강추"],
      hooks: ["구매 전에 가장 많이 묻는 질문부터 정리했습니다"],
      ctas: ["궁금한 점은 댓글로 남겨 주세요", "이웃 추가하시면 다음 글도 받아 보실 수 있어요"],
      isDefault: true,
      createdAt: iso(28),
      updatedAt: iso(12),
    },
    {
      id: "sty_seed3",
      userId,
      name: "클립 숏폼 템포",
      channelIds: ["naver-clip", "youtube"],
      tone: "짧고 리듬감 있는 문장",
      description: "한 문장 15자 내외, 장면 전환마다 자막 한 줄.",
      rules: ["대본은 6~8컷", "마지막 컷은 행동 유도"],
      examplePhrases: ["이거 보세요", "끝!"],
      bannedPhrases: [],
      hooks: ["이거 모르면 손해예요"],
      ctas: ["저장해 두고 필요할 때 보세요"],
      isDefault: false,
      createdAt: iso(25),
      updatedAt: iso(25),
    },
  ];

  const baseContext = { avoidNotes: [], performanceHints: [], trend: null, notes: [] };
  const contents: GeneratedContent[] = [
    {
      id: "cnt_seed1",
      userId,
      projectId: null,
      featureId: "yt-product-video",
      channelId: "youtube",
      productId: "prd_seed1",
      input: { productId: "prd_seed1", length: "shorts", style: "리뷰형", keywords: ["자취템"] },
      output: {
        titles: [
          "1.3kg 무선청소기, 자취방 청소가 10분이면 끝나는 이유",
          "무거운 청소기 때문에 청소 미루셨다면",
          "먼지가 눈에 보이는 청소기, 클린웨이브 S9",
          "20만 원 이하 무선청소기 고를 때 볼 3가지",
          "자취생 청소기, 이 스펙이면 충분합니다",
        ],
        hook: "청소기가 무거워서 안 꺼내게 된다면, 이 영상 보세요.",
        script: "(샘플 대본) 1.3kg 무게 비교 → LED 헤드 Before/After → 원터치 먼지통 → 가격대 정리 → 구독 유도",
        description: "1.3kg 초경량 무선청소기 클린웨이브 S9 프로의 특징을 정리했습니다.",
        keywords: ["무선청소기 추천", "자취 청소기", "가벼운 무선청소기"],
        hashtags: ["#무선청소기", "#자취템", "#청소루틴"],
      },
      headline: "1.3kg 무선청소기, 자취방 청소가 10분이면 끝나는 이유",
      promptId: "youtube.product-video",
      promptVersion: "1.0.0",
      provider: "mock",
      model: "mock-writer-v1",
      context: {
        ...baseContext,
        product: { id: "prd_seed1", name: "클린웨이브 무선청소기 S9 프로", analysisVersion: 1 },
        style: { id: "sty_seed1", name: "친근한 리뷰어" },
        exemplars: [],
      },
      isExemplar: true,
      rating: "up",
      createdAt: iso(1),
    },
    {
      id: "cnt_seed2",
      userId,
      projectId: null,
      featureId: "blog-product-writing",
      channelId: "naver-blog",
      productId: "prd_seed2",
      input: { productId: "prd_seed2", mainKeyword: "오븐형 에어프라이어", style: "정보 전달형", length: "medium" },
      output: {
        titles: ["오븐형 에어프라이어 고르는 법, 쿡마스터 12L 스펙 정리", "바스켓형에서 오븐형으로 바꾸기 전 확인할 것"],
        body: "(샘플 본문) 제품 정보 기준으로 정리한 소개 글입니다.",
        headings: ["오븐형 에어프라이어란?", "쿡마스터 12L 주요 스펙", "구매 전 확인할 점"],
        benefits: ["상하 듀얼 히터", "투명 조리창"],
        info: ["용량 12L", "소비전력 1700W"],
        cta: "자세한 구성은 아래 링크에서 확인해 보세요.",
        keywords: ["오븐형 에어프라이어", "에어프라이어 추천"],
        hashtags: ["#에어프라이어", "#주방가전"],
      },
      headline: "오븐형 에어프라이어 고르는 법, 쿡마스터 12L 스펙 정리",
      promptId: "naver-blog.product-writing",
      promptVersion: "1.0.0",
      provider: "mock",
      model: "mock-writer-v1",
      context: {
        ...baseContext,
        product: { id: "prd_seed2", name: "쿡마스터 오븐형 에어프라이어 12L", analysisVersion: 1 },
        style: { id: "sty_seed2", name: "차분한 정보 블로거" },
        exemplars: [],
        notes: ["실제 경험 미입력 → 사용 후기 표현 금지"],
      },
      isExemplar: false,
      rating: null,
      createdAt: iso(2),
    },
    {
      id: "cnt_seed3",
      userId,
      projectId: null,
      featureId: "clip-info-content",
      channelId: "naver-clip",
      productId: null,
      input: { category: "생활/주방", keywords: ["난방비"] },
      output: {
        topics: ["난방비 절약 습관", "단열 뽁뽁이 붙이는 법", "전기요 vs 온수매트"],
        title: "난방비 반으로 줄이는 3가지 습관",
        script: "(샘플 대본) 컷1 보일러 외출 모드의 진실 → 컷2 뽁뽁이 → 컷3 가습기 → 컷4 정리",
        description: "겨울 난방비를 줄이는 생활 습관을 30초로 정리했습니다.",
        keywords: ["난방비 절약", "겨울 꿀팁"],
      },
      headline: "난방비 반으로 줄이는 3가지 습관",
      promptId: "naver-clip.info-content",
      promptVersion: "1.0.0",
      provider: "mock",
      model: "mock-writer-v1",
      context: { ...baseContext, product: null, style: { id: "sty_seed3", name: "클립 숏폼 템포" }, exemplars: [] },
      isExemplar: false,
      rating: "down",
      createdAt: iso(4),
    },
  ];

  const feedback: UserFeedback[] = [
    { id: "fb_seed1", userId, contentId: "cnt_seed1", featureId: "yt-product-video", rating: "up", reason: "Hook이 바로 써먹을 수 있는 수준", editedOutput: null, createdAt: iso(1) },
    {
      id: "fb_seed2",
      userId,
      contentId: "cnt_seed3",
      featureId: "clip-info-content",
      rating: "down",
      reason: "제목이 너무 평범함. 숫자와 손실 회피 표현이 더 필요",
      editedOutput: { title: "이거 모르면 이번 겨울 난방비 2배 나옵니다" },
      createdAt: iso(3),
    },
  ];

  const performance: PerformanceMetric[] = [
    { id: "pf_seed1", contentId: "cnt_seed1", channelId: "youtube", platformUrl: "https://youtube.com/shorts/mock1", views: 48_200, clicks: 1_310, ctr: 7.4, likes: 1_920, comments: 84, conversions: 37, revenue: 102_000, source: "mock", measuredAt: iso(0) },
    { id: "pf_seed2", contentId: "cnt_seed2", channelId: "naver-blog", platformUrl: "https://blog.naver.com/mock/2", views: 3_120, clicks: 214, ctr: 6.9, likes: 41, comments: 9, conversions: 6, revenue: 18_400, source: "mock", measuredAt: iso(0) },
    { id: "pf_seed3", contentId: "cnt_seed3", channelId: "naver-clip", platformUrl: null, views: 9_870, clicks: null, ctr: null, likes: 233, comments: 12, conversions: null, revenue: null, source: "manual", measuredAt: iso(1) },
  ];

  const videos: ReferenceVideo[] = [
    {
      id: "vid_seed1",
      userId,
      url: "https://www.youtube.com/watch?v=mock1",
      platform: "youtube",
      title: "자취방 청소 10분 루틴, 무선청소기 하나로 끝",
      channelName: "혼살림 연구소",
      durationSec: 48,
      thumbnailColor: "#dbe4ff",
      note: "Hook 구성 참고",
      createdAt: iso(3),
    },
    {
      id: "vid_seed2",
      userId,
      url: "https://www.youtube.com/watch?v=mock2",
      platform: "youtube",
      title: "에어프라이어 오븐형 vs 바스켓형, 1년 쓰면 차이 나는 것",
      channelName: "주방실험실",
      durationSec: 742,
      thumbnailColor: "#ffe3e3",
      note: "비교 구성 참고",
      createdAt: iso(6),
    },
  ];

  return {
    // 데모 모드(Supabase 미설정)의 사용자는 관리자로 시작한다
    profiles: [
      { id: userId, email: "demo@example.com", name: "데모 관리자", role: "admin", status: "active", approvedAt: iso(60), approvedBy: null, termsAgreedAt: iso(60), createdAt: iso(60), updatedAt: iso(60) },
      // 승인 화면을 데모로 볼 수 있도록 넣어 둔 예시 회원 (가상)
      { id: "demo-member-1", email: "kim.creator@example.com", name: "김크리", role: "gold", status: "active", approvedAt: iso(10), approvedBy: userId, termsAgreedAt: iso(11), createdAt: iso(11), updatedAt: iso(10) },
      { id: "demo-member-2", email: "lee.blog@example.com", name: "이블로", role: "silver", status: "pending", approvedAt: null, approvedBy: null, termsAgreedAt: iso(1), createdAt: iso(1), updatedAt: iso(1) },
      { id: "demo-member-3", email: "park.clip@example.com", name: "박클립", role: "silver", status: "pending", approvedAt: null, approvedBy: null, termsAgreedAt: iso(0.2), createdAt: iso(0.2), updatedAt: iso(0.2) },
    ],
    rolePermissions: [],
    settings: [],
    auditLogs: [
      { id: "log_seed1", actorId: userId, actorEmail: "demo@example.com", actorName: "데모 관리자", action: "user.approve", targetType: "user", targetId: "demo-member-1", targetLabel: "김크리", detail: { role: "gold", roleLabel: "골드" }, createdAt: iso(10) },
    ],
    connections: [],
    products,
    productSources,
    productAnalyses,
    contents,
    styles,
    feedback,
    performance,
    videos,
    savedFilters: [],
    savedTrends: [],
  };
}
