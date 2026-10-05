import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseSupportedProductUrl } from "@/lib/product-url";

/**
 * 상품 URL 학습 (Bright Data) — 호출 횟수 규칙 (v0.9.36). docs/PRODUCT_DATA_COLLECTION.md
 * 수집기는 데모용 가짜(MockBrightDataCollector)를 써서 trigger·status 횟수를 센다.
 */
const products: { id: string; userId: string; name: string; sourceUrl: string | null }[] = [];
const ai = { supportsVision: false, generateStructured: vi.fn() };
vi.mock("@/lib/server/repositories", () => ({
  getCurrentUserId: async () => "u1",
  getRepositories: () => ({ products: { list: async (f: (p: unknown) => boolean) => products.filter(f) } }),
}));
const { MockBrightDataCollector, mockBrightDataCalls } = await import("@/lib/server/providers/product/mock-brightdata");
const collector = new MockBrightDataCollector();
vi.mock("@/lib/server/providers/registry", () => ({ getProductPageCollector: async () => collector, getAIProvider: async () => ai }));
const { productUrlLearning } = await import("@/lib/server/services/product-url-learning");
const { normalizeBrightDataRecord } = await import("@/lib/server/providers/product/brightdata");

beforeEach(() => {
  products.length = 0;
  mockBrightDataCalls.trigger = mockBrightDataCalls.progress = mockBrightDataCalls.result = 0;
  vi.clearAllMocks();
});

describe("URL 검사 (외부 호출 0회)", () => {
  it("쿠팡·스마트스토어 상품 상세페이지만", () => {
    const c = parseSupportedProductUrl("https://www.coupang.com/vp/products/9024167492");
    expect(c).toMatchObject({ supported: true, platform: "coupang", productId: "9024167492", canonicalKey: "coupang:9024167492", collectionUrl: "https://www.coupang.com/vp/products/9024167492" });
    const n = parseSupportedProductUrl("https://smartstore.naver.com/dailylife_lab/products/6069974829");
    expect(n).toMatchObject({ supported: true, platform: "naver_smartstore", storeName: "dailylife_lab", canonicalKey: "naver-smartstore:dailylife_lab:6069974829" });
    expect(parseSupportedProductUrl("https://coupang.com/vp/products/9024167492").supported).toBe(true);
  });
  it("추적 파라미터는 같은 상품, itemId·vendorItemId 는 수집 주소에만 남김", () => {
    const a = parseSupportedProductUrl("https://www.coupang.com/vp/products/9024167492?itemId=111&vendorItemId=222&utm_source=x&sourceType=srp");
    const b = parseSupportedProductUrl("https://www.coupang.com/vp/products/9024167492?trackingId=zz");
    expect(a.supported && b.supported && a.canonicalKey === b.canonicalKey).toBe(true);
    expect(a.supported && a.collectionUrl).toBe("https://www.coupang.com/vp/products/9024167492?itemId=111&vendorItemId=222");
  });
  it("네이버 브랜드스토어 (v0.9.41)", () => {
    const r = parseSupportedProductUrl("https://brand.naver.com/samsung/products/11223344?NaPm=x");
    expect(r.supported && r.platform).toBe("naver_smartstore");
    expect(r.supported && r.canonicalKey).toBe("naver-brand:samsung:11223344");
    expect(r.supported && r.collectionUrl).toBe("https://brand.naver.com/samsung/products/11223344");
  });
  it("거부: 다른 쇼핑몰·네이버 다른 주소·상품 아닌 쿠팡 주소·위장 주소·http·javascript", () => {
    for (const u of [
      "https://www.11st.co.kr/products/1",
      "https://brand.naver.com/x",
      "https://shopping.naver.com/x",
      "https://m.smartstore.naver.com/a/products/123456",
      "https://smartstore.naver.com/dailylife_lab",
      "https://www.coupang.com/",
      "https://www.coupang.com/np/categories/1",
      "https://www.coupang.com/vp/products/",
      "https://evil.com/?url=coupang.com/vp/products/123456",
      "https://coupang.com.evil.com/vp/products/123456",
      "http://www.coupang.com/vp/products/123456",
      "javascript:alert(1)",
      "https://user@www.coupang.com/vp/products/123456",
    ])
      expect(parseSupportedProductUrl(u).supported).toBe(false);
  });
});

