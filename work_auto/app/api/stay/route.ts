import { after } from "next/server";
import { requireAccess } from "@/lib/server/auth";
import { AppError, handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { stayService } from "@/lib/server/stay/service";
import { videoJobService } from "@/lib/server/video/service";

export const maxDuration = 300;

/** GET /api/stay[?id=] — v0.9.157 AI 숙소 영상 프로젝트 목록 / 하나 (사진 미리보기 주소 포함) */
export async function GET(request: Request) {
  return handle(async () => {
    await requireAccess("ai-stay");
    const id = new URL(request.url).searchParams.get("id");
    return id ? stayService.get(id) : stayService.list();
  });
}

/**
 * POST /api/stay { action, id, ... } — 누를 때만 (자동 재시도 없음)
 * create · update · upload(사진 1장) · product(제품 라이브러리 숙소에서 사진·메모, 무료) · coupang(주소 1번 시도, 무료) · script(AI 1번) · translate(움직임 한글 번역, AI 1번) · animate(Kie, 사진 1장 = 1회 과금, confirmed 필수) · status(무료) · render · remove
 */
export async function POST(request: Request) {
  return handle(async () => {
    const session = await requireAccess("ai-stay");
    const b = await readJson<{ action?: string; id?: unknown; name?: unknown; note?: unknown; titleSmall?: unknown; titleBig?: unknown; titleSec?: unknown; photos?: unknown; dataUrl?: unknown; url?: unknown; confirmed?: unknown; productId?: unknown }>(request);
    switch (b.action) {
      case "create":
        return stayService.create(b);
      case "update":
        return stayService.update(b);
      case "upload":
        return stayService.upload(b);
      case "product":
        return stayService.fromProduct(b);
      case "coupang":
        return stayService.fromCoupang(b);
      case "translate":
        await rateLimit("ai-generate");
        return stayService.translate(b);
      case "script":
        await rateLimit("ai-generate");
        return stayService.script(b);
      case "animate":
        return stayService.animate(b);
      case "status":
        return stayService.status(b);
      case "render": {
        await rateLimit("video-render");
        const job = await stayService.render(b, session);
        after(() => videoJobService.run(job.id));
        return job;
      }
      case "remove":
        await stayService.remove(b.id);
        return { ok: true };
      default:
        throw new AppError("VALIDATION", "알 수 없는 요청입니다.");
    }
  });
}
