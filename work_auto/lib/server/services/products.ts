import "server-only";
import type {
  AnalysisMeta,
  Product,
  ProductAnalysis,
  ProductAnalysisContent,
  ProductAnalysisDraft,
  ProductDetail,
  ProductSourceInput,
  ProductUpdateInput,
  RawProductData,
} from "@/lib/types";
import { createId, nowIso } from "@/lib/utils";
import { AppError, notFound } from "../http";
import { getCurrentUserId, getRepositories } from "../repositories";
import { getProductCollector } from "../providers/registry";
import { productAnalyzer } from "./product-analyzer";
import { findLearnedProduct } from "./product-url-learning";

/**
 * 제품 학습 + 제품 라이브러리 유스케이스.
 *
 *  analyze():  입력 → Collector(수집) → RawProductData → Analyzer(AI 분석) → Draft   (저장하지 않음)
 *  save():     Draft → Product + ProductSource + ProductAnalysis 저장
 *  콘텐츠 생성: ContextBuilder 가 저장된 ProductAnalysis 를 읽는다 (재분석 없음)
 */
/** 저장용 수집 데이터: 상세 이미지 주소는 버리고(분석에만 사용) 제품 사진은 5개까지 */
function compactRaw(raw: RawProductData): RawProductData {
  const { detailImageUrls: _detail, ...rest } = raw;
  void _detail;
  return { ...rest, imageUrls: (raw.imageUrls ?? []).slice(0, 5) };
}

