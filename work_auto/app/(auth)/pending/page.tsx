import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Hourglass, LogOut, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { WithdrawForm } from "@/components/shared/WithdrawForm";
import { getSession } from "@/lib/server/auth";
import { formatDate } from "@/lib/utils";
import { AuthShell } from "../AuthShell";
import { signOut } from "../login/actions";

export const metadata = { title: "승인 대기" };

/** 관리자 승인 전(또는 거절된) 사용자가 보는 화면 */
export default async function Page() {
  await connection();
  const session = await getSession();
  if (!session) redirect("/login");
  if (session.status === "active") redirect("/");

  const rejected = session.status === "rejected";
  const Icon = rejected ? ShieldX : Hourglass;

  return (
    <AuthShell>
      <div className="flex flex-col items-center text-center">
        <span className={`flex size-12 items-center justify-center rounded-full ${rejected ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning"}`}>
          <Icon className="size-5" />
        </span>
        <h1 className="mt-4 text-[17px] font-semibold text-fg">{rejected ? "가입이 승인되지 않았습니다" : "관리자 승인을 기다리고 있습니다"}</h1>
        <p className="mt-2 text-[13px] leading-relaxed text-fg-subtle">
          {rejected ? (
            <>가입 신청이 거절되었습니다. 문의 사항은 관리자에게 연락해 주세요.</>
          ) : (
            <>
              가입 신청이 접수되었습니다. 관리자가 승인하면 바로 사용할 수 있습니다.
              <br />
              승인 후 이 화면을 새로고침하거나 다시 로그인해 주세요.
            </>
          )}
        </p>
        <dl className="mt-5 w-full rounded-control bg-subtle px-4 py-3 text-left text-[13px]">
          <div className="flex justify-between py-0.5">
            <dt className="text-fg-subtle">이름</dt>
            <dd className="text-fg">{session.user.name}</dd>
          </div>
          <div className="flex justify-between py-0.5">
            <dt className="text-fg-subtle">이메일</dt>
            <dd className="text-fg">{session.user.email}</dd>
          </div>
          <div className="flex justify-between py-0.5">
            <dt className="text-fg-subtle">확인 시각</dt>
            <dd className="tabular text-fg">{formatDate(new Date().toISOString())}</dd>
          </div>
        </dl>
        <form action={signOut} className="mt-5 w-full">
          <Button type="submit" icon={LogOut} className="w-full">
            로그아웃
          </Button>
        </form>
      </div>
      <div className="mt-6 border-t border-line pt-5">
        <p className="mb-3 text-xs text-fg-subtle">가입을 취소하려면 계정을 삭제할 수 있습니다.</p>
        <WithdrawForm label="가입 취소 (계정 삭제)" />
      </div>
    </AuthShell>
  );
}