describe("Bright Data 호출 횟수", () => {
  const URL = "https://www.coupang.com/vp/products/9024167492";
  it("CASE 1·10 새 상품: Trigger 1회 → pending 동안 상태만 확인 → 정리된 데이터", async () => {
    const r = await productUrlLearning.start({ url: URL, clientRequestId: "product_learn_t1" });
    expect(r.status).toBe("collecting");
    expect(mockBrightDataCalls.trigger).toBe(1);
    const jobId = r.status === "collecting" ? r.jobId : "";
    const s1 = await productUrlLearning.status({ jobId, url: URL });
    expect(s1.status).toBe("collecting"); // 아직 running
    await new Promise((res) => setTimeout(res, 1600));
    const s2 = await productUrlLearning.status({ jobId, url: URL });
    expect(s2.status).toBe("collected");
    expect(mockBrightDataCalls.trigger).toBe(1); // 상태 확인은 Trigger 가 아니다
    expect(mockBrightDataCalls.progress).toBe(2);
    if (s2.status === "collected") expect(s2.raw).toMatchObject({ sourceType: "url", canonicalKey: "coupang:9024167492", platform: "coupang", url: URL });
  });
  it("CASE 2·8 빠르게 세 번 눌러도 Trigger 1회", async () => {
    const rs = await Promise.all([1, 2, 3].map(() => productUrlLearning.start({ url: "https://smartstore.naver.com/dailylife_lab/products/6069974829" })));
    expect(mockBrightDataCalls.trigger).toBe(1);
    expect(new Set(rs.map((r) => (r.status === "collecting" ? r.jobId : "")))).toHaveProperty("size", 1);
    // 진행 중에 다시 눌러도 같은 작업을 이어서 (새 Trigger 없음)
    const again = await productUrlLearning.start({ url: "https://smartstore.naver.com/dailylife_lab/products/6069974829?NaPm=ct%3Dabc" });
    expect(again).toMatchObject({ status: "collecting", reused: true });
    expect(mockBrightDataCalls.trigger).toBe(1);
  });
  it("CASE 3·4 이미 학습한 상품 (추적 URL 이 달라도): Trigger 0회", async () => {
    products.push({ id: "prd1", userId: "u1", name: "기존 제품", sourceUrl: "https://www.coupang.com/vp/products/555555" });
    const r = await productUrlLearning.start({ url: "https://www.coupang.com/vp/products/555555?itemId=9&utm_campaign=y" });
    expect(r).toEqual({ status: "existing", productId: "prd1", name: "기존 제품" });
    expect(mockBrightDataCalls.trigger).toBe(0);
  });
  it("지원하지 않는 URL: 외부 0회 + 안내", async () => {
    await expect(productUrlLearning.start({ url: "https://www.gmarket.co.kr/item/1" })).rejects.toMatchObject({ code: "UNSUPPORTED_PRODUCT_URL" });
    expect(mockBrightDataCalls.trigger).toBe(0);
  });
  it("CASE 6 AI 분석만 다시: Bright Data 0회", async () => {
    const raw = normalizeBrightDataRecord({ title: "제품 A", description: "설명입니다".repeat(100) }, { platform: "coupang", url: URL, canonicalKey: "coupang:9024167492", productId: "9024167492" });
    ai.generateStructured.mockRejectedValueOnce(new Error("AI 오류"));
    await expect(productUrlLearning.analyze({ raw })).rejects.toThrow("AI 오류");
    ai.generateStructured.mockResolvedValueOnce({ data: { basicInfo: {}, summary: { oneLiner: "한 줄" }, contentData: {} }, provider: "mock", model: "m" });
    const d = await productUrlLearning.analyze({ raw });
    expect(d.analysis.summary.oneLiner).toBe("한 줄");
    expect(mockBrightDataCalls.trigger).toBe(0);
  });
  it("CASE 13 다시 학습은 그 제품에서 직접 누를 때만 Trigger 1회", async () => {
    products.push({ id: "prd2", userId: "u1", name: "B", sourceUrl: "https://www.coupang.com/vp/products/777777" });
    await expect(productUrlLearning.start({ url: "https://www.coupang.com/vp/products/777777", force: true, productId: "other" })).rejects.toMatchObject({ code: "VALIDATION" });
    const r = await productUrlLearning.start({ url: "https://www.coupang.com/vp/products/777777", force: true, productId: "prd2" });
    expect(r.status).toBe("collecting");
    expect(mockBrightDataCalls.trigger).toBe(1);
  });
  it("정리: 원본 응답 그대로가 아니라 필요한 필드만, 길이 제한", () => {
    const raw = normalizeBrightDataRecord(
      { title: "T", brand: "B", final_price: "19,900", initial_price: 25000, images: ["http://img.coupangcdn.com/a.jpg", { url: "https://img.coupangcdn.com/b.jpg" }], description: "x".repeat(20000), specifications: [{ name: "용량", value: "600ml" }], html: "<html>…</html>", debug: { proxy: "x" } },
      { platform: "coupang", url: URL, canonicalKey: "coupang:9024167492", productId: "9024167492" },
    );
    expect(raw.price).toBe(19900);
    expect(raw.specs).toMatchObject({ 용량: "600ml", 정가: "25,000원" });
    expect(raw.imageUrls).toEqual(["https://img.coupangcdn.com/a.jpg", "https://img.coupangcdn.com/b.jpg"]);
    expect(raw.descriptionText.length).toBe(8000);
    expect(JSON.stringify(raw)).not.toMatch(/html|proxy/);
  });
});

