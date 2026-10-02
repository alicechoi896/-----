import { requireSession } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { contentProfileService } from "@/lib/server/services/content-profiles";
import type { ContentProfileInput } from "@/lib/types";

/** GET /api/profiles — 내 콘텐츠 프로필 (기본 프로필이 맨 앞) */
export async function GET() {
  return handle(async () => {
    await requireSession();
    await contentProfileService.ensureStarter();
    return contentProfileService.list();
  });
}

/** POST /api/profiles { ...ContentProfileInput } 또는 { example: true } (가전 콘텐츠 예시로 만들기) */
export async function POST(request: Request) {
  return handle(async () => {
    await requireSession();
    const body = await readJson<Partial<ContentProfileInput> & { example?: boolean }>(request);
    return body.example ? contentProfileService.createExample() : contentProfileService.create(body);
  });
}
