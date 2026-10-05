import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { scriptFormatService } from "@/lib/server/services/script-formats";

/**
 * POST /api/script-formats/titles { formatId? | newFormat: { name, contentType }, titles: [{ title, views }] }
 * 트렌드 찾기·영상 검색의 [대본 포맷에 담기] — 제목칸에만 담는다 (대본은 비움)
 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("ai-learning");
    return scriptFormatService.addTitles(await readJson(request));
  });
}
