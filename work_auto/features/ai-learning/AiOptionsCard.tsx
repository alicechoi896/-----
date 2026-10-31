"use client";

import { useEffect, useState } from "react";
import { Brain } from "lucide-react";
import { cn } from "@/lib/utils";

interface Opts {
  psychology: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

async function call<T>(init?: RequestInit): Promise<T> {
  const res = await fetch("/api/ai-options", { ...init, headers: { "Content-Type": "application/json" }, cache: "no-store" });
  const body = (await res.json().catch(() => null)) as { ok: boolean; data?: T; error?: { message: string } } | null;
  if (!body?.ok) throw new Error(body?.error?.message ?? `서버 오류 (HTTP ${res.status})`);
  return body.data as T;
}

/** v0.9.118 AI 생성 공통 옵션: 마케팅 심리 원칙 적용 (모든 원고 생성·새벽 자동 제작에 영향) */
export function AiOptionsCard() {
  const [o, setO] = useState<Opts | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    call<Opts>()
      .then((x) => alive && setO(x))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, []);
  async function toggle(v: boolean) {
    setBusy(true);
    setError(null);
    try {
      setO(await call<Opts>({ method: "PATCH", body: JSON.stringify({ psychology: v }) }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className={cn("rounded-card border px-5 py-4", o?.psychology ? "border-brand/40 bg-brand-soft/30" : "border-line bg-canvas")} data-ai-options>
      <div className="flex flex-wrap items-center gap-3">
        <Brain className="size-4 text-fg-muted" />
        <p className="text-[14px] font-semibold text-fg">마케팅 심리 원칙 적용</p>
        <label className="ml-auto flex items-center gap-2 text-[13px] font-medium">
          <input type="checkbox" checked={Boolean(o?.psychology)} disabled={!o || busy} onChange={(e) => void toggle(e.target.checked)} className="size-4 accent-[var(--color-brand)]" data-psychology-toggle />
          {o?.psychology ? "켜짐" : "꺼짐"}
        </label>
      </div>
      <p className="mt-1 text-[12.5px] leading-relaxed text-fg-subtle">
        켜면 모든 원고 생성(YouTube·NAVER 클립·블로그·새벽 제품 영상 자동 제작)에서 AI 가 원고마다 손실 회피·호기심·앵커링·사회적 증거·후회 회피 같은 심리 원칙 2~3개를 골라 Hook·본문·CTA·제목에 의도적으로 씁니다. 대본 포맷·말끝 규칙이 항상 우선이고, 제품 정보에 없는 숫자·가짜 품절·가짜 마감은 쓰지 않습니다. 같은 제품으로 켠 것과 끈 것을 만들어 비교해 보세요 (결과의 메모에 [마케팅 심리 원칙 적용]이 남습니다).
      </p>
      {o?.updatedAt && <p className="mt-1 text-[11.5px] text-fg-subtle">마지막 변경 {new Date(o.updatedAt).toLocaleString("ko-KR")} · {o.updatedBy}</p>}
      {error && <p className="mt-1 text-[12px] text-danger">{error}</p>}
    </section>
  );
}
