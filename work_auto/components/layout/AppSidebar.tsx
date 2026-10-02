"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Boxes, ChevronRight, House, LogOut, Menu, X, type LucideIcon } from "lucide-react";
import { signOut } from "@/app/(auth)/login/actions";
import { ROLE_LABEL } from "@/lib/permissions";
import { CHANNELS, STANDALONE_PAGES, getFeaturesByChannel, type ChannelDef } from "@/lib/registry";
import type { SessionInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * 왼쪽 사이드바. 메뉴는 전부 Feature Registry 에서 만든다 (하드코딩 금지).
 * - 현재 경로가 속한 채널만 하위 기능을 펼쳐 보여준다 → 기능이 30개 이상이어도 길어지지 않는다.
 * - 권한이 있는 기능만 보여준다 (session.allowed). "사이트 관리"는 관리자에게만 보인다.
 * - lg 미만에서는 상단 바 + 슬라이드 메뉴로 바뀐다.
 */
export function AppSidebar({ providerMode, session }: { providerMode: "mock" | "live"; session: SessionInfo }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const allowed = new Set(session.allowed);
  const isAdmin = session.role === "admin";

  const channels = CHANNELS.filter((c) => c.id !== "settings" && !c.adminOnly);
  const settings = CHANNELS.find((c) => c.id === "settings")!;
  const admin = CHANNELS.find((c) => c.id === "admin")!;

  const nav = (
    <nav className="flex flex-1 flex-col gap-6 overflow-y-auto px-3 py-4" onClick={() => setMobileOpen(false)}>
      <div className="flex flex-col gap-0.5">
        <NavLink href="/" icon={House} label="홈" active={pathname === "/"} />
      </div>

      <NavGroup label="채널">
        {channels.map((c) => (
          <ChannelNav key={c.id} channel={c} pathname={pathname} allowed={allowed} />
        ))}
      </NavGroup>

      <NavGroup label="관리">
        {STANDALONE_PAGES.filter((p) => allowed.has(p.id)).map((p) => (
          <NavLink key={p.id} href={p.href} icon={p.icon} label={p.title} active={pathname.startsWith(p.href)} />
        ))}
        <ChannelNav channel={settings} pathname={pathname} allowed={allowed} />
      </NavGroup>

      {isAdmin && (
        <NavGroup label="관리자">
          <ChannelNav channel={admin} pathname={pathname} allowed={allowed} />
        </NavGroup>
      )}
    </nav>
  );

  return (
    <>
      {/* 모바일 상단 바 */}
      <div className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-canvas px-4 lg:hidden">
        <Brand />
        <button
          type="button"
          aria-label={mobileOpen ? "메뉴 닫기" : "메뉴 열기"}
          onClick={() => setMobileOpen((v) => !v)}
          className="rounded-control p-2 text-fg-muted hover:bg-muted"
        >
          {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-30 bg-fg/20 lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col border-r border-line bg-subtle transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 shrink-0 items-center border-b border-line px-4">
          <Brand />
        </div>
        {nav}
        <div className="shrink-0 border-t border-line px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <Link
              href="/account"
              title="내 정보"
              onClick={() => setMobileOpen(false)}
              className={cn("-mx-1.5 min-w-0 flex-1 rounded-control px-1.5 py-1 hover:bg-muted", pathname === "/account" && "bg-canvas ring-1 ring-line")}
            >
              <p className="truncate text-[13px] font-medium text-fg">{session.user.name}</p>
              <p className="mt-0.5 flex items-center gap-1.5 text-xs text-fg-subtle">
                <span className="rounded bg-canvas px-1.5 py-px font-medium text-fg-muted ring-1 ring-line">{ROLE_LABEL[session.role]}</span>
                <span className="truncate">{session.mode === "demo" ? "데모 모드" : session.user.email}</span>
              </p>
            </Link>
            {session.mode === "supabase" && (
              <form action={signOut}>
                <button
                  type="submit"
                  aria-label="로그아웃"
                  title="로그아웃"
                  className="rounded-control p-1.5 text-fg-subtle hover:bg-muted hover:text-fg"
                >
                  <LogOut className="size-4" />
                </button>
              </form>
            )}
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs text-fg-subtle">
            <span className={cn("size-1.5 rounded-full", providerMode === "live" ? "bg-success" : "bg-info")} />
            {providerMode === "live" ? "실제 API 모드" : "Mock 모드로 실행 중"}
          </div>
        </div>
      </aside>
    </>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2">
      <span className="flex size-7 items-center justify-center rounded-lg bg-fg text-white">
        <Boxes className="size-4" />
      </span>
      <span className="text-[14.5px] font-semibold tracking-tight text-fg">콘텐츠 자동화 센터</span>
    </Link>
  );
}

function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="px-2.5 pb-1 text-[11px] font-semibold tracking-wide text-fg-subtle uppercase">{label}</p>
      {children}
    </div>
  );
}

function NavLink({
  href,
  icon: Icon,
  label,
  active,
  trailing,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  active: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-8 items-center gap-2.5 rounded-control px-2.5 text-[13.5px] transition-colors",
        active ? "bg-canvas font-medium text-fg shadow-card ring-1 ring-line" : "text-fg-muted hover:bg-muted hover:text-fg",
      )}
    >
      <Icon className={cn("size-4 shrink-0", active ? "text-fg" : "text-fg-subtle")} />
      <span className="flex-1 truncate">{label}</span>
      {trailing}
    </Link>
  );
}

function ChannelNav({ channel, pathname, allowed }: { channel: ChannelDef; pathname: string; allowed: Set<string> }) {
  const inChannel = pathname === channel.href || pathname.startsWith(channel.href + "/");
  const features = getFeaturesByChannel(channel.id).filter(
    (f) => f.status !== "planned" && f.href !== channel.href && allowed.has(f.id),
  );

  return (
    <div>
      <NavLink
        href={channel.href}
        icon={channel.icon}
        label={channel.name}
        active={pathname === channel.href}
        trailing={
          features.length > 0 ? (
            <ChevronRight className={cn("size-3.5 text-fg-subtle transition-transform", inChannel && "rotate-90")} />
          ) : null
        }
      />
      {inChannel && features.length > 0 && (
        <div className="mt-0.5 mb-1 ml-[19px] flex flex-col gap-0.5 border-l border-line pl-2">
          {features.map((f) => {
            const active = pathname === f.href || pathname.startsWith(f.href + "/");
            return (
              <Link
                key={f.id}
                href={f.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-7 items-center rounded-md px-2 text-[13px] transition-colors",
                  active ? "bg-canvas font-medium text-brand ring-1 ring-line" : "text-fg-subtle hover:bg-muted hover:text-fg",
                )}
              >
                <span className="truncate">{f.title}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
