import { connection } from "next/server";
import { LinkButton } from "@/components/ui/Button";
import { Notice } from "@/components/ui/States";
import { getSession } from "@/lib/server/auth";
import { AuthShell } from "../AuthShell";
import { ResetPasswordForm } from "./ResetPasswordForm";

export const metadata = { title: "비밀번호 재설정" };

/** 메일의 재설정 링크 → /auth/callback (세션 생성) → 이 화면 */
export default async function Page() {
  await connection();
  const session = await getSession();
  return (
    <AuthShell title="새 비밀번호 정하기">
      {session ? (
        <ResetPasswordForm email={session.user.email} />
      ) : (
        <div className="grid gap-4">
          <Notice tone="warning">재설정 링크가 만료되었거나 올바르지 않습니다. 비밀번호 찾기를 다시 진행해 주세요.</Notice>
          <LinkButton href="/forgot-password" variant="primary" className="w-full">
            비밀번호 찾기
          </LinkButton>
        </div>
      )}
    </AuthShell>
  );
}
