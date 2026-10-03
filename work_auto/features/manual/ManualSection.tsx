import { Flag, Lightbulb } from "lucide-react";
import shotsJson from "@/lib/manual/shots.json";
import type { ManualChapter, ManualSection as Section, ManualShot } from "@/lib/manual/types";
import { cn } from "@/lib/utils";

const SHOTS = shotsJson as Record<string, ManualShot>;

/** **굵게** → 빨간 강조 */
export function RichText({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <strong key={i} className="font-semibold text-danger">
            {p}
          </strong>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

export function StepBadge({ n, className }: { n: number; className?: string }) {
  return (
    <span
      className={cn(
        "tabular inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-danger text-[14px] font-bold text-white shadow-[0_1px_2px_rgb(0_0_0/0.2)]",
        className,
      )}
    >
      {n}
    </span>
  );
}

/** 스크린샷 + 번호 강조 상자 (좌표는 원본 화면 px → % 로 바꿔 크기와 상관없이 맞는다) */
export function ManualShotImage({ id, alt, print }: { id: string; alt: string; print?: boolean }) {
  const shot = SHOTS[id];
  if (!shot) {
    return <div className="rounded-card border border-dashed border-line-strong bg-subtle px-5 py-10 text-center text-sm text-fg-subtle">화면 준비 중 ({id})</div>;
  }
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  return (
    <div
      data-shot={id}
      className="relative mx-auto"
      style={print ? { maxWidth: `${Math.min(271, (shot.w / shot.h) * 122)}mm`, width: "100%" } : { maxWidth: shot.w }}
    >
      {/* 화면에서는 눌러서 원본 크기로 본다 */}
      <a
        href={print ? undefined : shot.file}
        target="_blank"
        rel="noreferrer"
        title={print ? undefined : "누르면 원본 크기로 봅니다"}
        className={cn("block overflow-hidden rounded-card border border-line-strong bg-canvas", print ? "" : "shadow-card cursor-zoom-in")}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- 정적 스크린샷, 강조 상자를 같은 좌표계로 겹친다 */}
        <img src={shot.file} alt={alt} width={shot.w} height={shot.h} className="block h-auto w-full" loading={print ? "eager" : "lazy"} />
      </a>
      {shot.boxes.map((b) => (
        <div
          key={b.n}
          aria-hidden
          className="pointer-events-none absolute rounded-lg border-2 border-danger sm:border-[2.5px]"
          style={{ left: pct(b.x, shot.w), top: pct(b.y, shot.h), width: pct(b.w, shot.w), height: pct(b.h, shot.h) }}
        >
          <StepBadge n={b.n} className={cn("absolute ring-2 ring-white", print ? "-top-3.5 -right-3.5 size-7" : "-top-2.5 -right-2.5 size-5 text-[11px] sm:-top-3.5 sm:-right-3.5 sm:size-7 sm:text-[14px]")} />
        </div>
      ))}
    </div>
  );
}

/** 매뉴얼 한 절 — 웹 화면과 PDF 가 같이 쓴다 */
export function ManualSectionBlock({ chapter, section, index, print }: { chapter: ManualChapter; section: Section; index: number; print?: boolean }) {
  const cols = section.steps.length >= 3 ? "md:grid-cols-3" : section.steps.length === 2 ? "md:grid-cols-2" : "";
  return (
    <section id={`${chapter.id}-${section.id}`} className={cn("scroll-mt-24", print && "manual-page")}>
      <div className="flex items-center gap-3">
        <span className="tabular inline-flex h-10 min-w-12 items-center justify-center rounded-md bg-fg-muted px-2 text-[20px] font-bold text-white">
          {chapter.no}
          {chapter.sections.length > 1 && <span className="ml-0.5 text-[14px] font-semibold opacity-80">-{index + 1}</span>}
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-fg-subtle">{chapter.title}</p>
          <h3 className={cn("font-bold tracking-tight text-fg", print ? "text-[22px]" : "text-xl md:text-2xl")}>{section.title}</h3>
        </div>
      </div>
      {section.lead && <p className="mt-2.5 text-[14.5px] leading-relaxed text-fg-muted">{section.lead}</p>}

      <ol className={cn("mt-4 grid gap-x-6 gap-y-3", print ? (section.steps.length >= 3 ? "grid-cols-3" : section.steps.length === 2 ? "grid-cols-2" : "") : cols)}>
        {section.steps.map((s) => (
          <li key={s.n} className="flex items-start gap-2.5 text-[14.5px] leading-relaxed text-fg">
            <StepBadge n={s.n} className="mt-0.5" />
            <span>
              <RichText text={s.text} />
            </span>
          </li>
        ))}
      </ol>

      {section.shot && (
        <div className="mt-5">
          <ManualShotImage id={section.shot} alt={`${section.title} 화면`} print={print} />
        </div>
      )}

      {section.tips?.length ? (
        <ul className="mt-4 space-y-1.5 rounded-control border border-line bg-subtle px-4 py-3 text-[13.5px] leading-relaxed text-fg-muted">
          {section.tips.map((t, i) => (
            <li key={i} className="flex gap-2">
              <Lightbulb className="mt-0.5 size-4 shrink-0 text-warning" />
              <span>
                <RichText text={t} />
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {section.next && (
        <p className="mt-3 flex items-start gap-2 rounded-control bg-danger-soft px-4 py-2.5 text-[14px] leading-relaxed text-fg">
          <Flag className="mt-0.5 size-4 shrink-0 fill-danger text-danger" />
          <span>
            <strong className="mr-1.5 font-bold text-danger">다음 단계:</strong>
            <RichText text={section.next} />
          </span>
        </p>
      )}
    </section>
  );
}

export function ManualFaqBlock({ chapter, print }: { chapter: ManualChapter; print?: boolean }) {
  return (
    <section id={`${chapter.id}-list`} className={cn("scroll-mt-24", print && "manual-page")}>
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 min-w-12 items-center justify-center rounded-md bg-fg-muted px-2 text-[20px] font-bold text-white">{chapter.no}</span>
        <h3 className={cn("font-bold tracking-tight text-fg", print ? "text-[22px]" : "text-xl md:text-2xl")}>{chapter.title}</h3>
      </div>
      <dl className={cn("mt-5 grid gap-3", print ? "grid-cols-2" : "md:grid-cols-2")}>
        {chapter.faq?.map((f, i) => (
          <div key={i} className="rounded-card border border-line bg-canvas px-4 py-3.5">
            <dt className="flex items-start gap-2 text-[14.5px] font-semibold text-fg">
              <span className="font-bold text-danger">Q.</span>
              {f.q}
            </dt>
            <dd className="mt-1.5 pl-6 text-[13.5px] leading-relaxed text-fg-muted">
              <RichText text={f.a} />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
