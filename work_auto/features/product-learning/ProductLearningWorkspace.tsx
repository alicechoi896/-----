"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, FileText, ImageUp, Library, ScanSearch, Upload, X } from "lucide-react";
import type { Product, ProductAnalysisDraft, ProductSourceInput } from "@/lib/types";
import { api } from "@/lib/api-client";
import { Button, LinkButton } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input, Textarea } from "@/components/ui/Input";
import { SaveButton } from "@/components/ui/SaveButton";
import { SectionCard } from "@/components/ui/SectionCard";
import { EmptyState, ErrorState, LoadingState, Notice } from "@/components/ui/States";
import { Tabs } from "@/components/ui/Tabs";
import { ProductAnalysisView } from "@/components/shared/ProductAnalysisView";
import { MAX_SLICES, batchSlices, sliceImageFile, type ImageSlice } from "@/lib/image-slicer";
import { cn } from "@/lib/utils";

type SourceTab = "image" | "text";

/** 상품 URL 입력은 v0.9.11 에서 뺐다 (쇼핑몰 대부분이 서버 접속을 막는다) */
const TABS = [
  { value: "image" as const, label: "이미지 업로드", icon: ImageUp },
  { value: "text" as const, label: "텍스트 직접 입력", icon: FileText },
];

/** 처리 파이프라인 단계 (Collector 와 Analyzer 분리를 화면에서도 보여준다) */
const PIPELINE = ["상품 입력", "Product Data Collector", "Raw Product Data", "AI Analyzer", "Structured Product Data", "Product Library"];

