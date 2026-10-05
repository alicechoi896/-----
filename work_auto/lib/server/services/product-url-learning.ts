import "server-only";
import { PRODUCT_URL_ERROR, parseSupportedProductUrl, type CommercePlatform } from "@/lib/product-url";
import type { ProductAnalysisDraft, RawProductData } from "@/lib/types";
import { AppError } from "../http";
import { brightDataConfig, logBrightData, normalizeBrightDataRecord } from "../providers/product/brightdata";
import { getAIProvider, getProductPageCollector } from "../providers/registry";
import { getCurrentUserId, getRepositories } from "../repositories";
import { safeFetch } from "../security/safe-url";
import { MAX_IMAGES_PER_EXTRACT, productAnalyzer } from "./product-analyzer";

/**
 * 상품 URL 로 상세페이지 학습 (쿠팡·스마트스토어, Bright Data). docs/PRODUCT_DATA_COLLECTION.md
 *
 *  start()   [상세페이지 학습] 클릭: 로컬 URL 검사 → 이미 학습한 상품이면 끝(외부 0회) → 새 상품만 Trigger 정확히 1회
 *  status()  같은 작업의 상태만 확인 (Trigger 다시 안 함). 준비되면 결과 1번 받아 내부 모델로 정리해 돌려준다
 *  analyze() 정리된 수집 데이터 → AI 분석 (AI 가 실패해 다시 눌러도 Bright Data 는 부르지 않는다)
 * 자동 재시도 없음. 원본 HTML·전체 응답은 저장하지 않는다 (정리된 필드만 product_sources 에 남는다).
 */
export const productLearnConfig = {
  /** 같은 상품의 진행 중 작업을 기억하는 시간 (다시 눌러도 새 Trigger 를 만들지 않는다) */
  jobMemoryMs: 15 * 60 * 1000,
  /** 설명이 이보다 짧고 이미지가 있으면 상세 이미지 일부를 AI 가 읽는다 */
  visionWhenDescShorterThan: 400,
  maxDetailImagesForAnalysis: Math.min(6, MAX_IMAGES_PER_EXTRACT),
  maxImageBytes: 3_500_000,
  /** 상세 이미지를 받아도 되는 쇼핑몰 이미지 서버 */
  imageHosts: [/\.coupangcdn\.com$/i, /\.pstatic\.net$/i, /\.naver\.net$/i],
} as const;

type StartResult =
  | { status: "existing"; productId: string; name: string }
  | { status: "collecting"; jobId: string; platform: CommercePlatform; canonicalKey: string; reused: boolean }
  | { status: "collected"; raw: RawProductData };

/** 진행 중 작업: 사용자 + 상품 키 → 작업 id (Trigger 중인 Promise 포함). DB 없음 */
const jobs = new Map<string, { at: number; jobId?: string; pending?: Promise<StartResult> }>();

/** 이 사용자의 제품 중 같은 상품 (source_url 을 같은 규칙으로 풀어 비교 — 새 컬럼 없음) */
export async function findLearnedProduct(userId: string, canonicalKey: string) {
  const rows = await getRepositories().products.list((p) => p.userId === userId && Boolean(p.sourceUrl));
  return rows.find((p) => {
    const parsed = parseSupportedProductUrl(p.sourceUrl ?? "");
    return parsed.supported && parsed.canonicalKey === canonicalKey;
  }) ?? null;
}

function parseOrThrow(url: unknown) {
  const parsed = parseSupportedProductUrl(String(url ?? ""));
  if (!parsed.supported) throw new AppError("UNSUPPORTED_PRODUCT_URL", PRODUCT_URL_ERROR[parsed.reason], 400);
  return parsed;
}

const reqId = (v: unknown) => (typeof v === "string" && /^[\w-]{1,60}$/.test(v) ? v : "-");

