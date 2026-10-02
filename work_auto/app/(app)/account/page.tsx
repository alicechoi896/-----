import { UserRound } from "lucide-react";
import { PageContainer } from "@/components/layout/PageContainer";
import { PageHeader } from "@/components/layout/PageHeader";
import { AccountSettings } from "@/features/account/AccountSettings";
import { getSession } from "@/lib/server/auth";

export const metadata = { title: "내 정보" };

/** 내 정보 (모든 승인된 사용자. 권한 관리 대상이 아니다) */
export default async function Page() {
  const session = await getSession();
  return (
    <PageContainer width="wide">
      <PageHeader
        title="내 정보"
        description="이름과 비밀번호를 바꾸거나 탈퇴할 수 있습니다."
        icon={UserRound}
        accent="neutral"
        crumbs={[{ label: "홈", href: "/" }, { label: "내 정보" }]}
      />
      <AccountSettings demo={session?.mode !== "supabase"} />
    </PageContainer>
  );
}
