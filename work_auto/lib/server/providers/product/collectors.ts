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

/* ───────────────────────── 실제 수집기 ───────────────────────── */

/** "항목: 값" 줄은 스펙으로, 나머지는 설명으로 나눈다 (텍스트·이미지 공용) */
function splitSpecs(text: string): { specs: Record<string, string>; desc: string[] } {
  const specs: Record<string, string> = {};
  const desc: string[] = [];
  for (const line of text.split("\n").map((l) => l.trim()).filter(Boolean)) {
    const m = line.match(/^([^:：]{1,15})[:：]\s*(.+)$/);
    if (m) specs[m[1].trim()] = m[2].trim();
    else desc.push(line);
  }
  return { specs, desc };
}

/**
 * 상세 이미지 → AI 가 읽은 텍스트 (실제 동작).
 * 브라우저가 긴 상세 이미지를 조각내 /api/products/extract-images 로 보내 텍스트를 받고,
 * 그 텍스트만 여기로 넘어온다. 이미지 파일은 어디에도 저장하지 않는다.
 */
export class ImageTextCollector implements ProductDataCollector {
  readonly id = "image-vision-collector";
  readonly label = "이미지 읽기 (AI Vision)";

  supports(source: ProductSourceInput) {
    return source.type === "image" && Boolean(source.extractedText?.trim());
  }

  async collect(source: ProductSourceInput): Promise<RawProductData> {
    if (source.type !== "image" || !source.extractedText?.trim()) throw new AppError("BAD_SOURCE", "이미지에서 읽은 내용이 없습니다.");
    const { specs, desc } = splitSpecs(source.extractedText);
    return {
      sourceType: "image",
      title: source.productName?.trim() || specs["제품명"] || specs["상품명"] || desc[0]?.slice(0, 60) || "이미지로 등록한 제품",
      brand: specs["브랜드"] || specs["제조사"],
      category: specs["카테고리"],
      seller: "이미지 업로드",
      imageUrls: [],
      descriptionText: source.extractedText.trim(),
      specs,
      reviewSnippets: [],
      collectedBy: this.id,
      collectedAt: new Date().toISOString(),
    };
  }
}
