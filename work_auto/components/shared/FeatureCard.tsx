import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { AccentColor, FeatureDef } from "@/lib/registry";
import { Tag } from "@/components/ui/Badge";
import { IconChip } from "@/components/ui/IconChip";
import { cardClass } from "@/components/ui/SectionCard";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { cn } from "@/lib/utils";

const PROVIDER_LABEL = { openai: "OpenAI", youtube: "YouTube Data API", naver: "NAVER API" } as const;

/**
 * 2차(채널 허브) 화면의 기능 카드. Registry 의 FeatureDef 하나를 그대로 받는다.
 * status 가 planned 면 클릭할 수 없는 상태로 보여준다.
 */
export function FeatureCard({ feature, accent }: { feature: FeatureDef; accent: AccentColor }) {
  const disabled = feature.status === "planned";
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <IconChip icon={feature.icon} accent={accent} />
          <span className="tabular text-xs font-semibold text-fg-subtle">{String(feature.order).padStart(2, "0")}</span>
        </div>
        <StatusBadge status={feature.status} />
      </div>
      <h3 className="mt-4 text-[15.5px] font-semibold text-fg">{feature.title}</h3>
      <p className="mt-1.5 flex-1 text-[13.5px] leading-relaxed text-fg-subtle">{feature.description}</p>

      <div className="mt-5 flex items-end justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {feature.requiredProviders.map((p) => (
            <Tag key={p}>{PROVIDER_LABEL[p]}</Tag>
          ))}
          {feature.tags
            ?.filter((t) => !Object.values<string>(PROVIDER_LABEL).includes(t))
            .map((t) => (
              <Tag key={t}>{t}</Tag>
            ))}
        </div>
        {!disabled && (
          <ArrowRight className="size-4 shrink-0 text-fg-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
        )}
      </div>
    </>
  );

  const className = cn(cardClass, "group flex h-full flex-col p-5 transition-all");
  if (disabled) {
    return (
      <div className={cn(className, "cursor-not-allowed opacity-60")} aria-disabled>
        {body}
      </div>
    );
  }
  return (
    <Link href={feature.href} className={cn(className, "hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card-hover")}>
      {body}
    </Link>
  );
}
