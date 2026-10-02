import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { productAnalyzer } from "@/lib/server/services/product-analyzer";

/** AI 가 이미지를 읽는 데 시간이 걸릴 수 있어 함수 실행 시간을 늘린다 */
export const maxDuration = 120;

/**
 * POST /api/products/extract-images { images: [{ mediaType, data(base64) }], partLabel? }
 * 상세페이지 이미지 조각 → 텍스트. 이미지는 저장하지 않고 AI 호출에만 쓴다.
 * 요청 크기 한도(약 4MB) 때문에 브라우저가 여러 번 나눠 보낸다.
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("product-learning");
    await rateLimit("product-images");
    const { images, partLabel } = await readJson<{ images: { mediaType: string; data: string }[]; partLabel?: string }>(request);
    return productAnalyzer.extractFromImages(images, partLabel);
  });
}
