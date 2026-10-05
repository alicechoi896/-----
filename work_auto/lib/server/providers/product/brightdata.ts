import "server-only";
import type { CommercePlatform } from "@/lib/product-url";
import type { ConnectionTestResult, RawProductData } from "@/lib/types";
import { AppError } from "../../http";

/**
 * Bright Data Web Scraper API (상품 상세페이지 수집). docs/PRODUCT_DATA_COLLECTION.md
 * 공식 문서 기준 (2026-10 확인):
 *  - Trigger  POST {base}/datasets/v3/trigger?dataset_id=…&format=json&uncompressed_webhook=true  body [{ url }] → { snapshot_id }
 *  - Progress GET  {base}/datasets/v3/progress/{snapshot_id} → { status: starting|running|ready|failed }
 *  - Result   GET  {base}/datasets/v3/snapshot/{snapshot_id}?format=json → [record]
 *  - 인증: Authorization: Bearer {토큰} (API 연결 센터 · 서버에서만)
 * 실제 계정의 Dataset ID 가 다르면 이 설정만 바꾼다.
 */
export const brightDataConfig = {
  baseUrl: "https://api.brightdata.com",
  datasets: {
    coupang: "gd_mcsxmfqptpufr191p",
    naver_smartstore: "gd_m9qqjxxr1hab7okefj",
  } satisfies Record<CommercePlatform, string>,
  timeoutMs: 30_000,
  /** AI 에 보낼 상세 설명 최대 글자 · 이미지 수 (DB·토큰 절약) */
  maxDescriptionChars: 8000,
  maxImageUrls: 10,
} as const;

export type CollectJob = { status: "ready"; record: unknown } | { status: "pending"; snapshotId: string };
export type JobProgress = "starting" | "running" | "ready" | "failed";

/** 수집 Provider 공통 interface (업체를 바꿔도 화면·제품 라이브러리는 그대로) */
export interface ProductPageCollector {
  readonly id: string;
  /** 새 수집 1회 (유료). 결과가 바로 오면 ready, 아니면 snapshotId */
  trigger(platform: CommercePlatform, url: string): Promise<CollectJob>;
  /** 같은 작업의 상태만 확인 (새 수집 아님) */
  progress(snapshotId: string): Promise<JobProgress>;
  /** 끝난 작업의 결과 1건 */
  result(snapshotId: string): Promise<unknown>;
  testConnection(): Promise<ConnectionTestResult>;
}

/** 로그: 키·헤더·응답 본문 없이 호출 종류만 */
export function logBrightData(info: { requestId?: string; operation: "trigger" | "status" | "result"; platform?: string; canonicalKey?: string; user?: string }) {
  console.info("[BrightData]", JSON.stringify({ ...info, at: new Date().toISOString() }));
}

export class BrightDataCollector implements ProductPageCollector {
  readonly id = "brightdata";
  constructor(private readonly token: string) {}

