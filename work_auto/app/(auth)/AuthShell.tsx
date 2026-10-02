import Link from "next/link";
import type { ReactNode } from "react";
import { Boxes } from "lucide-react";
import { AuthFooter } from "./AuthFooter";

/** 로그인 계열 화면 공통 틀 (사이드바 없이 가운데 카드) */
export function AuthShell({ title, description, children }: { title?: string; description?: ReactNode; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-subtle px-4 py-12">
      <div className="w-full max-w-[420px]">
        <Link href="/login" className="mb-8 flex flex-col items-center text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-fg text-white">
            <Boxes className="size-5" />
          </span>
          <span className="mt-4 text-xl font-bold tracking-tight text-fg">콘텐츠 자동화 센터</span>
        </Link>
        <div className="rounded-card border border-line bg-canvas p-6 shadow-card">
          {title && <h1 className="text-[17px] font-semibold text-fg">{title}</h1>}
          {description && <p className="mt-1 text-[13px] leading-relaxed text-fg-subtle">{description}</p>}
          <div className={title || description ? "mt-5" : undefined}>{children}</div>
        </div>
        <AuthFooter />
      </div>
    </main>
  );
}
