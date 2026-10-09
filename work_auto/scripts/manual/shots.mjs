/**
 * 매뉴얼 화면 목록. id = lib/manual/content.ts 의 section.shot
 * - url: 데모 서버 주소 (public: true 면 운영 사이트의 공개 화면 — 로그인·가입)
 * - prepare(page): 찍기 전 동작 (탭 누르기, 입력, 생성 …)
 * - clip(page): 이 요소만 잘라 찍는다 (없으면 화면 전체)
 * - scrollTo(page): 이 요소가 위에 오게 스크롤
 * - marks: { 번호: page => locator } — 매뉴얼 단계 번호와 같은 번호로 강조 상자를 그린다
 */
import path from "node:path";

const SAMPLE_CSV = path.resolve(import.meta.dirname, "../../public/samples/style-starter.csv");
const SAMPLE_SCRIPTS = path.resolve(import.meta.dirname, "./sample-scripts.txt");

const btn = (p, text) => p.locator("button", { hasText: text });
const sideLink = (p, name) => p.locator("aside").getByRole("link", { name, exact: true });
/** 제목(h2/h3)이 들어 있는 가장 안쪽 카드 */
const card = (p, title) => p.locator("section, div[class*='rounded-card'], div[class*='rounded-control']").filter({ has: p.locator("h2, h3", { hasText: title }) }).last();
/** 글자가 들어 있는 가장 안쪽 카드 */
const cardWith = (p, text) => p.locator("main section, main div[class*='rounded-card']").filter({ hasText: text }).last();
/** 라벨이 붙은 입력 칸 묶음 (FormField) */
const field = (p, label) => p.locator("main div.flex.flex-col").filter({ has: p.locator("label", { hasText: label }) }).last();
/** 제목(h2/h3)을 가진 카드 (rounded-card) */
const headCard = (p, title) => p.locator("h2, h3", { hasText: title }).first().locator("xpath=ancestor::*[contains(@class,'rounded-card')][1]");
const tab = (p, name) => p.locator("[role=tab], [role=radio]", { hasText: name }).first();

async function pickProduct(p, name = "클린웨이브") {
  await btn(p, "제품 라이브러리에서 선택").first().click();
  await p.getByRole("option").filter({ hasText: name }).first().click();
  await p.waitForTimeout(300);
}
async function generate(p, label) {
  await btn(p, label).last().click();
  await p.getByText("생성 완료").first().waitFor({ timeout: 30_000 });
  await p.waitForTimeout(600);
}
/** 생성 결과 패널 (오른쪽 열) */
const resultPanel = (p) => p.getByText("생성 완료").first().locator("xpath=ancestor::div[contains(@class,'space-y-4')][1]");
/** 영상 원고 2단계: 1단계 후보 → 제목 1개 고르기 → 2단계 결과 */
async function ytStage1(p) {
  await pickProduct(p);
  await btn(p, "1단계 · 제목·Hook·CTA 만들기").last().click();
  await p.locator("[data-title-option]").first().waitFor({ timeout: 30_000 });
  await p.waitForTimeout(500);
}
async function ytResult(p) {
  await ytStage1(p);
  await p.locator("[data-title-option] input").first().check();
  await p.locator("[data-run-stage2]").click();
  await p.getByText("생성 완료").first().waitFor({ timeout: 30_000 });
  await p.waitForTimeout(600);
}