export const productUrlLearning = {
  async start(input: { url?: unknown; force?: unknown; productId?: unknown; clientRequestId?: unknown }): Promise<StartResult> {
    const parsed = parseOrThrow(input.url);
    const userId = await getCurrentUserId();
    const force = input.force === true;
    // 외부 호출보다 기존 제품 확인이 먼저
    const existing = await findLearnedProduct(userId, parsed.canonicalKey);
    if (existing && !force) return { status: "existing", productId: existing.id, name: existing.name };
    if (force) {
      // 다시 학습은 제품 상세의 [상세페이지 다시 학습]에서만 (그 제품과 같은 상품이어야 한다)
      if (!existing || existing.id !== input.productId) throw new AppError("VALIDATION", "다시 학습할 제품을 찾을 수 없습니다.");
    }

    const key = `${userId}:${parsed.canonicalKey}`;
    const job = jobs.get(key);
    if (job && Date.now() - job.at < productLearnConfig.jobMemoryMs) {
      if (job.jobId) return { status: "collecting", jobId: job.jobId, platform: parsed.platform, canonicalKey: parsed.canonicalKey, reused: true };
      if (job.pending) return job.pending; // 동시에 두 번 눌러도 Trigger 1회
    }
    const pending = (async (): Promise<StartResult> => {
      const collector = await getProductPageCollector();
      logBrightData({ requestId: reqId(input.clientRequestId), operation: "trigger", platform: parsed.platform, canonicalKey: parsed.canonicalKey, user: userId.slice(0, 8) });
      const r = await collector.trigger(parsed.platform, parsed.collectionUrl); // 자동 재시도 없음
      if (r.status === "ready") {
        jobs.delete(key);
        return { status: "collected", raw: normalizeBrightDataRecord(r.record, { platform: parsed.platform, url: parsed.collectionUrl, canonicalKey: parsed.canonicalKey, productId: parsed.productId }) };
      }
      jobs.set(key, { at: Date.now(), jobId: r.snapshotId });
      if (jobs.size > 500) jobs.delete(jobs.keys().next().value!);
      return { status: "collecting", jobId: r.snapshotId, platform: parsed.platform, canonicalKey: parsed.canonicalKey, reused: false };
    })();
    jobs.set(key, { at: Date.now(), pending });
    try {
      return await pending;
    } catch (e) {
      jobs.delete(key); // 실패하면 사용자가 다시 누를 때만 새로
      throw e;
    }
  },

  /** 같은 작업의 상태만 확인 (Trigger 아님). 토큰이 사용자 것이라 작업도 그 계정 것만 보인다 */
  async status(input: { jobId?: unknown; url?: unknown; clientRequestId?: unknown }): Promise<{ status: "collecting"; progress: string } | { status: "collected"; raw: RawProductData }> {
    const parsed = parseOrThrow(input.url);
    const jobId = String(input.jobId ?? "");
    if (!/^[\w-]{4,80}$/.test(jobId)) throw new AppError("VALIDATION", "수집 작업을 찾을 수 없습니다.");
    const userId = await getCurrentUserId();
    const collector = await getProductPageCollector();
    logBrightData({ requestId: reqId(input.clientRequestId), operation: "status", platform: parsed.platform, canonicalKey: parsed.canonicalKey, user: userId.slice(0, 8) });
    const progress = await collector.progress(jobId);
    if (progress === "failed") {
      jobs.delete(`${userId}:${parsed.canonicalKey}`);
      throw new AppError("BRIGHTDATA_FAILED", "상세페이지를 자동으로 읽지 못했습니다. 상세페이지를 캡처해 '이미지 업로드'로 올리거나 '텍스트 직접 입력'을 이용해 주세요.", 502);
    }
    if (progress !== "ready") return { status: "collecting", progress };
    logBrightData({ requestId: reqId(input.clientRequestId), operation: "result", platform: parsed.platform, canonicalKey: parsed.canonicalKey, user: userId.slice(0, 8) });
    const record = await collector.result(jobId);
    if (record == null) return { status: "collecting", progress: "running" };
    jobs.delete(`${userId}:${parsed.canonicalKey}`);
    return { status: "collected", raw: normalizeBrightDataRecord(record, { platform: parsed.platform, url: parsed.collectionUrl, canonicalKey: parsed.canonicalKey, productId: parsed.productId }) };
  },

  /** 수집한 데이터 → AI 분석 (Bright Data 0회). 화면이 받은 정리 데이터를 그대로 다시 보낸다 */
  async analyze(input: { raw?: unknown }): Promise<ProductAnalysisDraft> {
    const raw = cleanCollected(input.raw);
    const enriched = await withDetailImageText(raw);
    const { analysis, meta } = await productAnalyzer.analyze(enriched);
    return { raw: enriched, analysis, meta };
  },
};

