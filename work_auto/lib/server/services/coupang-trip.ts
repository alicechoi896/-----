import "server-only";
import type { RawProductData } from "@/lib/types";
import { serverConfig } from "../config";
import { AppError } from "../http";
import { safeFetch } from "../security/safe-url";

/**
 * 쿠팡 트래블 숙소 페이지 직접 읽기 (v0.9.176) — trip.coupang.com/tp/products/{id}
 * Bright Data 쿠팡 수집기는 쿠팡 트래블을 읽지 못해서, 서버가 페이지 HTML 을 1번 받아 읽는다 (외부 유료 호출 없음).
 * 읽는 것: 숙소 이름(productName·og:title) · 주소·종류·소개(meta description) · 체크인/체크아웃·부대시설·이용 안내(description 글) · 사진(원본 크기 주소)
 * 판매자 정보·법적 고지(통신판매·사업자번호·연락처)는 뺀다.
 */
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const unescape = (t: string) =>
  t
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\r\\n|\\n|\\r/g, "\n")
    .replace(/\\"/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

const LEGAL = /^[\d\s()+-]{7,}$|주식회사|사업자|통신판매|@|\d{2,4}-\d{3,4}-\d{4}|\d{3}-\d{2}-\d{5}|판매자는|중개자|예약취소는|서비스 가입사실|안전거래|청약철회|개인정보/;

export function parseCoupangTrip(html: string, url: string, canonicalKey: string, productId: string): RawProductData {
  const meta = (prop: string) => [...html.matchAll(new RegExp(`<meta[^>]+(?:property|name)="${prop}"[^>]+content="([^"]*)"`, "gi"))].map((m) => unescape(m[1]).trim()).filter(Boolean);
  const json = (key: string) => [...html.matchAll(new RegExp(`\\\\?"${key}\\\\?":\\\\?"((?:[^"\\\\]|\\\\.){1,2000}?)\\\\?"`, "g"))].map((m) => unescape(m[1]).trim()).filter(Boolean);
  const name = json("productName")[0] || meta("og:title").find((t) => t !== "COUPANG")?.replace(/^쿠팡 트래블\s*\|\s*/, "") || "";
  if (!name) throw new AppError("COUPANG_TRIP_EMPTY", "쿠팡 트래블 페이지에서 숙소 이름을 찾지 못했습니다. 상세페이지를 캡처해 '이미지 업로드'로 올려 주세요.", 422);
  const itemName = json("itemName")[0] ?? "";
  // meta description: '주소 | 종류 | 소개'
  const desc = meta("description").find((d) => d.includes("|")) ?? meta("description")[0] ?? "";
  const [address = "", kind = "", ...introParts] = desc.split("|").map((x) => x.trim());
  const intro = introParts.join(" | ");
  // 이용 안내 글 (법적 고지·판매자 정보 빼고, 겹치는 것 빼고)
  // 판매 대행사 주소(한 줄, '…층'으로 끝남)·신고번호('2018-서울송파-1579호')·공통 안내문도 뺀다
  const BOILER = /^\S[^\n]{0,60}\d+층$|\d{4}-[가-힣]+-\d+호|예약 현황|객실별 정책|사용조건 및 컨텐츠/;
  const all = [...new Set(json("description").filter((d) => d.length >= 8 && !LEGAL.test(d) && !BOILER.test(d)))];
  // 메타의 잘린 소개('…')보다 긴 같은 글이 있으면 그것만
  const notes = all.slice(0, 12);
  const checkIn = notes.find((n) => /체크인|체크아웃/.test(n));
  // 사진: 썸네일 주소 → 원본 크기 주소 (중복 제거)
  const paths = [...new Set([...html.matchAll(/(?:https?:)?\/\/[a-z0-9.]*coupangcdn\.com\/(?:thumbnails\/remote\/[^/"\\]+\/)?(image\/static\/booking\/image\/[^"\\\s)?]+?\.(?:jpe?g|png|webp))/gi)].map((m) => m[1]))];
  const imageUrls = paths.map((p) => `https://image.coupangcdn.com/${p}`).slice(0, 30);
  const specs: Record<string, string> = {};
  if (address) specs["주소"] = address;
  if (kind) specs["숙소 종류"] = kind;
  if (checkIn) specs["체크인·체크아웃"] = checkIn.replace(/\s*\n\s*/g, " ");
  return {
    sourceType: "url",
    url,
    seller: "쿠팡 트래블",
    title: itemName || name,
    brand: name,
    category: `여행 > 숙박${kind ? ` > ${kind}` : ""}`,
    imageUrls,
    descriptionText: [...(notes.some((n) => intro && n.startsWith(intro.replace(/…$/, "").slice(0, 30))) ? [] : [intro]), ...notes.filter((n) => n !== checkIn)].filter(Boolean).join("\n\n").slice(0, 8000),
    specs,
    reviewSnippets: [],
    collectedBy: "coupang-trip-direct",
    collectedAt: new Date().toISOString(),
    canonicalKey,
    platform: "coupang_trip",
    externalProductId: productId,
  };
}

export async function readCoupangTrip(url: string, canonicalKey: string, productId: string): Promise<RawProductData> {
  if (serverConfig.providerMode !== "live") {
    return parseCoupangTrip(`<meta property="og:title" content="쿠팡 트래블 | 데모 오션뷰 펜션"><meta name="description" content="전남 여수시 데모로 1 | 펜션 | 전객실 오션뷰에 개별 스파가 있는 펜션입니다">"productName":"데모 오션뷰 펜션","description":"체크인: 15:00 ~ \\n체크아웃: ~ 11:00","description":"바베큐 2~3인 기준 20,000원"`, url, canonicalKey, productId);
  }
  const res = await safeFetch(url, { signal: AbortSignal.timeout(20_000), headers: { "User-Agent": UA, Accept: "text/html", "Accept-Language": "ko-KR,ko;q=0.9" } }).catch(() => null);
  console.info("[CoupangTrip] fetch", JSON.stringify({ productId, status: res?.status ?? 0 }));
  if (!res || !res.ok) throw new AppError("COUPANG_TRIP_BLOCKED", `쿠팡이 서버 접속을 막았습니다 (HTTP ${res?.status ?? "연결 실패"}). 아래 [저장한 페이지(.html) 올리기]로 해 주세요 — 숙소 페이지에서 Ctrl+S → '웹페이지, HTML만' 저장 → 올리기 (무료).`, 502);
  return parseCoupangTrip(await res.text(), url, canonicalKey, productId);
}
