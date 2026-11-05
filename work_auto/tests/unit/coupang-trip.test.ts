import { describe, expect, it, vi } from "vitest";
import { parseSupportedProductUrl } from "@/lib/product-url";

vi.mock("server-only", () => ({}));
const { parseCoupangTrip } = await import("@/lib/server/services/coupang-trip");

describe("쿠팡 트래블 (v0.9.176)", () => {
  it("trip.coupang.com 숙소 주소를 쿠팡 트래블로 받는다", () => {
    const p = parseSupportedProductUrl("https://trip.coupang.com/tp/products/30000011285411?abc=1");
    expect(p).toMatchObject({ supported: true, platform: "coupang_trip", productId: "30000011285411", canonicalKey: "coupang-trip:30000011285411", collectionUrl: "https://trip.coupang.com/tp/products/30000011285411" });
    expect(parseSupportedProductUrl("https://trip.coupang.com/tp/search").supported).toBe(false);
    // 일반 쿠팡은 그대로
    expect(parseSupportedProductUrl("https://www.coupang.com/vp/products/12345")).toMatchObject({ supported: true, platform: "coupang" });
  });
  it("페이지에서 이름·주소·종류·체크인·사진(원본 크기)을 읽고 판매자 고지는 뺀다", () => {
    const html = `<meta property="og:title" content="COUPANG"><meta property="og:title" content="쿠팡 트래블 | 로드328"><meta name="description" content="전남 여수시 돌산읍 평사리 1006-23 | 펜션 | 전객실 탁트인 오션뷰에 개별자쿠지와스파를 보유 한 펜션입니다">
      <img src="https://thumbnail.coupangcdn.com/thumbnails/remote/400x200q60crop200x200/image/static/booking/image/pension/ddnayo/a1.jpg">
      <img src="//thumbnail.coupangcdn.com/thumbnails/remote/400x200q60crop200x200/image/static/booking/image/pension/ddnayo/a1.jpg">
      "productName":"로드328","itemName":"[여수시] 로드328","description":"체크인: 15:00 ~ \n체크아웃:  ~ 11:00","description":"주식회사 떠나요 / 이재원","description":"1660-0960","description":"바베큐\n전기그릴 2~3인기준 20,000원"`;
    const r = parseCoupangTrip(html, "https://trip.coupang.com/tp/products/1", "coupang-trip:1", "1");
    expect(r.brand).toBe("로드328");
    expect(r.title).toBe("[여수시] 로드328");
    expect(r.category).toBe("여행 > 숙박 > 펜션");
    expect(r.specs["주소"]).toContain("여수시");
    expect(r.specs["체크인·체크아웃"]).toContain("15:00");
    expect(r.imageUrls).toEqual(["https://image.coupangcdn.com/image/static/booking/image/pension/ddnayo/a1.jpg"]);
    expect(r.descriptionText).toContain("오션뷰");
    expect(r.descriptionText).toContain("바베큐");
    expect(r.descriptionText).not.toContain("주식회사");
    expect(r.descriptionText).not.toContain("1660-0960");
  });
});
