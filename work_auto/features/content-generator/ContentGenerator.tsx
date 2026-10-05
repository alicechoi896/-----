"use client";

import { useEffect, useRef, useState } from "react";
import { History, ShieldCheck, Sparkles, Wand2 } from "lucide-react";
import { getGeneratorConfig } from "@/lib/generators/configs";
import { supportsPrecise } from "@/lib/generators/quality";
import type { GeneratorConfig } from "@/lib/generators/types";
import type { GeneratedContent } from "@/lib/types";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/SectionCard";
import { EmptyState, ErrorState, LoadingState, Notice } from "@/components/ui/States";
import { ResultPanel } from "@/components/shared/ResultPanel";
import { UploadStatusBadge, useUploadStatus } from "@/components/shared/UploadStatusBadge";
import { cn, formatRelative } from "@/lib/utils";
import { DynamicField, type FormValues } from "./DynamicField";
import { PhotoField, type PhotoItem } from "./PhotoField";
import { TwoStageWorkspace } from "./TwoStageWorkspace";

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
  // 제품 사진 자동 불러오기 (사진 칸이 있는 기능 + 제품 선택): 제품을 바꿀 때만
  const photoField = config.fields.find((f) => f.type === "images");
  const pickedProductId = config.productField ? (values[config.productField] ?? "") : "";
  const [incomingPhotos, setIncomingPhotos] = useState<{ key: string; files: File[] } | null>(null);
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  useEffect(() => {
    if (!photoField || !pickedProductId) return;
    let alive = true;
    void (async () => {
      try {
        const d = await api.products.get(pickedProductId);
        const n = Math.min(5, d.source?.raw.imageUrls?.length ?? 0);
        if (!n) return;
        setPhotoNote(`제품 사진 ${n}장을 불러오는 중…`);
        const files: File[] = [];
        for (let i = 0; i < n; i++) {
          const res = await fetch(`/api/products/${pickedProductId}/images/${i}`, { cache: "no-store" }).catch(() => null);
          if (!res?.ok) continue;
          const blob = await res.blob();
          files.push(new File([blob], `product-photo-${i + 1}.${(blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg")}`, { type: blob.type }));
        }
        if (!alive) return;
        setPhotoNote(files.length ? `제품 라이브러리의 제품 사진 ${files.length}장을 불러왔습니다.` : null);
        if (files.length) setIncomingPhotos({ key: `${pickedProductId}:${Date.now()}`, files });
      } catch {
        if (alive) setPhotoNote(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [photoField, pickedProductId]);
  // 이 결과를 만들 때 쓴 사진 (생성 후 사진을 바꿔도 결과 미리보기는 그대로)
  const [resultPhotos, setResultPhotos] = useState<PhotoItem[]>([]);
  const history = useAsync(() => api.contents.list({ featureId }), [featureId]);
  const uploads = useUploadStatus((history.data ?? []).slice(0, 6).map((c) => c.id));

  // 영상·클립(대본·제목·Hook)은 2단계 생성: ① 제목·Hook·CTA 후보 → ② 고른 제목마다 대본 (docs/TWO_STAGE_CONTENT_GENERATION.md)
  const twoStage = supportsPrecise(config.outputs);
  const [groups, setGroups] = useState<GeneratedContent[]>([]);
  const busyRef = useRef(false);
  const missing = config.fields.filter((f) => f.required && !values[f.name]?.trim());
  const showHonesty = Boolean(config.experienceField);

  async function generate() {
    // 클릭 즉시 잠금: 버튼 1번 = 생성 요청 1번 (Keyword Intelligence 플랫폼 호출도 1번)
    if (busyRef.current) return;
    busyRef.current = true;
    setGenerating(true);
    setError(null);
    try {
      const req = { featureId, input: toInput(config, values, photos), clientRequestId: newRequestId() };
      const content = twoStage ? await api.contents.stage1(req) : await api.contents.generate(req);
      setResult(content);
      setGroups([]);
      setResultPhotos(photos);
      history.setData((prev) => [content, ...(prev ?? [])]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "생성에 실패했습니다.");
    } finally {
      busyRef.current = false;
      setGenerating(false);
    }
  }

  /** 이력에서 열기: 1단계 결과면 그 결과로 만든 2단계(제목별 대본)도 함께 */
  function openHistory(c: GeneratedContent) {
    setResult(c);
    setGroups(c.context.workflow?.stage === 1 ? (history.data ?? []).filter((g) => g.context.workflow?.stage === 2 && g.context.workflow.stage1Id === c.id) : []);
  }
  // 2단계 결과는 1단계 이력 아래에 묶어 보여 준다 (이력 목록에는 1단계·일반 결과만)
  const historyRows = (history.data ?? []).filter((c) => c.context.workflow?.stage !== 2);
  const stage2Count = (id: string) => (history.data ?? []).filter((g) => g.context.workflow?.stage === 2 && g.context.workflow.stage1Id === id).length;

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
              {twoStage && <p className="text-xs text-fg-subtle" data-two-stage-hint>1단계에서 제목·Hook·CTA 후보를 만들고, 고른 제목으로 2단계에서 대본·키워드·태그·설명을 만듭니다.</p>}
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-fg-subtle">
                  {missing.length > 0 ? `필수 항목 ${missing.length}개 남음` : "생성할 준비가 되었습니다"}
                </span>
                <Button variant="primary" icon={Sparkles} loading={generating} disabled={missing.length > 0} onClick={generate}>
                  {twoStage ? "1단계 · 제목·Hook·CTA 만들기" : config.submitLabel}
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
                  incoming={incomingPhotos}
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
          {photoNote && <p className="mt-3 text-xs text-fg-subtle" data-photo-note>{photoNote} 필요 없는 사진은 빼고, 직접 올린 사진과 함께 쓸 수 있습니다.</p>}
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
              <LoadingState label={twoStage ? "실제 영상·글에서 키워드를 모으고 제목·Hook·CTA 후보를 만드는 중입니다…" : "저장된 학습 데이터를 불러와 생성하는 중입니다…"} className="py-24" />
            </SectionCard>
          ) : error ? (
            <SectionCard>
              <ErrorState message={error} onRetry={generate} />
            </SectionCard>
          ) : result && result.context.workflow?.stage === 1 ? (
            <TwoStageWorkspace
              key={result.id}
              stage1={result}
              groups={groups}
              outputs={config.outputs}
              onStage1Change={updateContent}
              onGroupsChange={(next) => {
                setGroups(next);
                history.setData((prev) => {
                  const known = new Set((prev ?? []).map((c) => c.id));
                  const added = next.filter((g) => !known.has(g.id));
                  return [...added, ...(prev ?? []).map((c) => next.find((g) => g.id === c.id) ?? c)];
                });
              }}
            />
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
                description={
                  twoStage
                    ? "왼쪽 입력을 채우고 1단계를 누르면 제목·Hook·CTA 후보가 만들어집니다. 마음에 드는 것을 고르면 제목마다 대본·키워드·태그·설명을 만듭니다."
                    : `왼쪽 입력을 채우고 '${config.submitLabel}'를 누르면 ${config.outputs.map((o) => o.label).join(", ")}이 만들어집니다.`
                }
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
        ) : !historyRows.length ? (
          <EmptyState compact title="아직 이력이 없습니다" />
        ) : (
          <ul className="divide-y divide-line">
            {historyRows.slice(0, 6).map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => openHistory(c)}
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
                      {c.context.workflow?.stage === 1 && ` · 1단계 후보 · 대본 ${stage2Count(c.id)}개 제목`}
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

function newRequestId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
