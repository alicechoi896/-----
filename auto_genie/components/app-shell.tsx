"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
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
  ChevronDown,
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

interface NavChild {
  href: string;
  label: string;
}

interface NavItem {
  href: string;
  label: string;
  icon: typeof Radar;
  children?: NavChild[];
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "AI 컨트롤타워", icon: Radar },
  {
    href: "/learning",
    label: "AI 학습센터",
    icon: UploadCloud,
    children: [
      { href: "/learning", label: "데이터 수집" },
      { href: "/learning?tab=reference", label: "참조 콘텐츠 분석" },
      { href: "/learning?tab=pipeline", label: "분석 파이프라인" },
      { href: "/learning?tab=quality", label: "데이터 품질관리" },
    ],
  },
  { href: "/brain", label: "마케팅 브레인", icon: Sparkles },
  { href: "/strategy", label: "전략 시뮬레이터", icon: FlaskConical },
  { href: "/orchestrator", label: "콘텐츠 오케스트레이터", icon: LayoutGrid },
  { href: "/workflow", label: "자동화 워크플로우", icon: Workflow },
  {
    href: "/performance",
    label: "성과 학습센터",
    icon: TrendingUp,
    children: [
      { href: "/performance", label: "통합 성과" },
      { href: "/performance?tab=ai-analysis", label: "AI 성과 해석" },
      { href: "/performance?tab=rule-update", label: "생성 규칙 업데이트" },
      { href: "/performance?tab=before-after", label: "학습 전후 비교" },
      { href: "/performance?tab=brain-history", label: "AI 브레인 변경 이력" },
    ],
  },
  { href: "/technology", label: "AI 기술 리포트", icon: Cpu },
  { href: "/settings", label: "설정", icon: Settings },
];

function stripQuery(href: string): string {
  return href.split("?")[0];
}

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
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab");
  const [demoModeOpen, setDemoModeOpen] = useState(false);
  const isDemoWorkspace = organization.name.includes("인더업");

  return (
    <div className="min-h-screen flex bg-neutral-50">
      <aside className="w-64 shrink-0 border-r border-neutral-200 bg-white flex flex-col">
        <div className="h-16 flex items-center gap-2 px-5 border-b border-neutral-200">
          <Image src="/icon.png" alt="자동화 지니" width={30} height={30} className="shrink-0" />
          <span className="text-lg font-semibold text-neutral-900">자동화 지니</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return item.children ? (
              <NavGroup key={item.href} item={item} active={active} pathname={pathname} currentTab={currentTab} />
            ) : (
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
            <PlayCircle className="size-4" /> 시연 모드
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

function NavGroup({
  item,
  active,
  pathname,
  currentTab,
}: {
  item: NavItem;
  active: boolean;
  pathname: string;
  currentTab: string | null;
}) {
  const [open, setOpen] = useState(active);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
          active ? "bg-violet-50 text-violet-700" : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
        }`}
      >
        <item.icon className="size-4 shrink-0" />
        <span className="flex-1 text-left">{item.label}</span>
        <ChevronDown className={`size-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-1 ml-4 pl-3 border-l border-neutral-200 space-y-0.5">
          {item.children!.map((child) => {
            const childPath = stripQuery(child.href);
            const childTab = child.href.includes("?tab=") ? child.href.split("?tab=")[1] : null;
            const childActive = pathname === childPath && currentTab === childTab;
            return (
              <Link
                key={child.href}
                href={child.href}
                className={`block rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  childActive
                    ? "bg-violet-50 text-violet-700 font-medium"
                    : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
                }`}
              >
                {child.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
