import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { scrapService, type ScrapInput } from "@/lib/server/services/scraps";

/** GET /api/scraps — 내 트렌드 스크랩 + 분류 / POST /api/scraps — 스크랩 (같은 항목이면 분류만 바꿈). 외부 호출 0 */
export async function GET() {
  return handle(async () => {
    await requireAccess("scraps");
    const [items, folders] = await Promise.all([scrapService.list(), scrapService.folders()]);
    return { items, folders };
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("scraps");
    return scrapService.add(await readJson<ScrapInput>(request));
  });
}
