import Link from "next/link";
import { BookOpen, Download, ShieldCheck } from "lucide-react";
import { MANUAL_CHAPTERS, MANUAL_INTRO, MANUAL_PDF, MANUAL_PDF_NAME, MANUAL_UPDATED } from "@/lib/manual/content";
import { cardClass } from "@/components/ui/SectionCard";
import { cn } from "@/lib/utils";
import { ManualFaqBlock, ManualSectionBlock } from "./ManualSection";

/** 사이트 안 사용 매뉴얼: 목차 + 장별 내용 + PDF 다운로드. 관리자 전용 장은 관리자에게만 보인다 */
export function ManualView({ isAdmin }: { isAdmin: boolean }) {
  const chapters = MANUAL_CHAPTERS.filter((c) => isAdmin || !c.adminOnly);
  return (
    <div className="space-y-8">
      <div id="manual-top" className={cn(cardClass, "scroll-mt-20 flex flex-wrap items-center justify-between gap-4 px-6 py-5")}>
        <div className="min-w-0 max-w-3xl">
          <h2 className="text-2xl font-extrabold tracking-tight md:text-[28px]">
            <span className="text-danger">자동화 지니</span> 사용 매뉴얼
          </h2>
          <p className="mt-2 text-[14.5px] leading-relaxed text-fg-muted">{MANUAL_INTRO}</p>
          <p className="mt-1.5 text-xs text-fg-subtle">마지막 업데이트 {MANUAL_UPDATED.replaceAll("-", ".")}</p>
        </div>
        <a
          href={MANUAL_PDF}
          download={MANUAL_PDF_NAME}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-control bg-brand px-4 text-sm font-semibold text-white shadow-card hover:bg-brand-hover"
        >
          <Download className="size-4" />
          PDF 다운로드
        </a>
      </div>

      <nav aria-label="매뉴얼 목차" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {chapters.map((c) => (
          <a key={c.id} href={`#${c.id}`} className={cn(cardClass, "group flex items-start gap-3 px-4 py-3.5 transition-colors hover:border-brand-line")}>
            <span className="tabular inline-flex h-8 min-w-10 items-center justify-center rounded-md bg-fg-muted px-1.5 text-[15px] font-bold text-white">{c.no}</span>
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-[14.5px] font-semibold text-fg group-hover:text-brand">
                {c.title}
                {c.adminOnly && <ShieldCheck className="size-3.5 text-fg-subtle" aria-label="관리자 전용" />}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-fg-subtle">{c.summary}</span>
            </span>
          </a>
        ))}
      </nav>

      {chapters.map((c) => (
        <article key={c.id} id={c.id} className={cn(cardClass, "scroll-mt-20 px-5 py-6 md:px-8 md:py-8")}>
          <header className="mb-6 flex items-center gap-2 border-b border-line pb-4">
            <BookOpen className="size-5 text-danger" />
            <h2 className="text-lg font-bold text-fg">
              {c.no}. {c.title}
            </h2>
            <span className="text-[13px] text-fg-subtle">· {c.summary}</span>
          </header>
          <div className="space-y-14">
            {c.sections.map((s, i) => (
              <ManualSectionBlock key={s.id} chapter={c} section={s} index={i} />
            ))}
            {c.faq && <ManualFaqBlock chapter={c} />}
          </div>
          <p className="mt-8 text-right text-xs">
            <Link href="#manual-top" className="text-fg-subtle hover:text-brand">
              ↑ 목차로
            </Link>
          </p>
        </article>
      ))}
    </div>
  );
}
