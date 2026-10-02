"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Check, FileText, ImageUp, Library, Link2, ScanSearch, Upload, X } from "lucide-react";
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
import { cn } from "@/lib/utils";

type SourceTab = "url" | "image" | "text";

const TABS = [
  { value: "url" as const, label: "URL 입력", icon: Link2 },
  { value: "image" as const, label: "이미지 업로드", icon: ImageUp },
  { value: "text" as const, label: "텍스트 직접 입력", icon: FileText },
];

/** 처리 파이프라인 단계 (Collector 와 Analyzer 분리를 화면에서도 보여준다) */
const PIPELINE = ["상품 입력", "Product Data Collector", "Raw Product Data", "AI Analyzer", "Structured Product Data", "Product Library"];

export function ProductLearningWorkspace() {
  const [tab, setTab] = useState<SourceTab>("url");
  const [url, setUrl] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [text, setText] = useState("");
  const [productName, setProductName] = useState("");

  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ProductAnalysisDraft | null>(null);
  const [saved, setSaved] = useState<Product | null>(null);

  const stage = saved ? 6 : draft ? 5 : analyzing ? 3 : 0;

  function buildSource(): ProductSourceInput | null {
    if (tab === "url") return url.trim() ? { type: "url", url: url.trim() } : null;
    if (tab === "image") return files.length ? { type: "image", fileNames: files.map((f) => f.name) } : null;
    return text.trim() ? { type: "text", text, productName } : null;
  }

  async function analyze() {
    const source = buildSource();
    if (!source) return;
    setAnalyzing(true);
    setError(null);
    setDraft(null);
    setSaved(null);
    try {
      setDraft(await api.products.analyze(source));
    } catch (e) {
      setError(e instanceof Error ? e.message : "분석에 실패했습니다.");
    } finally {
      setAnalyzing(false);
    }
  }

  const canAnalyze = Boolean(buildSource()) && !analyzing;

  return (
    <div className="space-y-6">
      <Pipeline stage={stage} />

      <SectionCard title="상세페이지 입력" description="쿠팡, 스마트스토어 등의 상품 정보를 분석해 제품 라이브러리에 저장합니다.">
        <Tabs items={TABS} value={tab} onChange={setTab} className="-mt-1 mb-5" />

        {tab === "url" && (
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              if (canAnalyze) analyze();
            }}
          >
            <FormField label="상품 URL" htmlFor="product-url" className="flex-1">
              <Input
                id="product-url"
                type="url"
                inputMode="url"
                placeholder="https://www.coupang.com/vp/products/…"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </FormField>
            <Button type="submit" variant="primary" icon={ScanSearch} loading={analyzing} disabled={!canAnalyze}>
              상세페이지 분석하기
            </Button>
          </form>
        )}

        {tab === "image" && (
          <div className="space-y-3">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-card border border-dashed border-line-strong bg-subtle/60 px-6 py-10 text-center transition-colors hover:bg-subtle">
              <Upload className="size-5 text-fg-subtle" />
              <span className="mt-2 text-sm font-medium text-fg">상세페이지 이미지를 선택하세요</span>
              <span className="mt-1 text-xs text-fg-subtle">JPG, PNG · 여러 장 선택 가능 · 긴 상세 이미지는 잘라서 올려도 됩니다</span>
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
            <div className="flex justify-end">
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
          URL 접근이 불가능한 경우 상세페이지 이미지 또는 텍스트를 직접 입력할 수 있습니다.
        </Notice>
      </SectionCard>

      {analyzing ? (
        <SectionCard>
          <LoadingState label="상세페이지를 수집하고 AI가 분석하는 중입니다…" className="py-20" />
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
          <ProductAnalysisView analysis={draft.analysis} />
        </div>
      ) : (
        <SectionCard>
          <EmptyState
            icon={ScanSearch}
            title="분석 결과가 여기에 표시됩니다"
            description={
              <>
                예시 URL로 바로 시험해 볼 수 있습니다:{" "}
                <button type="button" className="font-medium text-brand hover:underline" onClick={() => { setTab("url"); setUrl("https://smartstore.naver.com/dailywear/products/4410087"); }}>
                  스마트스토어 예시 입력
                </button>
                {" · "}
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
