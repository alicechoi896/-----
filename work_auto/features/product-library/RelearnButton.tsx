"use client";

import { useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import type { ProductDetail, RawProductData } from "@/lib/types";
import { api } from "@/lib/api-client";
import { parseSupportedProductUrl, PLATFORM_LABEL_KO } from "@/lib/product-url";
import { CollectedError, analyzeRaw, learnProductUrl, type LearnStage } from "@/lib/product-learn-flow";
import { Button, Modal, Notice } from "@/components/ui";

const STAGE: Record<LearnStage, string> = { checking: "확인 중…", collecting: "상품정보 수집 중… (10~60초)", analyzing: "AI 분석 중…" };

/**
 * 제품 상세 › [상세페이지 다시 학습] (쿠팡·스마트스토어 URL 로 학습한 제품만). docs/PRODUCT_DATA_COLLECTION.md
 * 확인 창에서 [다시 학습]을 누를 때만 Bright Data 1회 → AI 분석 → 같은 제품의 새 분석 버전으로 저장. 자동 새로고침 없음
 */
export function RelearnButton({ detail, onDone }: { detail: ProductDetail; onDone: (next: ProductDetail) => void }) {
  const parsed = parseSupportedProductUrl(detail.product.sourceUrl ?? "");
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<LearnStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collected, setCollected] = useState<RawProductData | null>(null);
  const busy = useRef(false);
  if (!parsed.supported) return null;

  async function run() {
    if (busy.current) return;
    busy.current = true;
    setError(null);
    try {
      let draft;
      if (collected) draft = await analyzeRaw(collected, setStage); // 수집은 끝났으면 AI 만
      else {
        const r = await learnProductUrl(detail.product.sourceUrl!, { force: true, productId: detail.product.id, onStage: setStage });
        if ("existing" in r) throw new Error("다시 학습할 수 없습니다.");
        draft = r.draft;
      }
      const next = await api.products.relearn(detail.product.id, draft);
      setCollected(null);
      setOpen(false);
      onDone(next);
    } catch (e) {
      if (e instanceof CollectedError) setCollected(e.raw);
      setError(e instanceof Error ? e.message : "상세페이지를 불러오지 못했습니다. 다시 시도해 주세요.");
    } finally {
      busy.current = false;
      setStage(null);
    }
  }

  return (
    <>
      <Button icon={RefreshCw} onClick={() => setOpen(true)} title="외부 상세페이지를 다시 불러와 새로 분석합니다" data-relearn>
        상세페이지 다시 학습
      </Button>
      <Modal
        open={open}
        onClose={() => !stage && setOpen(false)}
        title="상세페이지 다시 학습"
        description={`${PLATFORM_LABEL_KO[parsed.platform]} 상세페이지를 다시 불러와(Bright Data 1회) 새로 분석합니다. 지금 분석은 이전 버전으로 남고, 이 제품으로 만든 콘텐츠·연결 영상은 그대로입니다.`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={Boolean(stage)} onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button variant="primary" icon={RefreshCw} loading={Boolean(stage)} onClick={() => void run()}>
              {stage ? STAGE[stage] : collected ? "AI 분석만 다시" : "다시 학습"}
            </Button>
          </div>
        }
      >
        {error ? (
          <Notice tone="warning">
            {error}
            {collected && <span className="mt-1 block text-xs">상품정보는 이미 받아 두었습니다. 다시 누르면 AI 분석만 다시 합니다 (Bright Data 호출 없음).</span>}
          </Notice>
        ) : (
          <p className="text-sm text-fg-muted">상세페이지가 바뀌었을 때만 쓰세요. 콘텐츠를 만들 때는 저장된 분석을 쓰므로 다시 학습할 필요가 없습니다.</p>
        )}
      </Modal>
    </>
  );
}