describe("상세페이지 학습 범위 (v0.9.38)", () => {
  it("제품 사진(최대 5)과 상세 설명 이미지를 나누고, 스펙·옵션·정가·할인·상세 본문을 모은다", () => {
    const raw = normalizeBrightDataRecord(
      {
        title: "T",
        main_image: "https://thumbnail.coupangcdn.com/main.jpg",
        images: Array.from({ length: 8 }, (_, i) => `https://thumbnail.coupangcdn.com/${i}.jpg`),
        detail_images: Array.from({ length: 20 }, (_, i) => `https://image.coupangcdn.com/detail${i}.jpg`),
        final_price: 9000,
        initial_price: 12000,
        options: [{ name: "색상", value: "블랙" }, "용량 500ml"],
        specifications: { 무게: "1.3kg", 소재: "ABS" },
        detail_content: "상세 본문",
        seller_description: "판매자 안내",
      },
      { platform: "coupang", url: "https://www.coupang.com/vp/products/1234", canonicalKey: "coupang:1234", productId: "1234" },
    );
    expect(raw.imageUrls).toHaveLength(5);
    expect(raw.imageUrls[0]).toBe("https://thumbnail.coupangcdn.com/main.jpg");
    expect(raw.detailImageUrls).toHaveLength(15);
    expect(raw).toMatchObject({ price: 9000, originalPrice: 12000, discountRate: 25, options: ["색상: 블랙", "용량 500ml"] });
    expect(raw.specs).toMatchObject({ 무게: "1.3kg", 소재: "ABS" });
    expect(raw.descriptionText).toContain("상세 본문");
    expect(raw.descriptionText).toContain("판매자 안내");
  });
});

describe("CASE 5·11·12 콘텐츠 생성·제품 열기는 수집기를 부르지 않는다", () => {
  it("수집기를 쓰는 곳은 상품 URL 학습 서비스뿐", () => {
    const root = path.resolve(__dirname, "../..");
    const files: string[] = [];
    const walk = (d: string) => {
      for (const n of readdirSync(d)) {
        const p = path.join(d, n);
        if (/node_modules|\.next|tests/.test(p)) continue;
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(n)) files.push(p);
      }
    };
    for (const d of ["app", "lib", "features", "components"]) walk(path.join(root, d));
    const users = files.filter((f) => /getProductPageCollector\(/.test(readFileSync(f, "utf8"))).map((f) => path.relative(root, f).replace(/\\/g, "/"));
    expect(users.sort()).toEqual(["lib/server/providers/registry.ts", "lib/server/services/product-url-learning.ts"]);
  });
});