export const productService = {
  async analyze(source: ProductSourceInput): Promise<ProductAnalysisDraft> {
    const collector = getProductCollector(source);
    const raw = await collector.collect(source);
    const { analysis, meta } = await productAnalyzer.analyze(raw);
    return { raw, analysis, meta };
  },

  async save(draft: { raw: RawProductData; analysis: ProductAnalysisContent; meta: AnalysisMeta }): Promise<Product> {
    if (!draft?.raw || !draft?.analysis) throw new AppError("BAD_INPUT", "저장할 분석 결과가 없습니다.");
    const repo = getRepositories();
    const userId = await getCurrentUserId();
    // 상품 URL 로 학습한 경우: 같은 상품이 이미 있으면 새로 만들지 않는다 (다시 학습은 relearn)
    if (draft.raw.canonicalKey) {
      const dup = await findLearnedProduct(userId, draft.raw.canonicalKey);
      if (dup) throw new AppError("DUPLICATE_PRODUCT", `이미 학습된 제품입니다: ${dup.name}`, 409);
    }
    const now = nowIso();
    const productId = createId("prd");
    const analysisId = createId("pan");
    const a = draft.analysis;

    const product: Product = {
      id: productId,
      userId,
      name: a.basicInfo.name,
      brand: a.basicInfo.brand,
      category: a.basicInfo.category,
      seller: a.basicInfo.seller,
      // 대표 이미지는 쇼핑몰 원래 주소만 (파일은 저장하지 않는다)
      imageUrl: draft.raw.imageUrls?.[0] ?? null,
      // 상품 URL 학습은 같은 상품 판별에 쓰는 수집 주소를 그대로 (AI 가 바꾼 주소를 쓰지 않는다)
      sourceUrl: (draft.raw.canonicalKey ? draft.raw.url : a.basicInfo.url) || null,
      oneLiner: a.summary.oneLiner,
      keyBenefits: a.summary.keyBenefits.slice(0, 3),
      tags: a.contentData.keywords.slice(0, 3),
      currentAnalysisId: analysisId,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: null,
    };
    await repo.products.insert(product);
    await repo.productSources.insert({ id: createId("psrc"), productId, type: draft.raw.sourceType, raw: compactRaw(draft.raw), createdAt: now });
    await repo.productAnalyses.insert({ id: analysisId, productId, version: 1, ...a, meta: draft.meta, createdAt: now });
    return product;
  },

  /**
   * [상세페이지 다시 학습]: 같은 제품에 새 분석 버전 (제품 id·연결된 콘텐츠·영상은 그대로).
   * 수집 원본은 최신 1개만 남긴다 (DB 가 계속 커지지 않게)
   */
  async relearn(productId: string, draft: { raw: RawProductData; analysis: ProductAnalysisContent; meta: AnalysisMeta }): Promise<ProductDetail> {
    if (!draft?.raw?.canonicalKey || !draft?.analysis) throw new AppError("BAD_INPUT", "저장할 분석 결과가 없습니다.");
    const repo = getRepositories();
    const { product } = await this.getDetail(productId);
    const userId = await getCurrentUserId();
    const same = await findLearnedProduct(userId, draft.raw.canonicalKey);
    if (!same || same.id !== product.id) throw new AppError("VALIDATION", "다른 상품의 상세페이지입니다.");
    const now = nowIso();
    const a = draft.analysis;
    const versions = await repo.productAnalyses.list((x) => x.productId === productId);
    const analysisId = createId("pan");
    await repo.productAnalyses.insert({ id: analysisId, productId, version: Math.max(0, ...versions.map((v) => v.version)) + 1, ...a, meta: draft.meta, createdAt: now });
    for (const s of await repo.productSources.list((x) => x.productId === productId)) await repo.productSources.remove(s.id);
    await repo.productSources.insert({ id: createId("psrc"), productId, type: draft.raw.sourceType, raw: compactRaw(draft.raw), createdAt: now });
    await repo.products.update(productId, {
      name: a.basicInfo.name,
      brand: a.basicInfo.brand,
      category: a.basicInfo.category,
      seller: a.basicInfo.seller,
      imageUrl: draft.raw.imageUrls?.[0] ?? product.imageUrl,
      oneLiner: a.summary.oneLiner,
      keyBenefits: a.summary.keyBenefits.slice(0, 3),
      tags: a.contentData.keywords.slice(0, 3),
      currentAnalysisId: analysisId,
      updatedAt: now,
    });
    return this.getDetail(productId);
  },

  async list(): Promise<Product[]> {
    const userId = await getCurrentUserId();
    const products = await getRepositories().products.list((p) => p.userId === userId);
    return products.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async getDetail(id: string): Promise<ProductDetail> {
    const repo = getRepositories();
    const userId = await getCurrentUserId();
    const product = await repo.products.get(id);
    if (!product || product.userId !== userId) notFound("제품");
    const analysis = await repo.productAnalyses.get(product.currentAnalysisId);
    if (!analysis) notFound("제품 분석");
    const [source] = await repo.productSources.list((s) => s.productId === id);
    return { product, analysis, source: source ?? null };
  },

  /** 수정: 목록용 필드와 콘텐츠 제작용 데이터를 갱신한다 (분석 버전은 유지, 재분석 시에만 올림) */
  async update(id: string, input: ProductUpdateInput): Promise<ProductDetail> {
    const repo = getRepositories();
    const { product, analysis } = await this.getDetail(id);
    const { contentData, ...productPatch } = input;
    await repo.products.update(product.id, { ...productPatch, updatedAt: nowIso() });
    if (contentData) {
      const patch: Partial<ProductAnalysis> = { contentData: { ...analysis.contentData, ...contentData } };
      await repo.productAnalyses.update(analysis.id, patch);
    }
    if (productPatch.name || productPatch.oneLiner) {
      await repo.productAnalyses.update(analysis.id, {
        basicInfo: { ...analysis.basicInfo, name: productPatch.name ?? analysis.basicInfo.name },
        summary: { ...analysis.summary, oneLiner: productPatch.oneLiner ?? analysis.summary.oneLiner },
      });
    }
    return this.getDetail(id);
  },

  async remove(id: string): Promise<void> {
    const repo = getRepositories();
    await this.getDetail(id); // 권한 확인
    for (const a of await repo.productAnalyses.list((x) => x.productId === id)) await repo.productAnalyses.remove(a.id);
    for (const s of await repo.productSources.list((x) => x.productId === id)) await repo.productSources.remove(s.id);
    await repo.products.remove(id);
  },

  async touch(id: string): Promise<void> {
    await getRepositories().products.update(id, { lastUsedAt: nowIso() });
  },
};
