import "server-only";
import { PRODUCT_CATALOG } from "@/lib/mock/product-catalog";
import type { ProductSourceInput, RawProductData } from "@/lib/types";
import { seededNumber } from "@/lib/utils";
import { AppError } from "../../http";
import { serverConfig } from "../../config";
import type { ProductDataCollector } from "../types";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Product Data Collector 구현체 모음.
 * 규칙: Collector 는 "원문 수집"만 한다. 요약, 장점 추출, 키워드 추천은 하지 않는다 (그건 Analyzer 의 일).
 *
 * 실제 구현 시 추가할 것
 *  - CoupangCollector       : 쿠팡 파트너스 API 또는 서버 측 수집 (이용약관 확인 필수)
 *  - SmartStoreCollector    : 스마트스토어 상품 페이지 수집
 *  - VisionImageCollector   : 상세 이미지 → AIProvider(Vision) 로 텍스트 추출 (OCR)
 */

/** URL → Mock 카탈로그 중 하나 (URL 해시로 결정) */
export class MockUrlCollector implements ProductDataCollector {
  readonly id = "mock-url-collector";
  readonly label = "URL 수집 (Mock)";

  supports(source: ProductSourceInput) {
    return source.type === "url";
  }

  async collect(source: ProductSourceInput): Promise<RawProductData> {
    if (source.type !== "url") throw new AppError("BAD_SOURCE", "URL 입력이 아닙니다.");
    if (!/^https?:\/\/.+\..+/.test(source.url)) throw new AppError("BAD_URL", "올바른 상품 URL 을 입력해 주세요.");
    await sleep(serverConfig.mockLatencyMs);

    const exact = PRODUCT_CATALOG.find((c) => c.raw.url === source.url);
    const entry = exact ?? PRODUCT_CATALOG[seededNumber(source.url, 0, PRODUCT_CATALOG.length - 1)];
    const seller = /coupang/.test(source.url) ? "쿠팡" : /smartstore|naver/.test(source.url) ? "스마트스토어" : entry.raw.seller;
    return {
      ...structuredClone(entry.raw),
      url: source.url,
      seller,
      sourceType: "url",
      collectedBy: this.id,
      collectedAt: new Date().toISOString(),
    };
  }
}

/** 상세 이미지 → Mock (실제로는 Vision OCR) */
export class MockImageCollector implements ProductDataCollector {
  readonly id = "mock-image-collector";
  readonly label = "이미지 수집 (Mock OCR)";

  supports(source: ProductSourceInput) {
    return source.type === "image";
  }

  async collect(source: ProductSourceInput): Promise<RawProductData> {
    if (source.type !== "image" || source.fileNames.length === 0) {
      throw new AppError("BAD_SOURCE", "분석할 이미지를 1개 이상 올려주세요.");
    }
    await sleep(serverConfig.mockLatencyMs * 1.5);
    const entry = PRODUCT_CATALOG[seededNumber(source.fileNames.join(","), 0, PRODUCT_CATALOG.length - 1)];
    return {
      ...structuredClone(entry.raw),
      url: undefined,
      seller: "이미지 업로드",
      sourceType: "image",
      imageUrls: source.fileNames,
      collectedBy: this.id,
      collectedAt: new Date().toISOString(),
    };
  }
}

/**
 * 텍스트 직접 입력 → RawProductData (실제 동작하는 구현).
 * "키: 값" 형태의 줄은 스펙으로, 나머지는 설명으로 나눈다.
 */
export class TextCollector implements ProductDataCollector {
  readonly id = "text-collector";
  readonly label = "텍스트 입력";

  supports(source: ProductSourceInput) {
    return source.type === "text";
  }

  async collect(source: ProductSourceInput): Promise<RawProductData> {
    if (source.type !== "text" || source.text.trim().length < 10) {
      throw new AppError("BAD_SOURCE", "상세페이지 텍스트를 10자 이상 입력해 주세요.");
    }
    const lines = source.text.split("\n").map((l) => l.trim()).filter(Boolean);
    const specs: Record<string, string> = {};
    const desc: string[] = [];
    for (const line of lines) {
      const m = line.match(/^([^:：]{1,15})[:：]\s*(.+)$/);
      if (m) specs[m[1].trim()] = m[2].trim();
      else desc.push(line);
    }
    return {
      sourceType: "text",
      title: source.productName?.trim() || desc[0]?.slice(0, 40) || "직접 입력한 제품",
      brand: specs["브랜드"],
      category: specs["카테고리"],
      seller: "직접 입력",
      imageUrls: [],
      descriptionText: desc.join("\n"),
      specs,
      reviewSnippets: [],
      collectedBy: this.id,
      collectedAt: new Date().toISOString(),
    };
  }
}
