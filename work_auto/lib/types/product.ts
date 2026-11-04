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
  /** v0.9.168 저장할 때 고른 분류 (없으면 가전) */
  productGroup?: ProductGroup;
}

export interface ProductAnalysis extends ProductAnalysisContent {
  id: ID;
  productId: ID;
  /** v0.9.109: 데이터 주인 (제품과 같은 주인 — 관리자 공용 데이터면 공용 주인). 없으면 DB 기본값(저장한 사람) */
  userId?: ID;
  /** 같은 제품을 재분석하면 version 이 올라간다 */
  version: number;
  meta: AnalysisMeta;
  createdAt: ISODate;
}

export interface ProductSource {
  id: ID;
  productId: ID;
  /** v0.9.109: 데이터 주인 (제품과 같은 주인) */
  userId?: ID;
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
  /** v0.9.135 제품 분류 (DB products.product_group, 기본 appliance). 패션은 AI 패션에서만, 가전은 원고·영상 자동 제작에서 */
  productGroup?: ProductGroup;
}

export type ProductGroup = "appliance" | "fashion" | "stay" | "living";
export const PRODUCT_GROUPS: { value: ProductGroup; label: string }[] = [
  { value: "appliance", label: "가전" },
  { value: "fashion", label: "패션" },
  // v0.9.159 숙소: AI 숙소 영상에서만 (원고·영상 자동 제작 제품 고르기에는 안 나옴)
  { value: "stay", label: "숙소" },
  // v0.9.162 생활·잡화 (필름·파우치·지갑 등): 원고·영상 자동 제작 대상, 영상 스타일은 분류별 (가전과 따로)
  { value: "living", label: "생활·잡화" },
];
/** 분류 값이 없으면 가전 */
export const groupOf = (p: Pick<Product, "productGroup">): ProductGroup => (p.productGroup === "fashion" || p.productGroup === "stay" || p.productGroup === "living" ? p.productGroup : "appliance");
/** v0.9.168 분석한 카테고리 글자로 분류 미리 고르기 (저장 전에 바꿀 수 있다) */
export function guessGroup(category: string): ProductGroup {
  const c = category.replace(/\s+/g, "");
  if (/숙박|숙소|호텔|펜션|리조트|글램핑|캠핑장|여행|풀빌라|료칸/.test(c)) return "stay";
  if (/패션|의류|옷|여성복|남성복|신발|가방|잡화류|액세서리|주얼리|속옷|언더웨어|모자|스카프|원피스|티셔츠|바지|아우터/.test(c)) return "fashion";
  if (/가전|전자|디지털|컴퓨터|노트북|청소기|에어컨|냉장고|세탁기|드라이기|마사지기|건강가전|주방가전|생활가전|카메라|이어폰|헤드폰/.test(c)) return "appliance";
  if (/생활|리빙|주방|욕실|수납|정리|문구|인테리어|뷰티|화장품|화장|스킨케어|반려|지갑|파우치|필름/.test(c)) return "living";
  return "appliance";
}
export const cleanGroup = (v: unknown): ProductGroup => (v === "fashion" || v === "stay" || v === "living" ? v : "appliance");

export interface ProductDetail {
  product: Product;
  analysis: ProductAnalysis;
  source: ProductSource | null;
}

/** 제품 수정 시 변경 가능한 필드 */
export type ProductUpdateInput = Partial<
  Pick<Product, "name" | "brand" | "category" | "seller" | "oneLiner" | "keyBenefits" | "tags" | "productGroup">
> & {
  contentData?: Partial<ProductAnalysisContent["contentData"]>;
};