  private async call(method: "GET" | "POST", path: string, body?: unknown): Promise<{ status: number; data: unknown }> {
    let res: Response;
    try {
      res = await fetch(`${brightDataConfig.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: body == null ? undefined : JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(brightDataConfig.timeoutMs),
      });
    } catch {
      throw new AppError("BRIGHTDATA_NETWORK", "Bright Data 에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.", 502);
    }
    const data = await res.json().catch(() => null);
    if (res.status === 401 || res.status === 403) throw new AppError("BRIGHTDATA_AUTH", "Bright Data API 토큰이 올바르지 않거나 권한이 없습니다. API 연결 센터에서 토큰을 확인해 주세요.", 400);
    if (res.status === 402) throw new AppError("BRIGHTDATA_PAYMENT", "Bright Data 잔액·요금제를 확인해 주세요.", 402);
    if (res.status === 429) throw new AppError("BRIGHTDATA_RATE_LIMIT", "Bright Data 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", 429);
    if (res.status >= 400) throw new AppError("BRIGHTDATA_UPSTREAM", `Bright Data 요청에 실패했습니다. [HTTP ${res.status}]`, 502);
    return { status: res.status, data };
  }

  async trigger(platform: CommercePlatform, url: string): Promise<CollectJob> {
    const q = new URLSearchParams({ dataset_id: brightDataConfig.datasets[platform], format: "json", uncompressed_webhook: "true" });
    const { data } = await this.call("POST", `/datasets/v3/trigger?${q}`, [{ url }]);
    // 결과가 바로 오는 경우(배열)와 작업 id 가 오는 경우 모두
    if (Array.isArray(data) && data.length) return { status: "ready", record: data[0] };
    const id = (data as { snapshot_id?: unknown } | null)?.snapshot_id;
    if (typeof id === "string" && id) return { status: "pending", snapshotId: id };
    throw new AppError("BRIGHTDATA_BAD_RESPONSE", "Bright Data 응답을 해석하지 못했습니다.", 502);
  }

  async progress(snapshotId: string): Promise<JobProgress> {
    const { data } = await this.call("GET", `/datasets/v3/progress/${encodeURIComponent(snapshotId)}`);
    const s = String((data as { status?: unknown } | null)?.status ?? "");
    return s === "ready" || s === "failed" || s === "starting" ? s : "running";
  }

  async result(snapshotId: string): Promise<unknown> {
    const { status, data } = await this.call("GET", `/datasets/v3/snapshot/${encodeURIComponent(snapshotId)}?format=json`);
    if (status === 202) return null; // 아직 준비 중
    const rec = Array.isArray(data) ? data[0] : data;
    return rec ?? null;
  }

  /** 무료 확인: 데이터셋 목록 (쿠팡·스마트스토어 Dataset 이 보이는지) */
  async testConnection(): Promise<ConnectionTestResult> {
    const testedAt = new Date().toISOString();
    try {
      const { data } = await this.call("GET", "/datasets/list");
      const ids = new Set((Array.isArray(data) ? data : []).map((d) => String((d as { id?: unknown })?.id ?? "")));
      const has = (id: string) => (ids.size ? (ids.has(id) ? "있음" : "목록에 없음") : "확인 못 함");
      return { ok: true, message: `연결 성공 · 쿠팡 Dataset ${has(brightDataConfig.datasets.coupang)} · 스마트스토어 Dataset ${has(brightDataConfig.datasets.naver_smartstore)}`, testedAt, mock: false };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : "Bright Data 에 연결할 수 없습니다.", testedAt, mock: false };
    }
  }
}

/* ── 응답 → 내부 모델 (실제 응답 구조는 키로 확인 전이라 여러 이름을 너그럽게 읽는다. 없는 값은 비움) ── */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const pick = (o: Obj, ...keys: string[]): unknown => {
  for (const k of keys) {
    const v = k.split(".").reduce<unknown>((cur, part) => (isObj(cur) ? cur[part] : Array.isArray(cur) ? cur[Number(part)] : undefined), o);
    if (v != null && v !== "" && !(Array.isArray(v) && !v.length)) return v;
  }
  return undefined;
};
const text = (v: unknown, max = 300) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : typeof v === "number" ? String(v) : "");
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[^\d.]/g, "")) : NaN;
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
const urlsOf = (v: unknown): string[] =>
  (Array.isArray(v) ? v : typeof v === "string" ? [v] : [])
    .map((x) => (typeof x === "string" ? x : isObj(x) ? text(pick(x, "url", "src", "image_url"), 1000) : ""))
    .filter((x) => /^https?:\/\//.test(x))
    .map((x) => x.replace(/^http:\/\//, "https://"));

/** 스펙: {키: 값} 또는 [{name, value}] */
function specsOf(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (Array.isArray(v)) {
    for (const it of v) if (isObj(it)) {
      const k = text(pick(it, "name", "key", "label", "title"), 40);
      const val = text(pick(it, "value", "content", "text"), 200);
      if (k && val) out[k] = val;
    }
  } else if (isObj(v)) {
    for (const [k, val] of Object.entries(v)) if (text(val)) out[k.slice(0, 40)] = text(val, 200);
  }
  return Object.fromEntries(Object.entries(out).slice(0, 40));
}

export function normalizeBrightDataRecord(
  record: unknown,
  meta: { platform: CommercePlatform; url: string; canonicalKey: string; productId: string },
): RawProductData {
  if (!isObj(record)) throw new AppError("BRIGHTDATA_EMPTY", "상세페이지를 자동으로 읽지 못했습니다.", 502);
  if (pick(record, "error", "error_code") && !pick(record, "title", "product_name", "name")) {
    throw new AppError("BRIGHTDATA_EMPTY", "상세페이지를 자동으로 읽지 못했습니다. (삭제·품절·접근 제한 상품일 수 있습니다)", 502);
  }
  const title = text(pick(record, "title", "product_name", "name"), 200);
  if (!title) throw new AppError("BRIGHTDATA_EMPTY", "상세페이지에서 상품명을 찾지 못했습니다.", 502);
  const category = pick(record, "category", "categories", "breadcrumbs", "category_path");
  const description = [pick(record, "description", "product_description", "details", "detail"), pick(record, "features", "highlights")]
    .map((d) => (Array.isArray(d) ? d.map((x) => text(x, 500)).join("\n") : typeof d === "string" ? d.trim() : ""))
    .filter(Boolean)
    .join("\n")
    .slice(0, brightDataConfig.maxDescriptionChars);
  const options = pick(record, "options", "variations", "variants");
  const optionText = Array.isArray(options) ? options.map((o) => (isObj(o) ? text(pick(o, "name", "title", "value"), 80) : text(o, 80))).filter(Boolean).slice(0, 20) : [];
  const reviews = pick(record, "top_reviews", "reviews_list", "review_snippets");
  const price = num(pick(record, "final_price", "price", "sale_price", "discount_price"));
  const originalPrice = num(pick(record, "initial_price", "original_price", "list_price"));
  const specs = specsOf(pick(record, "specifications", "specs", "product_details", "attributes"));
  if (optionText.length) specs["옵션"] = optionText.join(", ").slice(0, 300);
  if (originalPrice && price && originalPrice > price) specs["정가"] = `${originalPrice.toLocaleString("ko-KR")}원`;
  const rating = num(pick(record, "rating", "review_score", "average_rating"));
  const reviewCount = num(pick(record, "reviews_count", "review_count", "reviews", "ratings_count"));
  if (rating) specs["평점"] = String(rating);
  if (reviewCount) specs["리뷰 수"] = String(Math.round(reviewCount));
  return {
    sourceType: "url",
    url: meta.url,
    canonicalKey: meta.canonicalKey,
    platform: meta.platform,
    externalProductId: text(pick(record, "product_id", "id", "item_id"), 40) || meta.productId,
    seller: text(pick(record, "seller_name", "seller", "store_name", "brand_store", "vendor"), 80) || undefined,
    title,
    brand: text(pick(record, "brand", "brand_name", "manufacturer"), 80) || undefined,
    price,
    category: Array.isArray(category) ? category.map((c) => text(isObj(c) ? pick(c, "name", "title") : c, 40)).filter(Boolean).join(" > ").slice(0, 200) : text(category, 200) || undefined,
    imageUrls: [...new Set(urlsOf(pick(record, "images", "image_urls", "image", "main_image", "product_images", "detail_images")))].slice(0, brightDataConfig.maxImageUrls),
    descriptionText: description,
    specs,
    reviewSnippets: (Array.isArray(reviews) ? reviews : []).map((r) => text(isObj(r) ? pick(r, "review", "text", "content") : r, 200)).filter(Boolean).slice(0, 5),
    collectedBy: "brightdata",
    collectedAt: new Date().toISOString(),
  };
}
