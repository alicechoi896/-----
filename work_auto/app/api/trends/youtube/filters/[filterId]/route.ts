import { requireAccess } from "@/lib/server/auth";
import type { NextRequest } from "next/server";
import { handle, readJson } from "@/lib/server/http";
import { savedTrendService } from "@/lib/server/services/saved-trends";

/** PATCH /api/trends/youtube/filters/:id { name?, isDefault? } */
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/trends/youtube/filters/[filterId]">) {
  const { filterId } = await ctx.params;
  return handle(async () => {
    await requireAccess("yt-trends");
    return savedTrendService.updateFilter(filterId, await readJson(request));
  });
}

/** DELETE /api/trends/youtube/filters/:id */
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/trends/youtube/filters/[filterId]">) {
  const { filterId } = await ctx.params;
  return handle(async () => {
    await requireAccess("yt-trends");
    await savedTrendService.removeFilter(filterId);
    return { id: filterId };
  });
}
