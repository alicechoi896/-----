import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** 카드 외곽 스타일 (모든 카드형 컴포넌트가 공유한다) */
export const cardClass = "rounded-card border border-line bg-canvas shadow-card";

/**
 * 제목이 있는 콘텐츠 블록. 화면의 대부분 영역은 SectionCard 로 구성한다.
 */
export function SectionCard({
  title,
  description,
  icon: Icon,
  actions,
  children,
  footer,
  className,
  bodyClassName,
  flush,
}: {
  title?: ReactNode;
  description?: ReactNode;
  icon?: LucideIcon;
  /** 헤더 오른쪽 버튼 영역 */
  actions?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** 본문 패딩 제거 (표를 꽉 채울 때) */
  flush?: boolean;
}) {
  const hasHeader = title || actions;
  return (
    <section className={cn(cardClass, "flex flex-col", className)}>
      {hasHeader && (
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="flex min-w-0 items-start gap-2.5">
            {Icon && <Icon className="mt-0.5 size-4 shrink-0 text-fg-subtle" />}
            <div className="min-w-0">
              {title && <h2 className="text-[15px] font-semibold text-fg">{title}</h2>}
              {description && <p className="mt-0.5 text-[13px] leading-relaxed text-fg-subtle">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn(!flush && "p-5", "flex-1", bodyClassName)}>{children}</div>
      {footer && <footer className="border-t border-line bg-subtle/60 px-5 py-3">{footer}</footer>}
    </section>
  );
}

/** 라벨-값 한 쌍 (상세 화면 정보 나열용) */
export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_1fr] gap-3 py-2 text-sm">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className="min-w-0 break-words text-fg">{children}</dd>
    </div>
  );
}

/** 불릿 목록 (분석 결과, 장점 등) */
export function BulletList({ items, empty = "-" }: { items: string[]; empty?: string }) {
  if (items.length === 0) return <p className="text-sm text-fg-subtle">{empty}</p>;
  return (
    <ul className="space-y-1.5">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2 text-sm leading-relaxed text-fg">
          <span className="mt-[9px] size-1 shrink-0 rounded-full bg-fg-subtle" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}
