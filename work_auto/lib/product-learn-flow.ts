"use client";

import { api } from "@/lib/api-client";
import { PRODUCT_COLLECT_POLL } from "@/lib/product-url";
import type { ProductAnalysisDraft, RawProductData } from "@/lib/types";

/**
 * 상품 URL 학습 흐름 (화면 공용: 제품 상세페이지 학습 · 제품 상세 [상세페이지 다시 학습]). docs/PRODUCT_DATA_COLLECTION.md
 *  ① learnUrl 1번 (Trigger 최대 1회) → ② 같은 작업 상태만 3초 간격·최대 20번 → ③ 수집 데이터로 AI 분석
 * 버튼 handler 에서만 부른다 (useEffect 금지). 자동 재시도 없음.
 * AI 분석만 실패하면 CollectedError 에 수집 데이터가 들어 있어 [AI 분석 다시 시도]는 Bright Data 를 부르지 않는다.
 */
export type LearnStage = "checking" | "collecting" | "analyzing";

export class CollectedError extends Error {
  constructor(message: string, readonly raw: RawProductData) {
    super(message);
  }
}

export const newLearnRequestId = () => `product_learn_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function learnProductUrl(
  url: string,
  opts: { force?: boolean; productId?: string; onStage: (s: LearnStage) => void },
): Promise<{ existing: { productId: string; name: string } } | { draft: ProductAnalysisDraft }> {
  const clientRequestId = newLearnRequestId();
  opts.onStage("checking");
  const r = await api.products.learnUrl({ url, clientRequestId, force: opts.force, productId: opts.productId });
  if (r.status === "existing") return { existing: { productId: r.productId, name: r.name } };
  let raw: RawProductData | null = r.status === "collected" ? r.raw : null;
  if (r.status === "collecting") {
    opts.onStage("collecting");
    for (let i = 0; i < PRODUCT_COLLECT_POLL.maxAttempts && !raw; i++) {
      await sleep(PRODUCT_COLLECT_POLL.intervalMs);
      const s = await api.products.learnStatus({ jobId: r.jobId, url, clientRequestId });
      if (s.status === "collected") raw = s.raw;
    }
    if (!raw) throw new Error("상품정보 수집이 아직 완료되지 않았습니다. 잠시 뒤 같은 버튼을 다시 누르면 진행 중인 작업을 이어서 확인합니다 (새로 수집하지 않습니다).");
  }
  return { draft: await analyzeRaw(raw!, opts.onStage) };
}

/** 수집 데이터 → AI 분석만 (Bright Data 0회) */
export async function analyzeRaw(raw: RawProductData, onStage: (s: LearnStage) => void): Promise<ProductAnalysisDraft> {
  onStage("analyzing");
  try {
    return await api.products.analyzeCollected(raw);
  } catch (e) {
    throw new CollectedError(e instanceof Error ? e.message : "제품 분석에 실패했습니다.", raw);
  }
}
