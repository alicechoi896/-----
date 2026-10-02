import { requireSession } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { memoryService, type MemoryKind } from "@/lib/server/services/memory";

/** POST /api/memory/delete { kind: contents|products|feedback|performance, ids[] } — 체크한 항목 삭제 (내 데이터만) */
export async function POST(request: Request) {
  return handle(async () => {
    await requireSession();
    const { kind, ids } = await readJson<{ kind: MemoryKind; ids: string[] }>(request);
    return memoryService.deleteMany(kind, ids);
  });
}
