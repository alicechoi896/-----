"use client";

import { useEffect, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronsUpDown,
  ChevronDown,
  LogOut,
  PlayCircle,
  Check,
  ShieldCheck,
  UserRound,
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
import { switchOrganizationAction, signOutAction, setScreenModeAction } from "@/app/(app)/actions";
import { DemoModeDrawer } from "@/components/demo-mode-drawer";
import { DemoBrainStoreProvider } from "@/lib/demo/store";
import { getMenuForMode, SETTINGS_ITEM, type MenuItem, type MenuChild } from "@/lib/access/menu-config";
import type { ScreenMode } from "@/lib/access/screen-mode";
import type { CurrentOrganization } from "@/lib/auth";

function stripQuery(route: string): string {
  return route.split("?")[0];
}

function tabOf(route: string): string | null {
  return route.includes("?tab=") ? route.split("?tab=")[1] : null;
}

export function AppShell({
  organization,
  organizations,
  userEmail,
  screenMode,
  canUseTechnicalMode,
  children,
}: {
  organization: CurrentOrganization;
  organizations: CurrentOrganization[];
  userEmail: string;
  screenMode: ScreenMode;
  canUseTechnicalMode: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentTab = searchParams.get("tab");
  const [demoModeOpen, setDemoModeOpen] = useState(false);
  const [modePending, startModeTransition] = useTransition();
  const navItems = getMenuForMode(screenMode);

  useEffect(() => {
    if (searchParams.get("accessDenied") === "1") {
      toast.error("접근 권한이 없는 화면입니다.");
      const params = new URLSearchParams(searchParams);
      params.delete("accessDenied");
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run only when accessDenied param changes
  }, [searchParams]);

  return (
    <div className="min-h-screen flex bg-neutral-50">
      <aside className="w-64 shrink-0 border-r border-neutral-200 bg-white flex flex-col">
        <div className="h-16 flex items-center gap-2 px-5 border-b border-neutral-200">
          <Image src="/icon.png" alt="자동화 지니" width={30} height={30} className="shrink-0" />
          <span className="text-lg font-semibold text-neutral-900">자동화 지니</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navItems.map((item) => {
            const ownPaths = [item.route, ...(item.children?.map((c) => c.route) ?? [])].map(stripQuery);
            const active = ownPaths.some((p) => pathname === p || pathname.startsWith(p + "/"));
            return item.children ? (
              <NavGroup key={item.id} item={item} active={active} pathname={pathname} currentTab={currentTab} />
            ) : (
              <Link
                key={item.id}
                href={item.route}
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

          <Link
            href={SETTINGS_ITEM.route}
            className={`flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
              pathname === SETTINGS_ITEM.route
                ? "bg-violet-50 text-violet-700"
                : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900"
            }`}
          >
            <SETTINGS_ITEM.icon className="size-4 shrink-0" />
            {SETTINGS_ITEM.label}
          </Link>
        </nav>

        <div className="border-t border-neutral-200 p-3 space-y-2">
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
        <header className="border-b border-neutral-200 bg-white">
          <div className="h-16 flex items-center justify-end px-6 gap-3">
            <span
              className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${
                screenMode === "technical"
                  ? "bg-violet-100 text-violet-700"
                  : "bg-neutral-100 text-neutral-600"
              }`}
            >
              {screenMode === "technical" ? (
                <ShieldCheck className="size-3.5" />
              ) : (
                <UserRound className="size-3.5" />
              )}
              {screenMode === "technical" ? "관리자·기술 시연 모드" : "일반 사용자 모드"}
            </span>

            {canUseTechnicalMode && (
              <Button
                variant="outline"
                size="sm"
                disabled={modePending}
                onClick={() =>
                  startModeTransition(async () => {
                    await setScreenModeAction(screenMode === "technical" ? "user" : "technical");
                  })
                }
              >
                {screenMode === "technical" ? "일반 사용자 모드" : "관리자·기술 시연 모드"}
              </Button>
            )}

            <Button variant="outline" size="sm" onClick={() => setDemoModeOpen(true)}>
              <PlayCircle className="size-4" /> 시연 모드
            </Button>
          </div>
          {screenMode === "technical" && (
            <div className="px-6 py-1.5 bg-violet-50 border-t border-violet-100 text-xs text-violet-700">
              AI의 데이터 처리 과정과 판단 근거를 확인하는 관리자용 화면입니다.
            </div>
          )}
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
  item: MenuItem;
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
          {item.children!.map((child: MenuChild) => {
            const childPath = stripQuery(child.route);
            const childTab = tabOf(child.route);
            const childActive = pathname === childPath && currentTab === childTab;
            return (
              <Link
                key={child.id}
                href={child.route}
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
