import { requireAccess } from "@/lib/server/auth";
import { handle } from "@/lib/server/http";
import { dramaStudioService as svc } from "@/lib/server/drama-studio/service";

/** GET /api/drama-studio/:id/export — 로그라인·인물·시나리오·프롬프트 (Markdown 파일) */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    await requireAccess("drama-test");
    const text = await svc.exportText((await ctx.params).id);
    return new Response(text, { headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent("drama.md")}`, "cache-control": "no-store" } });
  } catch {
    return handle(async () => {
      await requireAccess("drama-test");
      return svc.exportText((await ctx.params).id);
    });
  }
}
