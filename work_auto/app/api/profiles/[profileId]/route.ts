import { requireSession } from "@/lib/server/auth";
import type { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/server/http";
import { contentProfileService } from "@/lib/server/services/content-profiles";
import type { ContentProfileInput } from "@/lib/types";

type Ctx = RouteContext<"/api/profiles/[profileId]">;

/** PUT /api/profiles/:id — 수정 */
export async function PUT(request: NextRequest, ctx: Ctx) {
  const { profileId } = await ctx.params;
  return handle(async () => {
    await requireSession();
    return contentProfileService.update(profileId, await readJson<Partial<ContentProfileInput>>(request));
  });
}

/** PATCH /api/profiles/:id — 기본 프로필로 설정 */
export async function PATCH(_request: NextRequest, ctx: Ctx) {
  const { profileId } = await ctx.params;
  return handle(async () => {
    await requireSession();
    return contentProfileService.setDefault(profileId);
  });
}

/** DELETE /api/profiles/:id — 삭제 (연결된 스타일은 연결만 풀린다) */
export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const { profileId } = await ctx.params;
  return handle(async () => {
    await requireSession();
    await contentProfileService.remove(profileId);
    return { id: profileId };
  });
}
