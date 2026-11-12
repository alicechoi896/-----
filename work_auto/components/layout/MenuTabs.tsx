import Link from "next/link";
import { FEATURES, STANDALONE_PAGES } from "@/lib/registry";
import { menuItemOf } from "@/lib/registry/menu";
import { cn } from "@/lib/utils";

/**
 * v0.9.197 같은 일을 하는 플랫폼별 화면을 한 메뉴로 묶고, 화면 위쪽 탭으로 오간다
 * (예: 영상 원고 = 유튜브 제품 · 유튜브 정보성 · 네이버 클립 제품 · 네이버 클립 정보성). 각 화면·주소·기능은 그대로.
 */
export function MenuTabs({ featureId, allowed }: { featureId: string; allowed: string[] }) {
  const m = menuItemOf(featureId);
  if (!m || m.item.tabs.length < 2) return null;
  const ok = new Set(allowed);
  const tabs = m.item.tabs
    .filter((t) => ok.has(t.id))
    .map((t) => ({ ...t, href: FEATURES.find((f) => f.id === t.id)?.href ?? STANDALONE_PAGES.find((p) => p.id === t.id)?.href ?? null }))
    .filter((t): t is typeof t & { href: string } => Boolean(t.href));
  if (tabs.length < 2) return null;
  return (
    <nav className="mb-5 flex flex-wrap gap-1 border-b border-line" aria-label={`${m.item.title} 종류`} data-menu-tabs>
      {tabs.map((t) => {
        const active = t.id === featureId;
        return (
          <Link
            key={t.id}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn("-mb-px border-b-2 px-3 py-2 text-[13px] transition-colors", active ? "border-brand font-semibold text-fg" : "border-transparent text-fg-muted hover:text-fg")}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
