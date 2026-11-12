import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";
import { SITE_NAME } from "@/lib/site";
import { PageHeader } from "@/components/layout/PageHeader";
import { HomeOverview } from "@/features/home/HomeOverview";
import { FEATURES, STANDALONE_PAGES } from "@/lib/registry";
import { MENU } from "@/lib/registry/menu";
import { getSession } from "@/lib/server/auth";

/** 1차 화면 (v0.9.197): 왼쪽 메뉴와 같은 6묶음 — 찾기 → 제품·소재 → 만들기 → 올리기·성과 → 설정 */
export default async function HomePage() {
  const session = await getSession();
  const allowed = new Set(session?.allowed ?? []);
  const info = (id: string) => FEATURES.find((f) => f.id === id) ?? STANDALONE_PAGES.find((p) => p.id === id) ?? null;
  return (
    <PageContainer>
      <PageHeader title={SITE_NAME} description="일하는 순서대로 고르세요: 찾기 → 제품·소재 → 만들기 → 올리기·성과." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-home-menu>
        {MENU.map((g) => {
          const items = g.items.filter((it) => it.tabs.some((t) => allowed.has(t.id)));
          if (!items.length) return null;
          return (
            <div key={g.id} className="rounded-card border border-line bg-surface p-4 shadow-card">
              <p className="mb-2 text-[13px] font-semibold text-fg">{g.label}</p>
              <ul className="space-y-1.5">
                {items.map((it) => {
                  const first = it.tabs.find((t) => allowed.has(t.id))!;
                  const d = info(first.id);
                  const Icon = it.icon;
                  return (
                    <li key={it.id}>
                      <Link href={d?.href ?? it.href} className="group flex items-start gap-2 rounded-control px-1.5 py-1 hover:bg-muted">
                        <Icon className="mt-0.5 size-4 shrink-0 text-fg-subtle group-hover:text-brand" />
                        <span className="min-w-0">
                          <span className="block text-[13.5px] font-medium text-fg group-hover:text-brand">{it.title}</span>
                          <span className="block truncate text-[11.5px] text-fg-subtle">{it.tabs.length > 1 ? it.tabs.map((t) => t.label).join(" · ") : (d?.description ?? "")}</span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      <HomeOverview />
    </PageContainer>
  );
}