export const SHOTS = [
  /* ───── 00 시작하기 ───── */
  {
    id: "00-signup",
    public: true,
    url: "/login",
    clip: (p) => p.locator("form").first().locator("xpath=ancestor::div[contains(@class,'rounded')][1]"),
    clipPad: 48,
    viewport: { width: 1280, height: 980 },
    prepare: async (p) => {
      await p.getByRole("radio", { name: "회원가입" }).click();
      await p.waitForTimeout(500);
    },
    marks: {
      1: (p) => p.getByRole("radio", { name: "회원가입" }),
      2: (p) => p.locator("form").first(),
      3: (p) => p.locator("form button[type=submit]").first(),
    },
  },
  {
    id: "00-login",
    public: true,
    url: "/login",
    clip: (p) => p.locator("form").first().locator("xpath=ancestor::div[contains(@class,'rounded')][1]"),
    clipPad: 48,
    marks: {
      1: (p) => p.locator("form input[type=email]").first(),
      2: (p) => p.locator("form input[type=password]").first(),
      3: (p) => p.locator("form button[type=submit]").first(),
    },
  },
  {
    id: "00-home",
    url: "/",
    viewport: { width: 1280, height: 900 },
    marks: {
      1: (p) => p.locator("aside nav").first(),
      2: (p) => p.locator("main a", { hasText: "바로가기" }).first(),
      3: (p) => card(p, "API 연결"),
    },
  },
  {
    id: "00-account",
    url: "/account",
    marks: {
      1: (p) => p.locator("aside a[href='/account']").first(),
      2: (p) => headCard(p, "이름 변경"),
    },
  },

  /* ───── 01 API 연결 ───── */
  {
    id: "01-ai-keys",
    url: "/settings/api",
    marks: {
      1: (p) => sideLink(p, "API 연결 센터"),
      2: (p) => p.getByPlaceholder("sk-ant-…").first(),
      3: (p) => btn(p, "연결하기").first(),
    },
  },
  {
    id: "01-data-keys",
    url: "/settings/api",
    scrollTo: (p) => p.getByText("YouTube Data API", { exact: true }).first(),
    marks: {
      1: (p) => p.getByPlaceholder("AIza…"),
      2: (p) => p.getByPlaceholder("애플리케이션 Client ID").first(),
      3: (p) => btn(p, "테스트").nth(2),
    },
  },

  /* ───── 02 콘텐츠 프로필 ───── */
  {
    id: "02-profile",
    url: "/ai-learning",
    marks: {
      1: (p) => sideLink(p, "AI 학습 관리"),
      2: (p) => tab(p, "콘텐츠 프로필"),
      3: (p) => btn(p, "프로필 추가"),
    },
  },
  {
    id: "02-profile-edit",
    url: "/ai-learning",
    viewport: { width: 1280, height: 960 },
    prepare: async (p) => {
      await btn(p, "수정").first().click();
      await p.waitForTimeout(600);
    },
    scrollTo: (p) => p.locator("h2, h3", { hasText: "프로필 수정" }).first(),
    marks: {
      1: (p) => field(p, "콘텐츠 분야"),
      2: (p) => field(p, "기본 관심 키워드"),
      3: (p) => field(p, "기본 분석기간"),
    },
  },

  /* ───── 03 제품 ───── */
  {
    id: "03-learn",
    url: "/tools/product-learning",
    prepare: async (p) => {
      await p.locator("#product-url").fill("https://www.coupang.com/vp/products/9024167492");
      await p.waitForTimeout(200);
    },
    marks: {
      1: (p) => sideLink(p, "제품 상세페이지 학습"),
      2: (p) => p.locator("#product-url"),
      3: (p) => btn(p, "상세페이지 학습").first(),
    },
  },
  {
    id: "03-learn-result",
    url: "/tools/product-learning",
    viewport: { width: 1280, height: 900 },
    scrollTo: (p) => btn(p, "제품 라이브러리에 저장").first(),
    marks: {
      1: (p) => headCard(p, "기본 정보"),
      2: (p) => p.locator("h2", { hasText: "AI 제품 요약" }).first(),
      3: (p) => btn(p, "제품 라이브러리에 저장").first(),
    },
    prepare: async (p) => {
      await tab(p, "텍스트 직접 입력").click();
      await p.waitForTimeout(300);
      await p.locator("main textarea").first().fill(
        "클린웨이브 무선청소기 S9 프로\n1.3kg 초경량 바디, 180AW 강력 흡입력, 최대 60분 사용, LED 먼지 감지 헤드, 원터치 먼지통 비우기.\n가격 239,000원. 구성: 본체, 배터리 1개, 충전 거치대, 틈새 브러시.",
      );
      await btn(p, "분석하기").first().click();
      await p.waitForTimeout(2500);
    },
  },
  {
    id: "03-library",
    url: "/tools/product-library",
    marks: {
      1: (p) => p.getByPlaceholder("제품명, 브랜드, 태그"),
      2: (p) => p.locator("main a", { hasText: "클린웨이브 무선청소기 S9 프로" }).first(),
      3: (p) => btn(p, "콘텐츠 만들기").first(),
    },
  },
  {
    id: "03-product-detail",
    url: "/tools/product-library/prd_seed1",
    marks: {
      1: (p) => btn(p, "수정").first().locator("xpath=ancestor::*[contains(@class,'rounded-card')][1]"),
      2: (p) => btn(p, "콘텐츠 만들기").first(),
      3: (p) => btn(p, "영상 추가").first(),
    },
  },
  {
    id: "03-video-import",
    url: "/tools/video-import",
    viewport: { width: 1280, height: 1150 },
    marks: {
      1: (p) => sideLink(p, "영상 URL 가져오기"),
      2: (p) => p.locator("main textarea").first(),
      3: (p) => btn(p, "가져오기").first(),
      4: (p) => p.getByText("제품을 선택하세요").first(),
    },
  },

  {
    id: "03-social-search",
    url: "/tools/video-import",
    viewport: { width: 1280, height: 1300 },
    prepare: async (p) => {
      await p.getByRole("radio", { name: "영상 검색" }).click();
      await p.locator("#social-keyword").fill("무선청소기");
      await btn(p, "샤오홍슈 검색").first().click();
      await p.locator("[data-platform] li input[type=checkbox]").first().waitFor({ timeout: 15_000 });
      const boxes = p.locator("main ul li input[type=checkbox]");
      await boxes.nth(0).check();
      await boxes.nth(1).check();
      await p.waitForTimeout(300);
    },
    scrollTo: (p) => p.locator("h2, h3", { hasText: "영상 가져오기" }).first(),
    marks: {
      1: (p) => p.getByRole("radio", { name: "영상 검색" }).locator("xpath=.."),
      2: (p) => p.getByRole("radio", { name: "도우인" }).locator("xpath=.."),
      3: (p) => btn(p, "샤오홍슈 검색").first(),
      4: (p) => p.locator("[data-play]").first(),
      5: (p) => btn(p, /선택한 \d+개 가져오기/).first(),
    },
  },

  /* ───── 04 트렌드 ───── */
  {
    id: "04-yt-search",
    url: "/youtube/trends",
    viewport: { width: 1280, height: 1300 },
    marks: {
      1: (p) => cardWith(p, "현재 분석 기준"),
      2: (p) => cardWith(p, "구독자 수"),
      3: (p) => p.locator("[data-rising]").first(),
    },
  },
  {
    id: "04-yt-result",
    url: "/youtube/trends",
    prepare: async (p) => {
      await p.locator("main select").nth(1).selectOption("");
      await p.locator("[data-rising]").first().click();
      await p.locator("main table tbody tr").first().waitFor({ timeout: 15_000 });
      await btn(p, "AI 주제 추천").first().click();
      await p.waitForTimeout(2000);
    },
    scrollTo: (p) => p.locator("h2, h3", { hasText: "추천 키워드" }).first(),
    marks: {
      1: (p) => card(p, "추천 키워드"),
      2: (p) => headCard(p, "추천 주제"),
      3: (p) => p.locator("h2, h3", { hasText: "트렌드 영상" }).first(),
    },
  },
  {
    id: "04-yt-outlier",
    url: "/youtube/trends",
    prepare: async (p) => {
      await p.locator("main select").nth(1).selectOption("");
      await p.locator("[data-rising]").first().click();
      await p.locator("main table tbody tr").first().waitFor({ timeout: 15_000 });
      await p.locator("[data-outlier-button]").first().click();
      await p.getByText(/채널 \d+개 비교/).first().waitFor({ timeout: 15_000 });
      await p.waitForTimeout(300);
    },
    scrollTo: (p) => p.locator("h2, h3", { hasText: "트렌드 영상" }).first(),
    marks: {
      1: (p) => p.locator("main th", { hasText: "아웃라이어" }).first(),
      2: (p) => p.getByText(/^×\d/).first().locator("xpath=.."),
      3: (p) => p.getByText(/채널 \d+개 비교/).first(),
    },
  },
  {
    id: "04-clip-trends",
    url: "/naver-clip/trends",
    marks: {
      1: (p) => btn(p, "조회").first(),
      2: (p) => p.locator("h2", { hasText: "급상승 주제" }).first().locator("xpath=.."),
      3: (p) => p.locator("[data-make-menu] button", { hasText: "클립 만들기" }).first(),
    },
  },
  {
    id: "04-blog-trends",
    url: "/naver-blog/trends",
    viewport: { width: 1280, height: 1100 },
    marks: {
      1: (p) => btn(p, "조회").first(),
      2: (p) => card(p, "관련 검색어"),
      3: (p) => p.locator("h2", { hasText: "급상승 주제" }).first().locator("xpath=.."),
    },
  },

  {
    id: "04-ig-trends",
    url: "/instagram/trends",
    viewport: { width: 1280, height: 1300 },
    prepare: async (p) => {
      await p.getByLabel("검색어").fill("무선청소기");
      await p.locator("[data-ig-search]").click();
      await p.locator("[data-ig-list] li").first().waitFor({ timeout: 15_000 });
      await p.waitForTimeout(400);
    },
    marks: {
      1: (p) => p.locator("[data-ig-search]").first(),
      2: (p) => p.getByText("많이 쓰인 해시태그").first().locator("xpath=ancestor::section[1]"),
      3: (p) => p.locator("[data-ig-list] li").first(),
      4: (p) => p.locator("[data-ig-list] [data-make-menu]").first(),
    },
  },
  {
    id: "04-save-titles",
    url: "/youtube/trends",
    viewport: { width: 1280, height: 1000 },
    prepare: async (p) => {
      await p.locator("main select").nth(1).selectOption("");
      await p.locator("[data-rising]").first().click();
      await p.locator("main table tbody tr").first().waitFor({ timeout: 15_000 });
      await p.locator("main table tbody tr").first().waitFor({ timeout: 15_000 });
      const boxes = p.locator("main table tbody [role=checkbox]");
      await boxes.nth(0).click();
      await boxes.nth(1).click();
      await btn(p, /제목 \d+개 대본 포맷에 담기/).first().click();
      await p.getByRole("dialog").waitFor();
      await p.waitForTimeout(600);
    },
    marks: {
      1: (p) => btn(p, /제목 \d+개 대본 포맷에 담기/).first(),
      2: (p) => p.getByRole("dialog").locator("ul").first(),
      3: (p) => p.getByRole("dialog").getByRole("radiogroup").first(),
      4: (p) => p.getByRole("dialog").locator("button", { hasText: /이 포맷에 담기|새 포맷 만들고 담기/ }).first(),
    },
  },

  /* ───── 05 영상 ───── */
  {
    id: "05-yt-form",
    viewport: { width: 1280, height: 1160 },
    url: "/youtube/product-video",
    prepare: (p) => pickProduct(p),
    marks: {
      1: (p) => field(p, "제품 선택"),
      2: (p) => field(p, "영상 길이"),
      3: (p) => btn(p, "1단계 · 제목·Hook·CTA 만들기").last(),
      4: (p) => p.locator("[data-two-stage-hint]").first(),
    },
  },
  {
    id: "05-stage1",
    clip: (p) => p.locator("[data-two-stage]").first(),
    clipPad: 10,
    viewport: { width: 1280, height: 1600 },
    url: "/youtube/product-video",
    prepare: async (p) => {
      await ytStage1(p);
      await p.locator("[data-title-option] input").nth(0).check();
      await p.locator("[data-title-option] input").nth(1).check();
    },
    scrollTo: (p) => p.locator("[data-two-stage]").first(),
    marks: {
      1: (p) => p.locator("[data-keyword-intel]").first(),
      2: (p) => p.locator("[data-title-option]").first(),
      3: (p) => p.getByText(/^Hook 후보/).first(),
      4: (p) => p.locator("[data-run-stage2]").first(),
    },
  },
  {
    id: "05-yt-result",
    clipPad: 10,
    url: "/youtube/product-video",
    viewport: { width: 1280, height: 1300 },
    prepare: ytResult,
    clip: (p) => p.locator("[data-stage2-groups]").first(),
    scrollTo: (p) => p.locator("[data-stage2-groups]").first(),
    marks: {
      1: (p) => p.locator("[data-stage2-groups] [role=tablist]").first().locator("xpath=following-sibling::div[1]"),
      2: (p) => cardWith(p, "이번 생성에 사용된 학습 데이터"),
      3: (p) => p.getByText("미업로드", { exact: true }).first(),
    },
  },
  {
    id: "07-history",
    url: "/youtube/product-video",
    scrollTo: (p) => p.locator("h2", { hasText: "최근 생성 이력" }).first(),
    marks: { 1: (p) => headCard(p, "최근 생성 이력") },
  },
  {
    id: "05-yt-info",
    viewport: { width: 1280, height: 1180 },
    url: "/youtube/info-video",
    marks: {
      1: (p) => field(p, "카테고리"),
      2: (p) => field(p, "주제"),
      3: (p) => btn(p, "1단계 · 제목·Hook·CTA 만들기").last(),
    },
  },
  {
    id: "05-video-production",
    url: "/youtube/video-production",
    viewport: { width: 1440, height: 1500 },
    prepare: async (p) => {
      // 데모 데이터: 샤오홍슈 영상 3개 담기 → 2단계 대본 만들기 → 화면 다시 열기 → [컷 계획 만들기]
      const abs = (path) => new URL(path, p.url()).toString();
      const api = (path, body) => p.request.post(abs(path), { data: body }).then((r) => r.json());
      const pid = (await (await p.request.get(abs("/api/products"))).json()).data[0].id;
      const xhs = (await api("/api/videos/social-search", { keyword: "청소기", platform: "xiaohongshu", sort: "general", period: "all" })).data;
      await api("/api/videos/batch", { items: xhs.items.slice(0, 3).map((it) => ({ url: it.originalUrl, titleHint: it.title, meta: { channelName: it.authorName, durationSec: it.durationSec } })), productId: pid });
      const s1 = (await api("/api/contents/stage1", { featureId: "yt-product-video", input: { productId: pid, length: "15s" }, clientRequestId: "manual" })).data;
      await api("/api/contents/stage2", { stage1Id: s1.id, title: s1.output.titles[0], hook: s1.output.hooks[0], cta: s1.output.ctas[0] });
      await p.reload({ waitUntil: "networkidle" });
      await p.locator("[data-make-plan]").click();
      await p.locator("[data-plan-scene]").first().waitFor({ timeout: 20_000 });
      await p.waitForTimeout(500);
    },
    marks: {
      1: (p) => p.locator("[data-script-picker]").first(),
      2: (p) => p.locator("[data-source-videos]").first(),
      3: (p) => p.locator("[data-plan-scene]").first(),
      4: (p) => p.locator("[data-render]").first(),
    },
  },
  {
    id: "05-clip-form",
    viewport: { width: 1280, height: 1130 },
    url: "/naver-clip/product-content",
    prepare: (p) => pickProduct(p),
    marks: {
      1: (p) => field(p, "제품 선택"),
      2: (p) => field(p, "영상 길이"),
      3: (p) => btn(p, "1단계 · 제목·Hook·CTA 만들기").last(),
    },
  },

  /* ───── 06 블로그 ───── */
  {
    id: "06-blog-form",
    url: "/naver-blog/product-writing",
    viewport: { width: 1280, height: 1000 },
    prepare: async (p) => {
      await pickProduct(p);
      await p.getByPlaceholder("예: 무선청소기 추천").fill("무선청소기 추천");
    },
    marks: {
      1: (p) => field(p, "메인 키워드"),
      2: (p) => field(p, "제품 사진"),
      3: (p) => field(p, "실제 경험"),
    },
  },
  {
    id: "06-blog-result",
    clip: resultPanel,
    clipPad: 10,
    url: "/naver-blog/product-writing",
    viewport: { width: 1280, height: 1000 },
    prepare: async (p) => {
      await pickProduct(p);
      await p.getByPlaceholder("예: 무선청소기 추천").fill("무선청소기 추천");
      await generate(p, "블로그 글 생성하기");
    },
    scrollTo: (p) => p.locator("h3", { hasText: "제목 후보" }).first(),
    marks: {
      1: (p) => p.locator("h3", { hasText: "제목 후보" }).first().locator("xpath=ancestor::section[1]"),
      2: (p) => p.locator("h3", { hasText: "전체 본문" }).first(),
      3: (p) => btn(p, "다시 만들기").first(),
    },
  },
  {
    id: "06-blog-info",
    url: "/naver-blog/info-writing",
    marks: {
      1: (p) => field(p, "글 유형"),
      2: (p) => field(p, "주제"),
      3: (p) => btn(p, "블로그 글 생성하기").last(),
    },
  },
  {
    id: "06-blog-auto",
    url: "/naver-blog/auto-writing",
    marks: {
      1: (p) => p.getByPlaceholder("한 줄이면 충분합니다. 예: 자취생 겨울 필수템").locator("xpath=ancestor::div[contains(@class,'flex-col')][1]"),
      2: (p) => btn(p, "자동으로 글 완성하기").last(),
    },
  },

  /* ───── 07 결과 ───── */
  {
    id: "07-result-top",
    clip: resultPanel,
    clipPad: 10,
    url: "/youtube/product-video",
    prepare: ytResult,
    scrollTo: (p) => p.getByText("생성 완료").first(),
    marks: {
      1: (p) => p.locator("[data-schedule-upload]").first(),
      2: (p) => btn(p, "전체 복사").first(),
      3: (p) => btn(p, "좋은 결과로 저장").first(),
    },
  },
  {
    id: "07-result-section",
    clip: resultPanel,
    clipPad: 10,
    url: "/youtube/product-video",
    prepare: ytResult,
    scrollTo: (p) => p.locator("[data-stage2-groups] h3", { hasText: "대본" }).first(),
    marks: {
      1: (p) => p.locator("[data-stage2-groups]").getByRole("button", { name: "직접 수정" }).first(),
      2: (p) => p.locator("[data-stage2-groups]").getByRole("button", { name: "추가 만들기" }).first(),
      3: (p) => p.locator("[data-stage2-groups] input[type=checkbox]").first(),
    },
  },
  {
    id: "07-result-feedback",
    clip: resultPanel,
    clipPad: 10,
    url: "/youtube/product-video",
    prepare: ytResult,
    scrollTo: (p) => p.locator("h3, p", { hasText: "이 결과가 어땠나요?" }).first(),
    marks: {
      1: (p) => btn(p, "좋아요").first(),
      2: (p) => btn(p, "별로예요").first(),
    },
  },

  /* ───── 08 스타일 ───── */
  {
    id: "08-style-list",
    url: "/ai-learning",
    prepare: async (p) => {
      await tab(p, "나의 스타일").click();
      await p.waitForTimeout(600);
    },
    scrollTo: (p) => p.locator("main [role=tablist]").first(),
    marks: {
      1: (p) => tab(p, "나의 스타일"),
      2: (p) => btn(p, "스타일 추가").first(),
      3: (p) => p.locator("main").getByText("기본", { exact: true }).first(),
    },
  },
  {
    id: "08-style-form",
    url: "/ai-learning",
    prepare: async (p) => {
      await tab(p, "나의 스타일").click();
      await p.waitForTimeout(500);
      await btn(p, "스타일 추가").first().click();
      await p.waitForTimeout(500);
    },
    scrollTo: (p) => p.locator("h2, h3", { hasText: "새 스타일" }).first(),
    marks: {
      1: (p) => field(p, "스타일 이름"),
      2: (p) => field(p, "톤"),
      3: (p) => btn(p, "참고 자료로 AI 초안 만들기").first(),
    },
  },
  {
    id: "08-style-import",
    url: "/ai-learning",
    prepare: async (p) => {
      await tab(p, "나의 스타일").click();
      await p.waitForTimeout(500);
      await btn(p, "스타일 추가").first().click();
      await p.waitForTimeout(500);
      await btn(p, "파일로 일괄 추가").first().click();
      await p.waitForTimeout(500);
      await p.locator("[role=dialog] input[type=file]").first().setInputFiles(SAMPLE_CSV);
      await p.waitForTimeout(1500);
    },
    marks: {
      1: (p) => btn(p, "파일 고르기").first(),
      2: (p) => p.locator("[role=dialog]").getByText("항목을 찾았습니다").first().locator("xpath=ancestor::div[contains(@class,'rounded')][1]"),
      3: (p) => p.locator("[role=dialog] button", { hasText: /개 추가$/ }).first(),
    },
  },

  {
    id: "08-formats",
    url: "/ai-learning?tab=formats",
    prepare: async (p) => {
      await p.getByText("후회형 제품 쇼츠").first().waitFor({ timeout: 10_000 });
    },
    scrollTo: (p) => p.locator("main [role=tablist]").first(),
    marks: {
      1: (p) => tab(p, "대본 포맷"),
      2: (p) => btn(p, "포맷 추가").first(),
      3: (p) => p.locator("main article", { hasText: "후회형 제품 쇼츠" }).first(),
    },
  },
  {
    id: "08-format-persuasion",
    url: "/ai-learning?tab=formats",
    viewport: { width: 1280, height: 1300 },
    prepare: async (p) => {
      await p.locator("main button[aria-label='수정']").first().click();
      await p.locator("[data-format-persuasion]").first().waitFor();
      await p.waitForTimeout(300);
    },
    scrollTo: (p) => p.locator("[data-format-persuasion]").first(),
    marks: {
      1: (p) => p.locator("[data-format-persuasion] > p").first(),
      2: (p) => p.locator("[data-format-persuasion]").getByText("원하는 유형").first().locator("xpath=.."),
      3: (p) => p.locator("[data-bad-examples]").first(),
    },
  },
  {
    id: "08-format-form",
    url: "/ai-learning?tab=formats",
    viewport: { width: 1280, height: 1400 },
    prepare: async (p) => {
      await btn(p, "포맷 추가").first().click();
      await p.waitForTimeout(400);
      await p.locator("main input[type=file][accept*='.txt']").first().setInputFiles(SAMPLE_SCRIPTS);
      await p.getByText("개를 추가했습니다").first().waitFor({ timeout: 10_000 });
      await btn(p, "AI 로 포맷 만들기").first().click();
      await p.locator("main textarea[data-guideline]").first().waitFor();
      await p.waitForFunction(() => (document.querySelector("main textarea[data-guideline]")?.value ?? "").includes("[구조]"), null, { timeout: 15_000 });
    },
    scrollTo: (p) => p.locator("h2, h3", { hasText: "새 대본 포맷" }).first(),
    marks: {
      1: (p) => btn(p, "메모장 파일 불러오기").first(),
      2: (p) => p.getByPlaceholder("영상 제목 (선택)").first().locator("xpath=ancestor::div[contains(@class,'rounded-control')][1]"),
      3: (p) => btn(p, "AI 로 포맷").first(),
      4: (p) => p.locator("main textarea[data-guideline]").first(),
    },
  },

  /* ───── 09 업로드 ───── */
  {
    id: "09-calendar",
    url: "/uploads",
    marks: {
      1: (p) => p.locator("main").getByText(/^\d{4}년 \d{1,2}월$/).first(),
      2: (p) => cardWith(p, "담당자"),
      3: (p) => btn(p, "업로드 등록").first(),
    },
  },
  {
    id: "09-register",
    url: "/uploads",
    prepare: async (p) => {
      await btn(p, "업로드 등록").first().click();
      await p.waitForTimeout(700);
    },
    marks: {
      1: (p) => p.locator("[role=dialog] button", { hasText: "기존 콘텐츠 선택" }).first().locator("xpath=.."),
      2: (p) => p.locator("[role=dialog] div.flex.flex-col").filter({ has: p.locator("label", { hasText: "상태" }) }).last(),
      3: (p) => p.locator("[role=dialog] button", { hasText: "저장" }).last(),
    },
  },
  {
    id: "09-day",
    url: "/uploads",
    prepare: async (p) => {
      await p.locator("main [title^=\"YouTube · \"]", { hasText: "클린웨이브" }).first().click();
      await p.getByText("지금 조회").first().waitFor({ timeout: 10_000 });
    },
    marks: {
      1: (p) => p.getByText(/총 \d+개/).first().locator("xpath=.."),
      2: (p) => p.locator("[role=dialog] a", { hasText: "영상 보기" }).first(),
      3: (p) => p.locator("[role=dialog]").getByText("지금 조회").first(),
    },
  },

  /* ───── 10 AI 학습 관리 ───── */
  {
    id: "10-overview",
    url: "/ai-learning",
    marks: {
      1: (p) => cardWith(p, "AI 생성 흐름"),
      2: (p) => cardWith(p, "제품 메모리").locator("xpath=..").first(),
      3: (p) => p.locator("main [role=tablist]").first(),
    },
  },
  {
    id: "10-learning",
    url: "/ai-learning",
    prepare: async (p) => {
      await tab(p, "학습 프로필").click();
      await p.waitForTimeout(800);
    },
    scrollTo: (p) => p.locator("main [role=tablist]").first(),
    marks: {
      1: (p) => p.locator("h3", { hasText: "YouTube 제품 영상" }).first().locator("xpath=ancestor::*[contains(@class,'rounded-card')][1]"),
      2: (p) => btn(p, "지금 학습 업데이트").first(),
      3: (p) => btn(p, "학습 내용 보기").first(),
    },
  },
  {
    id: "10-prompt-stats",
    url: "/ai-learning",
    prepare: async (p) => {
      await tab(p, "성과 데이터").click();
      await p.getByText("프롬프트 버전별 성과").first().waitFor();
      await p.waitForTimeout(600);
    },
    scrollTo: (p) => p.locator("h2, h3", { hasText: "프롬프트 버전별 성과" }).first(),
    marks: {
      1: (p) => p.locator("main table").first().locator("tbody tr").first().locator("td").first(),
      2: (p) => p.locator("main th", { hasText: "👍 비율" }).first(),
      3: (p) => p.locator("main th", { hasText: "생성" }).first(),
    },
  },
  {
    id: "10-history",
    url: "/ai-learning",
    prepare: async (p) => {
      await tab(p, "콘텐츠 히스토리").click();
      await p.waitForTimeout(800);
    },
    scrollTo: (p) => p.locator("main [role=tablist]").first(),
    marks: {
      1: (p) => tab(p, "콘텐츠 히스토리"),
      2: (p) => p.locator("main table tbody tr").first().locator("button").first(),
      3: (p) => tab(p, "성과 데이터"),
    },
  },

  /* ───── A 관리자 ───── */
  {
    id: "A-approvals",
    url: "/admin/approvals",
    marks: {
      1: (p) => tab(p, "승인 대기"),
      2: (p) => btn(p, "승인").first(),
    },
  },
  { id: "A-users", url: "/admin/users", marks: { 1: (p) => p.locator("main select").first() } },
  { id: "A-permissions", url: "/admin/permissions", marks: { 1: (p) => btn(p, "기본값으로 되돌리기") } },
  {
    id: "A-errors",
    url: "/admin/errors",
    prepare: async (p) => {
      await p.evaluate(async () => {
        for (const m of ["생성 결과를 불러오지 못했습니다 (TypeError: Cannot read properties of undefined)", "업로드 저장 중 네트워크 오류"]) {
          await fetch("/api/errors", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: m, path: "/youtube/product-video" }) });
        }
      });
      await p.reload({ waitUntil: "networkidle" });
      await p.waitForTimeout(600);
    },
    marks: {
      1: (p) => sideLink(p, "활동 기록"),
      2: (p) => p.locator("main table, main [role=table], main ul").last(),
    },
  },
];
