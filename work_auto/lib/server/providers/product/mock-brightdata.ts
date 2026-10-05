import "server-only";
import { PRODUCT_CATALOG } from "@/lib/mock/product-catalog";
import type { CommercePlatform } from "@/lib/product-url";
import type { ConnectionTestResult } from "@/lib/types";
import { seededNumber } from "@/lib/utils";
import type { CollectJob, JobProgress, ProductPageCollector } from "./brightdata";

/**
 * 데모 모드용 가짜 Bright Data (외부 호출 없음). 실제처럼 Trigger → 작업 id → 1.5초 뒤 ready.
 * 결과는 데모 제품 카탈로그에서 URL 로 정해진 하나 (Bright Data 응답 비슷한 이름으로).
 * mockBrightDataCalls 로 호출 수를 센다 (테스트·데모 확인용).
 */
export const mockBrightDataCalls = { trigger: 0, progress: 0, result: 0 };

export class MockBrightDataCollector implements ProductPageCollector {
  readonly id = "mock-brightdata";

  async trigger(platform: CommercePlatform, url: string): Promise<CollectJob> {
    mockBrightDataCalls.trigger++;
    const idx = seededNumber(url, 0, PRODUCT_CATALOG.length - 1);
    return { status: "pending", snapshotId: `s_mock_${Date.now()}_${platform}_${idx}` };
  }

  async progress(snapshotId: string): Promise<JobProgress> {
    mockBrightDataCalls.progress++;
    const at = Number(snapshotId.split("_")[2]);
    if (snapshotId.includes("fail")) return "failed";
    return Date.now() - at >= 1500 ? "ready" : "running";
  }

  async result(snapshotId: string): Promise<unknown> {
    mockBrightDataCalls.result++;
    const idx = Number(snapshotId.split("_").at(-1)) || 0;
    const e = PRODUCT_CATALOG[idx % PRODUCT_CATALOG.length];
    return {
      title: e.raw.title,
      brand: e.raw.brand,
      final_price: e.raw.price,
      category: e.raw.category,
      description: e.raw.descriptionText,
      specifications: e.raw.specs,
      seller_name: snapshotId.includes("naver") ? "데모 스마트스토어" : "쿠팡",
      images: [],
      rating: 4.6,
      reviews_count: 1280,
      top_reviews: e.raw.reviewSnippets,
    };
  }

  async testConnection(): Promise<ConnectionTestResult> {
    return { ok: true, message: "데모 모드: 실제 Bright Data 호출 없이 형식만 확인했습니다.", testedAt: new Date().toISOString(), mock: true };
  }
}
