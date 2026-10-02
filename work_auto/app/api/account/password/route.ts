import { handle, readJson } from "@/lib/server/http";
import { accountService } from "@/lib/server/services/account";

/** POST /api/account/password { currentPassword, newPassword } — 비밀번호 변경 */
export async function POST(request: Request) {
  return handle(async () => {
    const { currentPassword, newPassword } = await readJson<{ currentPassword: string; newPassword: string }>(request);
    return accountService.changePassword(currentPassword, newPassword);
  });
}
