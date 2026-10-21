import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { keywordLibrary } from "@/lib/server/services/keyword-library";

/** GET /api/keywords — 키워드 관리 목록 (열 때 만료 정리) / POST — 직접 추가 { keyword(쉼표로 여러 개), productId?, productHint?, note? } */
export async function GET() {
  return handle(async () => {
    await requireAccess("ai-learning");
    return keywordLibrary.list();
  });
}

export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("ai-learning");
    await keywordLibrary.add(await readJson(request));
    return { ok: true };
  });
}
