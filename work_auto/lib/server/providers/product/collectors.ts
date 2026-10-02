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

const SELLER_BY_HOST: [RegExp, string][] = [
  [/coupang\.com/, "쿠팡"],
  [/smartstore\.naver\.com|brand\.naver\.com|shopping\.naver\.com/, "스마트스토어"],
  [/11st\.co\.kr/, "11번가"],
  [/gmarket\.co\.kr/, "G마켓"],
  [/auction\.co\.kr/, "옥션"],
  [/ssg\.com/, "SSG"],
  [/oliveyoung\.co\.kr/, "올리브영"],
  [/musinsa\.com/, "무신사"],
  [/kurly\.com/, "컬리"],
];

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)));
}

function meta(html: string, key: string): string {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${key}["']`, "i");
  const m = html.match(re);
  return decodeEntities((m?.[1] ?? m?.[2] ?? "").trim());
}

interface JsonLdProduct {
  name?: string;
  description?: string;
  brand?: string | { name?: string };
  category?: string;
  image?: string | string[];
  offers?: { price?: string | number } | { price?: string | number }[];
}

function findJsonLdProduct(html: string): JsonLdProduct | null {
  const blocks = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) ?? [];
  for (const block of blocks) {
    const json = block.replace(/^<script[^>]*>/i, "").replace(/<\/script>$/i, "");
    try {
      const data = JSON.parse(json);
      const items: unknown[] = Array.isArray(data) ? data : data["@graph"] ?? [data];
      const product = items.find((i) => {
        const t = (i as { "@type"?: string | string[] })["@type"];
        return t === "Product" || (Array.isArray(t) && t.includes("Product"));
      });
      if (product) return product as JsonLdProduct;
    } catch {
      /* 잘못된 JSON-LD 는 건너뛴다 */
    }
  }
  return null;
}

/** HTML → 읽을 수 있는 본문 텍스트 (스크립트·스타일 제거) */
function visibleText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|tr|section)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length > 1)
    .join("\n");
}

/**
 * 상품 URL → 실제 웹페이지 수집 (실제 동작).
 * - 페이지의 공개 정보(og 태그, 구조화 데이터 JSON-LD, 본문 텍스트)를 읽는다
 * - 쇼핑몰이 자동 수집을 막으면(쿠팡 등) 예시 제품으로 바꾸지 않고 원인과 대안(이미지 업로드)을 안내한다
 * - 상세 설명이 이미지로만 되어 있으면 텍스트가 거의 없으므로, 이미지 업로드를 함께 쓰도록 안내한다
 */
export class WebPageCollector implements ProductDataCollector {
  readonly id = "webpage-collector";
  readonly label = "웹페이지 수집";

  supports(source: ProductSourceInput) {
    return source.type === "url";
  }

  async collect(source: ProductSourceInput): Promise<RawProductData> {
    if (source.type !== "url") throw new AppError("BAD_SOURCE", "URL 입력이 아닙니다.");
    let url: URL;
    try {
      url = new URL(source.url.trim());
      if (!/^https?:$/.test(url.protocol)) throw new Error();
    } catch {
      throw new AppError("BAD_URL", "올바른 상품 URL 을 입력해 주세요. (https:// 로 시작)");
    }
    const seller = SELLER_BY_HOST.find(([re]) => re.test(url.hostname))?.[1] ?? url.hostname;
    const blocked = new AppError(
      "SITE_BLOCKED",
      `${seller} 은(는) 자동 수집을 막고 있어 URL 로 읽을 수 없습니다. 상세페이지를 캡처해 '이미지 업로드' 탭으로 올려 주세요. (AI 가 이미지를 직접 읽습니다)`,
      422,
    );

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
          "Accept-Language": "ko-KR,ko;q=0.9",
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "follow",
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new AppError("FETCH_FAILED", "상품 페이지에 접속하지 못했습니다. 주소를 확인하거나 이미지 업로드를 이용해 주세요.", 422);
    }
    if ([401, 403, 429, 503].includes(res.status)) throw blocked;
    if (!res.ok) throw new AppError("FETCH_FAILED", `상품 페이지를 읽지 못했습니다 (HTTP ${res.status}).`, 422);

    const html = (await res.text()).slice(0, 2_000_000);
    if (/captcha|access denied|비정상적인 접근|robot check/i.test(html.slice(0, 20_000)) && html.length < 50_000) throw blocked;

    const ld = findJsonLdProduct(html);
    const title =
      ld?.name || meta(html, "og:title") || decodeEntities(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "");
    const description = ld?.description || meta(html, "og:description") || meta(html, "description");
    const brand = typeof ld?.brand === "string" ? ld.brand : ld?.brand?.name;
    const offer = Array.isArray(ld?.offers) ? ld?.offers[0] : ld?.offers;
    const price = Number(offer?.price ?? meta(html, "product:price:amount")) || undefined;
    const images = [
      ...(Array.isArray(ld?.image) ? ld.image : ld?.image ? [ld.image] : []),
      meta(html, "og:image"),
    ].filter(Boolean);
    const body = visibleText(html).slice(0, 15_000);

    // 상품 정보가 거의 없는 페이지(없는 상품, 로그인·차단 화면 등)는 수집하지 않는다
    if ((!title && body.length < 200) || (!ld && !description && body.length < 100)) {
      throw new AppError(
        "NO_PRODUCT_INFO",
        "이 주소에서 상품 정보를 찾지 못했습니다. 상품 상세 주소가 맞는지 확인하거나, 상세페이지를 캡처해 '이미지 업로드'로 올려 주세요.",
        422,
      );
    }

    return {
      sourceType: "url",
      url: url.toString(),
      seller,
      title: title || "제목을 찾지 못한 상품",
      brand: brand || undefined,
      price,
      category: ld?.category,
      imageUrls: Array.from(new Set(images)).slice(0, 10),
      descriptionText: [description, body].filter(Boolean).join("\n\n"),
      specs: {},
      reviewSnippets: [],
      collectedBy: this.id,
      collectedAt: new Date().toISOString(),
    };
  }
}
