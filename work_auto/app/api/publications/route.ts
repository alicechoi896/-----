import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { publicationService } from "@/lib/server/services/publications";
import type { ContentPublicationInput } from "@/lib/types";

/** GET /api/publications?from=ISO&to=ISO — 기간 안의 업로드 기록 (팀 전체) */
export async function GET(request: Request) {
  return handle(async () => {
    const session = await requireAccess("uploads");
    const sp = new URL(request.url).searchParams;
    return publicationService.list(session, { from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined });
  });
}

/** POST /api/publications — 업로드 등록 */
export async function POST(request: Request) {
  return handle(async () => {
    const session = await requireAccess("uploads");
    return publicationService.create(session, await readJson<Partial<ContentPublicationInput>>(request));
  });
}
