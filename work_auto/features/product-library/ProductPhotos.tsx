"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ImagePlus, Images, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/SectionCard";
import { Notice } from "@/components/ui/States";
import { shrinkImage } from "@/lib/image-shrink";

/**
 * 제품 '내 사진' (v0.9.172) — 직접 올려 관리하는 사진 (숙소 사진 등).
 * AI 숙소 영상·상세페이지 만들기·캐러셀이 제품 사진을 가져올 때 이 사진을 먼저(이 순서대로) 쓴다. 무료
 */
interface Photo {
  key: string;
  url: string;
}
const MAX = 30;

async function call(productId: string, body?: Record<string, unknown>): Promise<Photo[]> {
  const res = await fetch(`/api/products/${encodeURIComponent(productId)}/photos`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const j = (await res.json().catch(() => null)) as { ok: boolean; data: Photo[]; error?: { message: string } } | null;
  if (!j?.ok) throw new Error(j?.error?.message ?? "요청하지 못했습니다.");
  return j.data;
}

export function ProductPhotos({ productId, stay }: { productId: string; stay?: boolean }) {
  const [list, setList] = useState<Photo[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let live = true;
    void call(productId)
      .then((l) => live && setList(l))
      .catch((e: unknown) => live && (setList([]), setErr(e instanceof Error ? e.message : "불러오지 못했습니다.")));
    return () => {
      live = false;
    };
  }, [productId]);

  async function run(f: () => Promise<Photo[]>) {
    setBusy(true);
    setErr(null);
    try {
      setList(await f());
    } catch (e) {
      setErr(e instanceof Error ? e.message : "하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }
  const move = (i: number, d: number) => {
    if (!list) return;
    const arr = [...list];
    const [x] = arr.splice(i, 1);
    arr.splice(Math.max(0, Math.min(arr.length, i + d)), 0, x);
    setList(arr);
    void run(() => call(productId, { action: "order", keys: arr.map((p) => p.key) }));
  };

  return (
    <SectionCard
      title={`내 사진 · ${list?.length ?? 0}장`}
      icon={Images}
      description={stay ? "숙소 사진을 여기에 올려 관리하세요. AI 숙소 영상에서 이 숙소를 고르면 이 순서대로 컷이 됩니다 (그다음 쇼핑몰 사진)." : "직접 올린 사진은 상세페이지 만들기·캐러셀·AI 숙소 영상이 제품 사진을 가져올 때 먼저 씁니다 (무료)."}
      actions={
        <Button size="sm" variant="secondary" icon={ImagePlus} loading={busy} disabled={(list?.length ?? 0) >= MAX} onClick={() => fileRef.current?.click()} data-product-photo-upload>
          사진 올리기
        </Button>
      }
      data-product-photos
    >
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        hidden
        onChange={(e) => {
          const files = [...(e.target.files ?? [])].slice(0, MAX - (list?.length ?? 0));
          e.target.value = "";
          void run(async () => {
            let cur = list ?? [];
            for (const f of files) cur = await call(productId, { action: "upload", dataUrl: await shrinkImage(f, 2000, 0.9) });
            return cur;
          });
        }}
      />
      {err && (
        <Notice tone="warning" className="mb-2">
          {err}
        </Notice>
      )}
      {list && list.length === 0 ? (
        <p className="text-[12.5px] text-fg-subtle">아직 올린 사진이 없습니다. [사진 올리기]로 여러 장을 한 번에 넣을 수 있습니다 (JPG·PNG·WEBP, {MAX}장까지).</p>
      ) : (
        <ol className="flex flex-wrap gap-2" data-product-photo-list>
          {(list ?? []).map((ph, i) => (
            <li key={ph.key} className="group relative w-28">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ph.url} alt={`내 사진 ${i + 1}`} className="aspect-[3/4] w-full rounded-control border border-line object-cover" />
              <span className="absolute top-1 left-1 rounded bg-black/60 px-1 text-[10.5px] font-semibold text-white">{i + 1}</span>
              <span className="absolute inset-x-1 bottom-1 flex justify-between opacity-0 transition-opacity group-hover:opacity-100">
                <button type="button" disabled={busy || i === 0} onClick={() => move(i, -1)} className="rounded bg-black/60 p-0.5 text-white disabled:opacity-30" aria-label="앞으로">
                  <ArrowLeft className="size-3.5" />
                </button>
                <button type="button" disabled={busy} onClick={() => window.confirm("이 사진을 지울까요?") && void run(() => call(productId, { action: "remove", key: ph.key }))} className="rounded bg-black/60 p-0.5 text-white hover:text-red-300" aria-label="지우기">
                  <Trash2 className="size-3.5" />
                </button>
                <button type="button" disabled={busy || i === list!.length - 1} onClick={() => move(i, 1)} className="rounded bg-black/60 p-0.5 text-white disabled:opacity-30" aria-label="뒤로">
                  <ArrowRight className="size-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}
