import { handle, readJson } from "@/lib/server/http";
import { accountService } from "@/lib/server/services/account";

/** GET /api/account — 내 프로필 */
export async function GET() {
  return handle(() => accountService.getMe());
}

/** PATCH /api/account { name } — 이름 변경 */
export async function PATCH(request: Request) {
  return handle(async () => {
    const { name } = await readJson<{ name: string }>(request);
    return accountService.updateName(name);
  });
}
