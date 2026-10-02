import type { ID, ISODate } from "./common";

export type ProductSourceType = "url" | "image" | "text";

/** 제품 상세페이지 학습 화면의 입력 */
export type ProductSourceInput =
  | { type: "url"; url: string }
  | { type: "image"; fileNames: string[] }
  | { type: "text"; text: string; productName?: string };

/**
 * Product Data Collector 의 출력 = AI Analyzer 의 입력.
 * "수집한 그대로의 원문"이며 해석이나 요약을 넣지 않는다.
 */
export interface RawProductData {
  sourceType: ProductSourceType;
  url?: string;
  seller?: string;
  title: string;
  brand?: string;
  price?: number;
  category?: string;
  imageUrls: string[];
  descriptionText: string;
  specs: Record<string, string>;
  reviewSnippets: string[];
  collectedBy: string;
  collectedAt: ISODate;
}

/** AI Analyzer 의 출력. 콘텐츠 생성 시 Product Memory 로 재사용된다. */
export interface ProductAnalysisContent {
  basicInfo: {
    name: string;
    brand: string;
    category: string;
    seller: string;
    url: string;
  };
  summary: {
    oneLiner: string;
    keyFeatures: string[];
    keyBenefits: string[];
    differentiators: string[];
    targetAudience: string[];
    buyingPoints: string[];
    cautions: string[];
  };
  contentData: {
    videoPoints: string[];
    blogPoints: string[];
    keywords: string[];
    hooks: string[];
    forbiddenExpressions: string[];
  };
}

export interface AnalysisMeta {
  provider: string;
  model: string;
  promptId: string;
  promptVersion: string;
}

/** 저장 전 분석 결과 (상세페이지 학습 화면에서 사용자 확인용) */
export interface ProductAnalysisDraft {
  raw: RawProductData;
  analysis: ProductAnalysisContent;
  meta: AnalysisMeta;
}

export interface ProductAnalysis extends ProductAnalysisContent {
  id: ID;
  productId: ID;
  /** 같은 제품을 재분석하면 version 이 올라간다 */
  version: number;
  meta: AnalysisMeta;
  createdAt: ISODate;
}

export interface ProductSource {
  id: ID;
  productId: ID;
  type: ProductSourceType;
  raw: RawProductData;
  createdAt: ISODate;
}

/** 제품 라이브러리의 한 항목 (목록 조회용 요약 필드 포함) */
export interface Product {
  id: ID;
  userId: ID;
  name: string;
  brand: string;
  category: string;
  seller: string;
  /** 대표 이미지 URL. Mock 에서는 null 이고 카테고리 색 플레이스홀더를 쓴다 */
  imageUrl: string | null;
  sourceUrl: string | null;
  oneLiner: string;
  keyBenefits: string[];
  tags: string[];
  /** 현재 사용 중인 분석 결과 */
  currentAnalysisId: ID;
  createdAt: ISODate;
  updatedAt: ISODate;
  /** 콘텐츠 생성에 마지막으로 사용된 시각 */
  lastUsedAt: ISODate | null;
}

export interface ProductDetail {
  product: Product;
  analysis: ProductAnalysis;
  source: ProductSource | null;
}

/** 제품 수정 시 변경 가능한 필드 */
export type ProductUpdateInput = Partial<
  Pick<Product, "name" | "brand" | "category" | "seller" | "oneLiner" | "keyBenefits" | "tags">
> & {
  contentData?: Partial<ProductAnalysisContent["contentData"]>;
};
