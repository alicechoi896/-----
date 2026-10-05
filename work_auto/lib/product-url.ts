/**
 * 상품 상세페이지 URL 규칙 (화면·서버 공용, v0.9.36). docs/PRODUCT_DATA_COLLECTION.md
 * 자동 학습 지원: 쿠팡 · 네이버 스마트스토어 두 곳만. 판별은 URL 파서로만 한다 (외부 호출 0회, 문자열 includes 금지).
 */
export type CommercePlatform = "coupang" | "naver_smartstore";

export type ParsedProductUrl =
  | {
      supported: true;
      platform: CommercePlatform;
      productId: string;
      storeName: string | null;
      /** 같은 상품 판별용 (추적 파라미터와 무관) */
      canonicalKey: string;
      originalUrl: string;
      /** Bright Data 에 보낼 주소 (쿠팡은 옵션을 정하는 itemId·vendorItemId 만 남긴다) */
      collectionUrl: string;
    }
  | { supported: false; reason: "INVALID_URL" | "NOT_HTTPS" | "UNSUPPORTED_DOMAIN" | "NOT_PRODUCT_PAGE" };

export const PLATFORM_LABEL_KO: Record<CommercePlatform, string> = { coupang: "쿠팡", naver_smartstore: "네이버 스마트스토어" };

const COUPANG_HOSTS = new Set(["coupang.com", "www.coupang.com"]);
const SMARTSTORE_HOST = "smartstore.naver.com";

export function parseSupportedProductUrl(input: string): ParsedProductUrl {
  let u: URL;
  try {
    u = new URL(String(input ?? "").trim());
  } catch {
    return { supported: false, reason: "INVALID_URL" };
  }
  if (u.protocol !== "https:") return { supported: false, reason: u.protocol === "http:" ? "NOT_HTTPS" : "INVALID_URL" };
  if (u.username || u.password || (u.port && u.port !== "443")) return { supported: false, reason: "INVALID_URL" };
  const host = u.hostname.toLowerCase();

  if (COUPANG_HOSTS.has(host)) {
    const m = u.pathname.match(/^\/vp\/products\/(\d{4,20})\/?$/);
    if (!m) return { supported: false, reason: "NOT_PRODUCT_PAGE" };
    const productId = m[1];
    const keep = new URLSearchParams();
    for (const k of ["itemId", "vendorItemId"]) {
      const v = u.searchParams.get(k);
      if (v && /^\d{1,20}$/.test(v)) keep.set(k, v);
    }
    const q = keep.toString();
    return {
      supported: true,
      platform: "coupang",
      productId,
      storeName: null,
      canonicalKey: `coupang:${productId}`,
      originalUrl: u.toString(),
      collectionUrl: `https://www.coupang.com/vp/products/${productId}${q ? `?${q}` : ""}`,
    };
  }

  if (host === SMARTSTORE_HOST) {
    const m = u.pathname.match(/^\/([A-Za-z0-9_.-]{1,60})\/products\/(\d{4,20})\/?$/);
    if (!m) return { supported: false, reason: "NOT_PRODUCT_PAGE" };
    const [, storeName, productId] = m;
    return {
      supported: true,
      platform: "naver_smartstore",
      productId,
      storeName,
      canonicalKey: `naver-smartstore:${storeName.toLowerCase()}:${productId}`,
      originalUrl: u.toString(),
      collectionUrl: `https://smartstore.naver.com/${storeName}/products/${productId}`,
    };
  }
  return { supported: false, reason: "UNSUPPORTED_DOMAIN" };
}

export const PRODUCT_URL_ERROR: Record<Exclude<ParsedProductUrl, { supported: true }>["reason"], string> = {
  INVALID_URL: "올바른 상품 주소가 아닙니다.",
  NOT_HTTPS: "https:// 로 시작하는 주소만 지원합니다.",
  UNSUPPORTED_DOMAIN: "현재 지원하지 않는 상세페이지입니다. 자동 학습은 쿠팡과 네이버 스마트스토어 상품 상세페이지만 지원합니다.",
  NOT_PRODUCT_PAGE: "상품 상세페이지 주소가 아닙니다. 쿠팡은 coupang.com/vp/products/…, 스마트스토어는 smartstore.naver.com/스토어/products/… 형식이어야 합니다.",
};

/** 수집 진행 확인 (화면이 같은 작업의 상태만 묻는다 — 새 수집을 만들지 않는다) */
export const PRODUCT_COLLECT_POLL = { intervalMs: 3000, maxAttempts: 20 } as const;