/** 화면에서 돌아온 수집 데이터 검사·길이 제한 (같은 규칙의 URL·키여야 한다) */
function cleanCollected(v: unknown): RawProductData {
  const r = (v ?? {}) as Partial<RawProductData>;
  const parsed = parseOrThrow(r.url);
  if (r.canonicalKey !== parsed.canonicalKey || typeof r.title !== "string" || !r.title.trim()) throw new AppError("VALIDATION", "수집한 상품 정보가 올바르지 않습니다. 다시 학습해 주세요.");
  const str = (x: unknown, n: number) => (typeof x === "string" ? x.slice(0, n) : undefined);
  const specs: Record<string, string> = {};
  for (const [k, val] of Object.entries(r.specs ?? {}).slice(0, 40)) specs[String(k).slice(0, 40)] = String(val).slice(0, 300);
  return {
    sourceType: "url",
    url: parsed.collectionUrl,
    canonicalKey: parsed.canonicalKey,
    platform: parsed.platform,
    externalProductId: str(r.externalProductId, 40) ?? parsed.productId,
    seller: str(r.seller, 80),
    title: r.title.slice(0, 200),
    brand: str(r.brand, 80),
    price: typeof r.price === "number" && Number.isFinite(r.price) ? r.price : undefined,
    category: str(r.category, 200),
    imageUrls: (Array.isArray(r.imageUrls) ? r.imageUrls : []).filter((u): u is string => typeof u === "string" && /^https:\/\//.test(u)).slice(0, brightDataConfig.maxImageUrls),
    descriptionText: (str(r.descriptionText, brightDataConfig.maxDescriptionChars) ?? "").trim(),
    specs,
    reviewSnippets: (Array.isArray(r.reviewSnippets) ? r.reviewSnippets : []).map((x) => String(x).slice(0, 200)).slice(0, 5),
    collectedBy: "brightdata",
    collectedAt: typeof r.collectedAt === "string" ? r.collectedAt : new Date().toISOString(),
  };
}

/**
 * 설명 글이 거의 없고(상세가 이미지뿐) 실제 AI 가 이미지를 읽을 수 있으면, 상세 이미지 몇 장만 이 자리에서 읽는다.
 * 이미지는 저장하지 않고, 읽은 글만 설명에 더한다. 실패하면 조용히 건너뛴다.
 */
async function withDetailImageText(raw: RawProductData): Promise<RawProductData> {
  if (raw.descriptionText.length >= productLearnConfig.visionWhenDescShorterThan || !raw.imageUrls.length) return raw;
  const ai = await getAIProvider();
  if (!ai.supportsVision) return raw;
  const images: { mediaType: string; data: string }[] = [];
  for (const u of raw.imageUrls.slice(0, productLearnConfig.maxDetailImagesForAnalysis)) {
    try {
      const host = new URL(u).hostname;
      if (!productLearnConfig.imageHosts.some((re) => re.test(host))) continue;
      const res = await safeFetch(u, { signal: AbortSignal.timeout(10_000) });
      const type = res.headers.get("content-type") ?? "";
      const len = Number(res.headers.get("content-length") ?? 0);
      if (!res.ok || !/^image\/(jpeg|png|webp|gif)/.test(type) || len > productLearnConfig.maxImageBytes) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > productLearnConfig.maxImageBytes) continue;
      images.push({ mediaType: type.split(";")[0], data: buf.toString("base64") });
    } catch {
      /* 이 이미지는 건너뛴다 */
    }
  }
  if (!images.length) return raw;
  try {
    const { text } = await productAnalyzer.extractFromImages(images, "상세 이미지");
    return { ...raw, descriptionText: `${raw.descriptionText}\n${text}`.trim().slice(0, brightDataConfig.maxDescriptionChars) };
  } catch {
    return raw;
  }
}
