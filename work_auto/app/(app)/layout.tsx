import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AppShell } from "@/components/layout/AppShell";
import { getSession } from "@/lib/server/auth";
import { getProviderMode } from "@/lib/server/config";

/**
 * 로그인 후 화면 공통 레이아웃 (사이드바 + 메인).
 * 세션이 없으면 로그인 화면으로 보낸다 (데모 모드에서는 항상 데모 관리자 세션이 있다).
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  // 로그인 사용자마다 화면(메뉴, 권한)이 다르므로 항상 요청 시점에 렌더링한다
  await connection();
  const session = await getSession();
  if (!session) redirect("/login");
  // 관리자 승인 전(또는 거절된) 사용자는 안내 화면만 볼 수 있다
  if (session.status !== "active") redirect("/pending");

  return (
    <AppShell providerMode={getProviderMode()} session={session}>
      {children}
    </AppShell>
  );
}
