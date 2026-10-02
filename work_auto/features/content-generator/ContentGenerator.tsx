"use client";

import { useState } from "react";
import { History, ShieldCheck, Sparkles, Wand2 } from "lucide-react";
import { getGeneratorConfig } from "@/lib/generators/configs";
import type { GeneratorConfig } from "@/lib/generators/types";
import type { GeneratedContent } from "@/lib/types";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/SectionCard";
import { EmptyState, ErrorState, LoadingState, Notice } from "@/components/ui/States";
import { ResultPanel } from "@/components/shared/ResultPanel";
import { cn, formatRelative } from "@/lib/utils";
import { DynamicField, type FormValues } from "./DynamicField";

/**
 * ★ 범용 콘텐츠 생성기 — 생성형 기능 7개가 모두 이 컴포넌트를 쓴다.
 * 기능별 차이는 Generator Config(lib/generators/configs.ts)로만 표현한다.
 *
 * 레이아웃: [왼쪽] 입력 폼(고정) · [오른쪽] 결과 패널 · [아래] 이 기능의 최근 생성 이력
 */
export function ContentGenerator({ featureId, initialValues }: { featureId: string; initialValues?: FormValues }) {
  const config = getGeneratorConfig(featureId);
  const [values, setValues] = useState<FormValues>(() => defaultValues(config, initialValues));
  const [result, setResult] = useState<GeneratedContent | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const history = useAsync(() => api.contents.list({ featureId }), [featureId]);

  const missing = config.fields.filter((f) => f.required && !values[f.name]?.trim());
  const showHonesty = Boolean(config.experienceField);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const content = await api.contents.generate({ featureId, input: toInput(config, values) });
      setResult(content);
      history.setData((prev) => [content, ...(prev ?? [])]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "생성에 실패했습니다.");
    } finally {
      setGenerating(false);
    }
  }

  function updateContent(next: GeneratedContent) {
    setResult(next);
    history.setData((prev) => prev?.map((c) => (c.id === next.id ? next : c)) ?? null);
  }

  return (
    <div className="space-y-8">
      <div className="grid items-start gap-6 xl:grid-cols-[420px_1fr]">
        {/* 입력 */}
        <SectionCard
          title="입력"
          description="필수 항목(*)만 채워도 생성할 수 있습니다."
          className="xl:sticky xl:top-6"
          footer={
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-fg-subtle">
                {missing.length > 0 ? `필수 항목 ${missing.length}개 남음` : "생성할 준비가 되었습니다"}
              </span>
              <Button variant="primary" icon={Sparkles} loading={generating} disabled={missing.length > 0} onClick={generate}>
                {config.submitLabel}
              </Button>
            </div>
          }
        >
          <form
            className="grid grid-cols-2 gap-x-4 gap-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (missing.length === 0) generate();
            }}
          >
            {config.fields.map((field) => (
              <DynamicField
                key={field.name}
                field={field}
                value={values[field.name] ?? ""}
                onChange={(v) => setValues((prev) => ({ ...prev, [field.name]: v }))}
              />
            ))}
          </form>
          {showHonesty && (
            <Notice tone="neutral" icon={ShieldCheck} className="mt-5">
              실제 경험을 입력하지 않으면 &lsquo;직접 사용했다&rsquo;는 표현 없이 제품 정보 기반의 소개 글로 작성합니다.
            </Notice>
          )}
        </SectionCard>

        {/* 결과 */}
        <div className="min-w-0">
          {generating ? (
            <SectionCard>
              <LoadingState label="저장된 학습 데이터를 불러와 생성하는 중입니다…" className="py-24" />
            </SectionCard>
          ) : error ? (
            <SectionCard>
              <ErrorState message={error} onRetry={generate} />
            </SectionCard>
          ) : result ? (
            <ResultPanel content={result} outputs={config.outputs} headlineKey={config.headlineKey} onChange={updateContent} />
          ) : (
            <SectionCard>
              <EmptyState
                icon={Wand2}
                title="아직 생성한 결과가 없습니다"
                description={`왼쪽 입력을 채우고 '${config.submitLabel}'를 누르면 ${config.outputs.map((o) => o.label).join(", ")}이 만들어집니다.`}
                className="py-24"
              />
            </SectionCard>
          )}
        </div>
      </div>

      {/* 이 기능의 최근 생성 이력 */}
      <SectionCard title="최근 생성 이력" icon={History} description="이력을 누르면 결과를 다시 볼 수 있습니다." flush>
        {history.loading ? (
          <LoadingState variant="skeleton" rows={3} className="p-5" />
        ) : history.error ? (
          <ErrorState message={history.error} onRetry={history.reload} />
        ) : !history.data?.length ? (
          <EmptyState compact title="아직 이력이 없습니다" />
        ) : (
          <ul className="divide-y divide-line">
            {history.data.slice(0, 6).map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => setResult(c)}
                  className={cn(
                    "flex w-full items-center justify-between gap-4 px-5 py-3 text-left transition-colors hover:bg-subtle",
                    result?.id === c.id && "bg-brand-soft/50",
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-fg">{c.headline}</span>
                    <span className="mt-0.5 block text-xs text-fg-subtle">
                      {c.context.product?.name ?? "제품 없음"} · 프롬프트 v{c.promptVersion}
                      {c.isExemplar && " · ★ 좋은 결과"}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-fg-subtle">{formatRelative(c.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function defaultValues(config: GeneratorConfig, initial?: FormValues): FormValues {
  const values: FormValues = {};
  for (const f of config.fields) values[f.name] = initial?.[f.name] ?? f.defaultValue ?? "";
  return values;
}

/** 폼 문자열 값 → API 입력 (tags 는 배열로) */
function toInput(config: GeneratorConfig, values: FormValues): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const f of config.fields) {
    const v = (values[f.name] ?? "").trim();
    input[f.name] =
      f.type === "tags"
        ? v
            .split(/[,，\n]/)
            .map((s) => s.trim())
            .filter(Boolean)
        : v;
  }
  return input;
}
