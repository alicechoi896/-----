import type { ReactNode } from "react";
import { AppSidebar } from "./AppSidebar";

/** 전체 레이아웃: 왼쪽 사이드바 + 오른쪽 메인 콘텐츠 */
export function AppShell({ children, providerMode }: { children: ReactNode; providerMode: "mock" | "live" }) {
  return (
    <div className="min-h-screen bg-canvas lg:flex">
      <AppSidebar providerMode={providerMode} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
