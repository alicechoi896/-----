import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ChannelDef } from "@/lib/registry";
import { cardClass } from "@/components/ui/SectionCard";
import { IconChip } from "@/components/ui/IconChip";
import { cn } from "@/lib/utils";

/** 1차(메인) 화면의 채널 카드. 카드 전체가 링크다 */
export function ChannelCard({ channel, featureCount }: { channel: ChannelDef; featureCount: number }) {
  return (
    <Link
      href={channel.href}
      className={cn(
        cardClass,
        "group flex h-full flex-col p-6 transition-all hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card-hover",
      )}
    >
      <div className="flex items-start justify-between">
        <IconChip icon={channel.icon} accent={channel.accent} size="lg" />
        <span className="tabular rounded-full bg-subtle px-2 py-0.5 text-xs text-fg-subtle ring-1 ring-line">
          기능 {featureCount}개
        </span>
      </div>
      <h2 className="mt-5 text-[17px] font-semibold text-fg">{channel.name}</h2>
      <p className="mt-1.5 flex-1 text-sm leading-relaxed text-fg-subtle">{channel.description}</p>
      <span className="mt-6 inline-flex items-center gap-1 text-[13px] font-medium text-fg-muted group-hover:text-brand">
        바로가기
        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}
