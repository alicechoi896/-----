import { handle, readJson } from "@/lib/server/http";
import { accountService } from "@/lib/server/services/account";

/** POST /api/account/withdraw { password } — 회원 탈퇴 (본인 확인 후 계정과 데이터 삭제) */
export async function POST(request: Request) {
  return handle(async () => {
    const { password } = await readJson<{ password: string }>(request);
    return accountService.withdraw(password);
  });
}
