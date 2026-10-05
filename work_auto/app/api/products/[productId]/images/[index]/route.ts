import type { NextRequest } from "next/server";
import { requireSession } from "@/lib/server/auth";
import { AppError, handle } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { safeFetch } from "@/lib/server/security/safe-url";
import { productService } from "@/lib/server/services/products";

type Ctx = RouteContext<"/api/products/[productId]/images/[index]">;

/** 받아도 되는 쇼핑몰 이미지 서버 (쿠팡·네이버) */
const IMAGE_HOSTS = [/\.coupangcdn\.com$/i, /\.pstatic\.net$/i, /\.naver\.net$/i];
const MAX_BYTES = 8_000_000;

/**
 * GET /api/products/:id/images/:n — 제품 사진(수집한 주소 n번째)을 그대로 전달 (v0.9.38)
 * 브라우저는 쇼핑몰 이미지 서버에서 직접 받을 수 없어(CORS) 블로그 제품 사진 자동 불러오기에 쓴다.
 * 저장하지 않고 흘려 보내기만 한다. 내 제품의 사진 주소만, 쇼핑몰 이미지 서버만.
 */
export async function GET(_request: NextRequest, ctx: Ctx) {
  const { productId, index } = await ctx.params;
  try {
    await requireSession();
    await rateLimit("product-photo-proxy");
    const { source } = await productService.getDetail(productId);
    const url = source?.raw.imageUrls?.[Number(index)];
    if (!url) throw new AppError("NOT_FOUND", "제품 사진이 없습니다.", 404);
    const host = new URL(url).hostname;
    if (!IMAGE_HOSTS.some((re) => re.test(host))) throw new AppError("VALIDATION", "불러올 수 없는 이미지 주소입니다.", 400);
    const res = await safeFetch(url, { signal: AbortSignal.timeout(15_000) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) throw new AppError("UPSTREAM", "제품 사진을 받지 못했습니다.", 502);
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) throw new AppError("VALIDATION", "제품 사진이 너무 큽니다.", 413);
    return new Response(buf, { headers: { "content-type": type, "cache-control": "private, max-age=3600" } });
  } catch (e) {
    return handle(async () => {
      throw e;
    });
  }
}