export function ProductLearningWorkspace() {
  const [tab, setTab] = useState<SourceTab>("image");
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [productName, setProductName] = useState("");

  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProductAnalysisDraft | null>(null);
  const [saved, setSaved] = useState<Product | null>(null);
  /** 진행 안내 (이미지 조각 읽기 단계별) */
  const [progress, setProgress] = useState<string | null>(null);
  /** 이미지에서 AI 가 읽은 원문 (확인용, 저장 시 원본 수집 데이터로 남는다) */
  const [extracted, setExtracted] = useState<string | null>(null);
  const [showExtracted, setShowExtracted] = useState(false);

  const stage = saved ? 6 : draft ? 5 : analyzing ? 3 : 0;

  function buildSource(): ProductSourceInput | null {
    if (tab === "image") return files.length ? { type: "image", fileNames: files.map((f) => f.name), productName } : null;
    return text.trim() ? { type: "text", text, productName } : null;
  }

  async function analyze() {
    const source = buildSource();
    if (!source) return;
    setAnalyzing(true);
    setError(null);
    setDraft(null);
    setSaved(null);
    setExtracted(null);
    setShowExtracted(false);
    try {
      if (source.type === "image") {
        // 1) 브라우저에서 이미지를 조각내고  2) 몇 번에 나눠 AI 가 읽게 한 뒤  3) 읽은 텍스트로 분석한다
        setProgress("이미지를 읽기 좋은 크기로 자르는 중…");
        const slices: ImageSlice[] = [];
        for (const file of files) slices.push(...(await sliceImageFile(file)));
        if (slices.length > MAX_SLICES) {
          throw new Error(`이미지가 너무 깁니다 (${slices.length}조각). 핵심 부분 위주로 ${MAX_SLICES}조각 이하가 되게 나눠 올려 주세요.`);
        }
        const batches = batchSlices(slices);
        const texts: string[] = [];
        for (let i = 0; i < batches.length; i++) {
          setProgress(`AI 가 상세페이지를 읽는 중… (${i + 1}/${batches.length}, 이미지 조각 ${slices.length}개)`);
          const { text } = await api.products.extractImages(
            batches[i].map(({ mediaType, data }) => ({ mediaType, data })),
            `${i + 1}/${batches.length} 묶음`,
          );
          texts.push(text);
        }
        const extractedText = texts.join("\n\n");
        setExtracted(extractedText);
        setProgress("읽은 내용으로 제품을 분석하는 중…");
        setDraft(await api.products.analyze({ ...source, extractedText }));
      } else {
        setProgress("AI 가 분석하는 중…");
        setDraft(await api.products.analyze(source));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석에 실패했습니다.");
    } finally {
      setAnalyzing(false);
      setProgress(null);
    }
  }

  const canAnalyze = Boolean(buildSource()) && !analyzing;

  return (
    <div className="space-y-6">
      <Pipeline stage={stage} />

      <SectionCard title="상세페이지 입력" description="쿠팡, 스마트스토어 등의 상품 정보를 분석해 제품 라이브러리에 저장합니다.">
        <Tabs items={TABS} value={tab} onChange={setTab} className="-mt-1 mb-5" />

        {tab === "image" && (
          <div className="space-y-3">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-card border border-dashed border-line-strong bg-subtle/60 px-6 py-10 text-center transition-colors hover:bg-subtle">
              <Upload className="size-5 text-fg-subtle" />
              <span className="mt-2 text-sm font-medium text-fg">상세페이지 이미지를 선택하세요</span>
              <span className="mt-1 text-xs text-fg-subtle">JPG, PNG, WEBP · 여러 장 선택 가능 · 세로로 긴 상세 이미지도 그대로 올리면 자동으로 잘라 읽습니다</span>
              <span className="mt-1 text-xs text-fg-subtle">이미지는 AI 가 읽는 데만 쓰고 서버에 저장하지 않습니다</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])])}
              />
            </label>
            {files.length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {files.map((f, i) => (
                  <li key={f.name + i} className="inline-flex items-center gap-1.5 rounded-md border border-line bg-canvas px-2 py-1 text-xs text-fg-muted">
                    <ImageUp className="size-3.5" />
                    {f.name}
                    <button type="button" aria-label={`${f.name} 제거`} onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>
                      <X className="size-3.5 text-fg-subtle hover:text-fg" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <FormField label="제품명" htmlFor="image-product-name" optional hint="비워두면 이미지에서 찾습니다" className="sm:w-80">
                <Input id="image-product-name" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="예: 클린웨이브 무선청소기 S9" />
              </FormField>
              <Button variant="primary" icon={ScanSearch} loading={analyzing} disabled={!canAnalyze} onClick={analyze}>
                이미지 분석하기
              </Button>
            </div>
          </div>
        )}

        {tab === "text" && (
          <div className="grid gap-4">
            <FormField label="제품명" htmlFor="product-name" optional>
              <Input id="product-name" placeholder="예: 데일리웨어 진공 텀블러 600ml" value={productName} onChange={(e) => setProductName(e.target.value)} />
            </FormField>
            <FormField label="상세페이지 텍스트" htmlFor="product-text" hint="'용량: 600ml'처럼 '항목: 값' 형태의 줄은 스펙으로 인식합니다.">
              <Textarea
                id="product-text"
                rows={8}
                placeholder={"상세페이지 내용을 붙여넣으세요.\n브랜드: 데일리웨어\n용량: 600ml\n이중 진공 단열로 보온 12시간…"}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </FormField>
            <div className="flex justify-end">
              <Button variant="primary" icon={ScanSearch} loading={analyzing} disabled={!canAnalyze} onClick={analyze}>
                텍스트 분석하기
              </Button>
            </div>
          </div>
        )}

        <Notice tone="neutral" className="mt-5">
          쿠팡·스마트스토어 등 쇼핑몰 상세페이지를 캡처해 이미지로 올리면 가장 정확합니다. 세로로 긴 캡처도 그대로 올리면 자동으로 나눠 읽습니다.
          텍스트로 복사할 수 있는 상세페이지는 &lsquo;텍스트 직접 입력&rsquo;에 붙여 넣어도 됩니다.
        </Notice>
      </SectionCard>

      {analyzing ? (
        <SectionCard>
          <LoadingState label={progress ?? "상세페이지를 수집하고 AI가 분석하는 중입니다…"} className="py-20" />
        </SectionCard>
      ) : error ? (
        <SectionCard>
          <ErrorState message={error} onRetry={analyze} />
        </SectionCard>
      ) : draft ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-brand-line bg-brand-soft/60 px-5 py-4">
            <div>
              <p className="font-semibold text-fg">분석이 완료되었습니다</p>
              <p className="mt-0.5 text-xs text-fg-muted">
                수집: {draft.raw.collectedBy} · 분석: {draft.meta.provider}/{draft.meta.model} · 프롬프트 {draft.meta.promptId} v{draft.meta.promptVersion}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {saved && (
                <LinkButton href={`/tools/product-library/${saved.id}`} size="md" iconRight={ArrowRight}>
                  저장된 제품 보기
                </LinkButton>
              )}
              <SaveButton
                icon={Library}
                label="제품 라이브러리에 저장"
                savedLabel="라이브러리에 저장됨"
                saved={Boolean(saved)}
                onSave={async () => setSaved(await api.products.save(draft))}
              />
            </div>
          </div>
          {extracted && (
            <div className="rounded-card border border-line bg-canvas px-5 py-3 shadow-card">
              <button type="button" className="text-[13px] font-medium text-fg-muted hover:text-fg" onClick={() => setShowExtracted((v) => !v)}>
                {showExtracted ? "▾" : "▸"} AI 가 이미지에서 읽은 내용 보기 ({extracted.length.toLocaleString("ko-KR")}자)
              </button>
              {showExtracted && (
                <pre className="mt-3 max-h-96 overflow-y-auto rounded-control bg-subtle p-3 text-xs leading-relaxed whitespace-pre-wrap text-fg-muted">
                  {extracted}
                </pre>
              )}
            </div>
          )}
          <ProductAnalysisView analysis={draft.analysis} />
        </div>
      ) : (
        <SectionCard>
          <EmptyState
            icon={ScanSearch}
            title="분석 결과가 여기에 표시됩니다"
            description={
              <>
                URL, 이미지, 텍스트 중 하나로 상세페이지를 넣고 분석하세요.{" "}
                <Link href="/tools/product-library" className="font-medium text-brand hover:underline">
                  저장된 제품 보기
                </Link>
              </>
            }
            className="py-16"
          />
        </SectionCard>
      )}
    </div>
  );
}

function Pipeline({ stage }: { stage: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-y-2 rounded-card border border-line bg-subtle/70 px-4 py-3 text-xs">
      {PIPELINE.map((step, i) => {
        const done = i < stage;
        const active = i === stage;
        return (
          <li key={step} className="flex items-center">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-medium",
                done ? "bg-canvas text-success ring-1 ring-success/20" : active ? "bg-canvas text-brand ring-1 ring-brand-line" : "text-fg-subtle",
              )}
            >
              {done && <Check className="size-3" />}
              {step}
            </span>
            {i < PIPELINE.length - 1 && <ArrowRight className="mx-1 size-3 text-fg-subtle/60" />}
          </li>
        );
      })}
    </ol>
  );
}
