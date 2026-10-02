import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import type { FeatureStatus } from "@/lib/types";
import type { AccentColor } from "@/lib/registry/types";
import type { Crumb } from "@/lib/registry";
import { IconChip } from "@/components/ui/IconChip";
import { StatusBadge } from "@/components/ui/StatusBadge";

/**
 * 모든 페이지 최상단 헤더. 페이지마다 제목 스타일을 새로 만들지 않는다.
 * 기능 페이지는 <FeaturePageHeader featureId="..."/> 를 쓰면 Registry 값이 자동으로 채워진다.
 */
export function PageHeader({
  title,
  description,
  crumbs,
  icon,
  accent,
  status,
  actions,
}: {
  title: string;
  description?: ReactNode;
  crumbs?: Crumb[];
  icon?: LucideIcon;
  accent?: AccentColor;
  status?: FeatureStatus;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-8">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="breadcrumb" className="mb-3 flex items-center gap-1 text-[13px] text-fg-subtle">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="size-3.5" />}
              {c.href ? (
                <Link href={c.href} className="hover:text-fg">
                  {c.label}
                </Link>
              ) : (
                <span className="text-fg-muted">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3.5">
          {icon && <IconChip icon={icon} accent={accent} size="lg" />}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] leading-tight font-bold tracking-tight text-fg">{title}</h1>
              {status && <StatusBadge status={status} />}
            </div>
            {description && <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-fg-subtle">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
