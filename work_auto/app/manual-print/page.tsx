import { redirect } from "next/navigation";
import { connection } from "next/server";
import { ManualFaqBlock, ManualSectionBlock } from "@/features/manual/ManualSection";
import { MANUAL_CHAPTERS, MANUAL_INTRO, MANUAL_TITLE, MANUAL_UPDATED } from "@/lib/manual/content";
import { getSession } from "@/lib/server/auth";

export const metadata = { title: MANUAL_TITLE };

/** A4 가로, 절마다 한 쪽. scripts/manual/pdf.mjs 가 이 화면을 PDF 로 저장한다 */
const PRINT_CSS = `
@page { size: A4 landscape; margin: 9mm 12mm 12mm; }
html, body { background: #fff !important; }
.manual-print { width: 271mm; margin: 0 auto; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.manual-page { break-after: page; break-inside: avoid; padding-top: 2mm; }
.manual-print > div:last-child .manual-page:last-child { break-after: auto; }
`;

/** PDF 용 매뉴얼 (사이드바 없음). 로그인한 사용자만 */
export default async function ManualPrintPage() {
  await connection();
  if (!(await getSession())) redirect("/login");
  return (
    <div className="manual-print text-fg">
      <style>{PRINT_CSS}</style>

      <section className="manual-page flex min-h-[180mm] flex-col justify-center">
        <p className="text-sm font-semibold tracking-wide text-fg-subtle">USER MANUAL</p>
        <h1 className="mt-2 text-[44px] leading-tight font-extrabold tracking-tight">
          <span className="text-danger">자동화 지니</span> 사용 매뉴얼
        </h1>
        <p className="mt-4 max-w-[220mm] text-[16px] leading-relaxed text-fg-muted">{MANUAL_INTRO}</p>
        <ol className="mt-10 grid grid-cols-2 gap-x-10 gap-y-2.5">
          {MANUAL_CHAPTERS.map((c) => (
            <li key={c.id} className="flex items-baseline gap-3 border-b border-line pb-2">
              <span className="tabular inline-flex h-7 min-w-9 items-center justify-center rounded bg-fg-muted px-1.5 text-[13px] font-bold text-white">{c.no}</span>
              <span className="text-[15px] font-semibold">{c.title}</span>
              <span className="truncate text-[12.5px] text-fg-subtle">{c.summary}</span>
            </li>
          ))}
        </ol>
        <p className="mt-10 text-xs text-fg-subtle">마지막 업데이트 {MANUAL_UPDATED.replaceAll("-", ".")}</p>
      </section>

      {MANUAL_CHAPTERS.map((c) => (
        <div key={c.id}>
          {c.sections.map((s, i) => (
            <ManualSectionBlock key={s.id} chapter={c} section={s} index={i} print />
          ))}
          {c.faq && <ManualFaqBlock chapter={c} print />}
        </div>
      ))}
    </div>
  );
}
