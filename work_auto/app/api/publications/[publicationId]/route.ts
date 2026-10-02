import type { NextRequest } from "next/server";
import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { scheduleLearning } from "@/lib/server/services/learning";
import { publicationService } from "@/lib/server/services/publications";

export const maxDuration = 120;
import type { ContentPublicationInput } from "@/lib/types";

type Ctx = RouteContext<"/api/publications/[publicationId]">;

/** PUT /api/publications/:id — 수정 (등록자·담당자·관리자) */
export async function PUT(request: NextRequest, ctx: Ctx) {
  const { publicationId } = await ctx.params;
  return handle(async () => {
    const session = await requireAccess("uploads");
    const updated = await publicationService.update(session, publicationId, await readJson<Partial<ContentPublicationInput>>(request));
    if (updated.status === "published") scheduleLearning(updated.contentId);
    return updated;
  });
}

/** DELETE /api/publications/:id — 삭제 (등록자·관리자) */
export async function DELETE(_request: NextRequest, ctx: Ctx) {
  const { publicationId } = await ctx.params;
  return handle(async () => {
    const session = await requireAccess("uploads");
    await publicationService.remove(session, publicationId);
    return { id: publicationId };
  });
}
