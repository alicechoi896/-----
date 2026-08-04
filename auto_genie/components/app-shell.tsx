"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Radar,
  UploadCloud,
  Sparkles,
  FlaskConical,
  LayoutGrid,
  Workflow,
  TrendingUp,
  Cpu,
  Settings,
  ChevronsUpDown,
  LogOut,
  PlayCircle,
  Check,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { switchOrganizationAction, signOutAction } from "@/app/(app)/actions";
import { DemoModeDrawer } from "@/components/demo-mode-drawer";
import { DemoBrainStoreProvider } from "@/lib/demo/store";
import type { CurrentOrganization } from "@/lib/auth";

const NAV_ITEMS = [
  { href: "/dashboard", label: "AI 컨트롤타워", icon: Radar },
  { href: "/learning", label: "AI 학습센터", icon: UploadCloud },
  { href: "/brain", label: "마케팅 브레인", icon: Sparkles },
  { href: "/strategy", label: "전략 시뮬레이터", icon: FlaskConical },
  { href: "/orchestrator", label: "콘텐츠 오케스트레이터", icon: LayoutGrid },
  { href: "/workflow", label: "자동화 워크플로우", icon: Workflow },
  { href: "/performance", label: "성과 학습센터", icon: TrendingUp },
  { href: "/technology", label: "AI 기술 리포트", icon: Cpu },
  { href: "/settings", label: "설정", icon: Settings },
];

export function AppShell({
  organization,
  organizations,
  userEmail,
  children,
}: {
  organization: CurrentOrganization;
  organizations: CurrentOrganization[];
  userEmail: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [demoModeOpen, setDemoModeOpen] = useState(false);
  const isDemoWorkspace = organization.name.includes("인더업");

  return (
    <div className="min-h-screen flex bg-neutral-50">
      <aside className="w-64 shrink-0 border-r border-neutral-200 bg-white flex flex-col">
        <div className="h-16 flex items-center px-5 border-b border-neutral-200">
          <span className="text-lg font-semibold text-neutral-900">jini</span>
          <span className="text-lg font-semibold text-violet-600">.ai</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "bg-violet-50 text-violet-700"
                    : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
                }`}
              >
                <item.icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-neutral-200 p-3 space-y-2">
          {isDemoWorkspace && (
            <Badge
              variant="outline"
              className="w-full justify-center border-amber-300 bg-amber-50 text-amber-700"
            >
              시연용 데이터 워크스페이스
            </Badge>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="w-full flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm hover:bg-neutral-100 text-left">
                <div className="size-7 rounded-lg bg-violet-600 text-white flex items-center justify-center text-xs font-semibold shrink-0">
                  {organization.name.slice(0, 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate font-medium text-neutral-900">{organization.name}</p>
                  <p className="truncate text-xs text-neutral-500">{userEmail}</p>
                </div>
                <ChevronsUpDown className="size-3.5 text-neutral-400 shrink-0" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>워크스페이스</DropdownMenuLabel>
              {organizations.map((org) => (
                <DropdownMenuItem
                  key={org.id}
                  onClick={() => {
                    if (org.id !== organization.id) {
                      switchOrganizationAction(org.id);
                    }
                  }}
                >
                  {org.id === organization.id && <Check className="size-3.5" />}
                  <span className="truncate">{org.name}</span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => {
                  signOutAction();
                }}
              >
                <LogOut className="size-3.5" /> 로그아웃
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-neutral-200 bg-white flex items-center justify-end px-6 gap-3">
          <Button variant="outline" size="sm" onClick={() => setDemoModeOpen(true)}>
            <PlayCircle className="size-4" /> 면접 시연 모드
          </Button>
        </header>
        <main className="flex-1 overflow-y-auto">
          <DemoBrainStoreProvider>{children}</DemoBrainStoreProvider>
        </main>
      </div>

      <DemoModeDrawer open={demoModeOpen} onOpenChange={setDemoModeOpen} />
    </div>
  );
}
