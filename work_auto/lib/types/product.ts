import type { ID, ISODate } from "./common";

export type ProductSourceType = "url" | "image" | "text";

/** 제품 상세페이지 학습 화면의 입력 */
export type ProductSourceInput =
  | { type: "url"; url: string }
  /** 이미지는 브라우저에서 잘라 AI 가 읽은 텍스트(extractedText)만 서버에 보낸다. 이미지 파일은 저장하지 않는다 */
  | { type: "image"; fileNames: string[]; extractedText?: string; productName?: string }
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
  /** 상품 URL 수집 (v0.9.36, Bright Data): 같은 상품 판별 키 · 쇼핑몰 · 쇼핑몰 상품 id */
  canonicalKey?: string;
  platform?: "coupang" | "naver_smartstore";
  externalProductId?: string;
  /** 정가·할인율·옵션 (v0.9.38, 수집한 그대로) */
  originalPrice?: number;
  discountRate?: number;
  options?: string[];
  /** 상세페이지 설명 이미지 주소 — 분석할 때만 쓰고 저장하지 않는다 (저장 전 제거) */
  detailImageUrls?: string[];
  /** 상세 이미지에서 AI 가 읽은 내용 (제품 특징·기능·스펙·사용법·강조 메시지) */
  detailImageInsights?: string;
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
    /** 주요 스펙 (v0.9.38, 예전 분석에는 없다) */
    keySpecs?: string[];
    keyBenefits: string[];
    differentiators: string[];
    targetAudience: string[];
    buyingPoints: string[];
    cautions: string[];
    /** 사용 상황 (v0.9.38) */
    useCases?: string[];
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
