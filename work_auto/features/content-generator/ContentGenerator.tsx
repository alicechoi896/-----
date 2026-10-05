"use client";

import { useState } from "react";
import { Check, History, Loader2, ShieldCheck, Sparkles, Wand2 } from "lucide-react";
import { getGeneratorConfig } from "@/lib/generators/configs";
import { GENERATION_MODES, PRECISE_STAGES, supportsPrecise, type GenerationMode, type PreciseStage } from "@/lib/generators/quality";
import type { GeneratorConfig } from "@/lib/generators/types";
import type { GeneratedContent } from "@/lib/types";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/SectionCard";
import { SegmentedControl } from "@/components/ui/Tabs";
import { EmptyState, ErrorState, LoadingState, Notice } from "@/components/ui/States";
import { ResultPanel } from "@/components/shared/ResultPanel";
import { UploadStatusBadge, useUploadStatus } from "@/components/shared/UploadStatusBadge";
import { cn, formatRelative } from "@/lib/utils";
import { DynamicField, type FormValues } from "./DynamicField";
import { PhotoField, type PhotoItem } from "./PhotoField";

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
  // 사진(브라우저에서만 처리, 서버에 올리지 않음). 결과 미리보기와 ZIP 다운로드에 쓴다
  const [photos, setPhotos] = useState<PhotoItem[]>([]);
  // 이 결과를 만들 때 쓴 사진 (생성 후 사진을 바꿔도 결과 미리보기는 그대로)
  const [resultPhotos, setResultPhotos] = useState<PhotoItem[]>([]);
  const history = useAsync(() => api.contents.list({ featureId }), [featureId]);
  const uploads = useUploadStatus((history.data ?? []).slice(0, 6).map((c) => c.id));

  // 생성 방식: 영상·클립(대본·제목·Hook)만 정밀 생성을 고를 수 있다 (docs/QUALITY_MODES.md)
  const canPrecise = supportsPrecise(config.outputs);
  const [mode, setMode] = useState<GenerationMode>("fast");
  const [stage, setStage] = useState<PreciseStage | null>(null);
  const missing = config.fields.filter((f) => f.required && !values[f.name]?.trim());
  const showHonesty = Boolean(config.experienceField);

  async function generate() {
    setGenerating(true);
    setError(null);
    setStage(null);
    try {
      const req = { featureId, input: toInput(config, values, photos) };
      const content = canPrecise && mode === "precise" ? await api.contents.generatePrecise(req, setStage) : await api.contents.generate(req);
      setResult(content);
      setResultPhotos(photos);
      history.setData((prev) => [content, ...(prev ?? [])]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "생성에 실패했습니다.");
    } finally {
      setGenerating(false);
      setStage(null);
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
            <div className="space-y-3">
              {canPrecise && (
                <div data-generation-mode>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px] font-medium text-fg">생성 방식</span>
                    <SegmentedControl size="sm" options={GENERATION_MODES.map((m) => ({ value: m.value, label: m.label }))} value={mode} onChange={setMode} />
                  </div>
                  <p className="mt-1 text-right text-xs text-fg-subtle">{GENERATION_MODES.find((m) => m.value === mode)?.hint}</p>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-fg-subtle">
                  {missing.length > 0 ? `필수 항목 ${missing.length}개 남음` : "생성할 준비가 되었습니다"}
                </span>
                <Button variant="primary" icon={Sparkles} loading={generating} disabled={missing.length > 0} onClick={generate}>
                  {canPrecise && mode === "precise" ? `정밀 ${config.submitLabel}` : config.submitLabel}
                </Button>
              </div>
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
            {config.fields.map((field) =>
              field.type === "images" ? (
                <PhotoField
                  key={field.name}
                  field={field}
                  photos={photos}
                  onChange={setPhotos}
                  baseName={values.mainKeyword || values.topic || "제품사진"}
                />
              ) : (
                <DynamicField
                  key={field.name}
                  field={field}
                  value={values[field.name] ?? ""}
                  onChange={(v) => setValues((prev) => ({ ...prev, [field.name]: v }))}
                />
              ),
            )}
          </form>
          {showHonesty && (
            <Notice tone="neutral" icon={ShieldCheck} className="mt-5">
              실제 경험을 입력하지 않으면 &lsquo;직접 사용했다&rsquo;는 표현 없이 제품 정보 기반의 소개 글로 작성합니다.
            </Notice>
          )}
        </SectionCard>

        {/* 결과 */}
        <div className="min-w-0">
          {generating && canPrecise && mode === "precise" ? (
            <SectionCard>
              <PreciseProgress stage={stage} />
            </SectionCard>
          ) : generating ? (
            <SectionCard>
              <LoadingState label="저장된 학습 데이터를 불러와 생성하는 중입니다…" className="py-24" />
            </SectionCard>
          ) : error ? (
            <SectionCard>
              <ErrorState message={error} onRetry={generate} />
            </SectionCard>
          ) : result ? (
            <ResultPanel
              content={result}
              outputs={config.outputs}
              headlineKey={config.headlineKey}
              onChange={updateContent}
              photos={result.id === history.data?.[0]?.id ? resultPhotos : []}
            />
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
      <SectionCard title="최근 생성 이력" icon={History} description="이력을 누르면 결과를 다시 볼 수 있습니다. 오래된 이력은 자동으로 정리됩니다." flush>
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
                  title={c.id === history.data?.[0]?.id ? undefined : "사진은 저장하지 않아 이전 결과에는 사진 미리보기가 없습니다"}
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
                  <span className="flex shrink-0 items-center gap-2 text-xs text-fg-subtle">
                    {uploads && <UploadStatusBadge state={uploads[c.id]} />}
                    {formatRelative(c.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

/** 정밀 생성 진행 (서버가 단계를 시작할 때마다 알려 준다) */
function PreciseProgress({ stage }: { stage: PreciseStage | null }) {
  const current = stage ? PRECISE_STAGES.findIndex((s) => s.stage === stage) : -1;
  return (
    <div className="mx-auto max-w-sm py-16" data-precise-progress>
      <p className="text-center text-[15px] font-semibold text-fg">정밀 생성 중입니다</p>
      <p className="mt-1 text-center text-xs text-fg-subtle">AI 를 4번 불러 단계별로 다듬습니다. 1분 정도 걸릴 수 있습니다.</p>
      <ol className="mt-6 space-y-2.5">
        {PRECISE_STAGES.map((s, i) => {
          const done = i < current;
          const now = i === current || (current < 0 && i === 0);
          return (
            <li key={s.stage} className={cn("flex items-center gap-3 rounded-control border px-3.5 py-2.5 text-[13.5px]", now ? "border-brand-line bg-brand-soft text-brand" : done ? "border-line text-fg-muted" : "border-line text-fg-subtle")}>
              <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold", done ? "bg-success text-white" : now ? "bg-brand text-white" : "bg-muted text-fg-subtle")}>
                {done ? <Check className="size-3.5" /> : now ? <Loader2 className="size-3.5 animate-spin" /> : i + 1}
              </span>
              {s.label}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function defaultValues(config: GeneratorConfig, initial?: FormValues): FormValues {
  const values: FormValues = {};
  for (const f of config.fields) values[f.name] = initial?.[f.name] ?? f.defaultValue ?? "";
  return values;
}

/** 폼 문자열 값 → API 입력 (tags 는 배열로, 사진은 설명 목록만) */
function toInput(config: GeneratorConfig, values: FormValues, photos: PhotoItem[]): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const f of config.fields) {
    if (f.type === "images") {
      input[f.name] = photos.map((p) => p.caption.trim());
      continue;
    }
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
