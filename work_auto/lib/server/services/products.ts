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

/**
 * 제품 학습 + 제품 라이브러리 유스케이스.
 *
 *  analyze():  입력 → Collector(수집) → RawProductData → Analyzer(AI 분석) → Draft   (저장하지 않음)
 *  save():     Draft → Product + ProductSource + ProductAnalysis 저장
 *  콘텐츠 생성: ContextBuilder 가 저장된 ProductAnalysis 를 읽는다 (재분석 없음)
 */
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
      imageUrl: null,
      sourceUrl: a.basicInfo.url || null,
      oneLiner: a.summary.oneLiner,
      keyBenefits: a.summary.keyBenefits.slice(0, 3),
      tags: a.contentData.keywords.slice(0, 3),
      currentAnalysisId: analysisId,
      createdAt: now,
      updatedAt: now,
      lastUsedAt: null,
    };
    await repo.products.insert(product);
    await repo.productSources.insert({ id: createId("psrc"), productId, type: draft.raw.sourceType, raw: draft.raw, createdAt: now });
    await repo.productAnalyses.insert({ id: analysisId, productId, version: 1, ...a, meta: draft.meta, createdAt: now });
    return product;
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
