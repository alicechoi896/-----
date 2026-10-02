import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, Boxes } from "lucide-react";
import { LEGAL_INFO } from "@/lib/legal";

export interface LegalSection {
  title: string;
  body: ReactNode;
}

/** 약관류 문서 공통 틀 (로그인 없이 볼 수 있는 단독 화면) */
export function LegalDocument({ title, sections }: { title: string; sections: LegalSection[] }) {
  return (
    <main className="min-h-screen bg-subtle px-4 py-10 sm:py-14">
      <article className="mx-auto max-w-3xl rounded-card border border-line bg-canvas px-6 py-8 shadow-card sm:px-10 sm:py-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-fg text-white">
              <Boxes className="size-4" />
            </span>
            <span className="text-sm font-semibold text-fg">{LEGAL_INFO.serviceName}</span>
          </Link>
          <Link href="/login" className="inline-flex items-center gap-1 text-[13px] text-fg-subtle hover:text-fg">
            <ArrowLeft className="size-3.5" />
            돌아가기
          </Link>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-fg">{title}</h1>
        <p className="mt-2 text-[13px] text-fg-subtle">
          버전 {LEGAL_INFO.version} · 시행일 {LEGAL_INFO.effectiveDate}
        </p>
        <div className="mt-8 space-y-8">
          {sections.map((s, i) => (
            <section key={s.title}>
              <h2 className="text-[15px] font-semibold text-fg">
                제{i + 1}조 ({s.title})
              </h2>
              <div className="mt-2 space-y-2 text-sm leading-7 text-fg-muted [&_li]:ml-5 [&_li]:list-disc [&_table]:w-full [&_td]:border [&_td]:border-line [&_td]:px-3 [&_td]:py-2 [&_th]:border [&_th]:border-line [&_th]:bg-subtle [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-medium">
                {s.body}
              </div>
            </section>
          ))}
        </div>
        <p className="mt-10 flex gap-3 border-t border-line pt-6 text-xs text-fg-subtle">
          <Link href="/terms" className="hover:text-fg">
            이용약관
          </Link>
          <Link href="/privacy" className="font-medium hover:text-fg">
            개인정보처리방침
          </Link>
        </p>
      </article>
    </main>
  );
}
