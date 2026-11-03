"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Download, Film, GalleryHorizontal, ImagePlus, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { api, type VideoProductionOptions } from "@/lib/api-client";
import { Button, CopyButton, EmptyState, ErrorState, Input, LoadingState, Notice, SectionCard, Select, Textarea } from "@/components/ui";
import { CAPTION_FONTS } from "@/lib/video-production/config";
import { createZip } from "@/lib/zip";
import { cn } from "@/lib/utils";

/**
 * 제품 캐러셀 (v0.9.163) — ① 제품·영상 원고 → ② 사진 (제품 사진·영상 장면·올리기) → ③ 글 (AI 1번, 장마다 고치기) → ④ 이미지 (PNG·ZIP) + 설명글·해시태그
 * 외부 유료 생성 없음 (AI 글 1번만)
 */
type Pos = "top" | "center" | "bottom";
interface Slide {
  photoKey: string;
  top: string;
  text: string;
  pos: Pos;
}
interface Project {
  id: string;
  name: string;
  productId: string | null;
  contentId: string | null;
  photos: string[];
  slides: Slide[];
  caption: string;
  hashtags: string[];
  font: string;
  rendered: string[];
  urls: Record<string, string>;
  updatedAt: string;
}

async function call<T>(body?: Record<string, unknown>, id?: string): Promise<T> {
  const res = await fetch(body ? "/api/carousel" : `/api/carousel${id ? `?id=${encodeURIComponent(id)}` : ""}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
  const j = (await res.json().catch(() => null)) as { ok: boolean; data: T; error?: { message: string } } | null;
  if (!j?.ok) throw new Error(j?.error?.message ?? "요청하지 못했습니다.");
  return j.data;
}

async function shrink(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = bad;
      i.src = url;
    });
    const s = Math.min(1, 1800 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * s);
    c.height = Math.round(img.height * s);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.9);
  } finally {
    URL.revokeObjectURL(url);
  }
}

const POS_LABEL: Record<Pos, string> = { top: "글 위", center: "글 가운데", bottom: "글 아래" };

export function CarouselStudio() {
  const [list, setList] = useState<{ id: string; name: string }[] | null>(null);
  const [p, setP] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "info" | "warning"; text: string } | null>(null);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [contents, setContents] = useState<VideoProductionOptions["contents"]>([]);
  const [newProduct, setNewProduct] = useState("");
  const [count, setCount] = useState("5");
  const [ask, setAsk] = useState("");
  const [pickFor, setPickFor] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const open = useCallback(async (id: string) => setP(await call<Project>(undefined, id)), []);
  const loadList = useCallback(async () => {
    try {
      const l = await call<Project[]>();
      setList(l.map((x) => ({ id: x.id, name: x.name })));
      if (l[0]) await open(l[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    }
  }, [open]);
  useEffect(() => {
    void (async () => loadList())();
    void api.products
      .list()
      .then((l) => setProducts(l.filter((x) => x.productGroup !== "stay").map((x) => ({ id: x.id, name: x.name }))))
      .catch(() => setProducts([]));
    void api.videoProduction
      .options("youtube")
      .then((o) => setContents(o.contents))
      .catch(() => setContents([]));
  }, [loadList]);

  async function run(label: string, f: () => Promise<void>) {
    setBusy(label);
    setMsg(null);
    try {
      await f();
    } catch (e) {
      setMsg({ tone: "warning", text: e instanceof Error ? e.message : "하지 못했습니다." });
    } finally {
      setBusy(null);
    }
  }
  const save = (patch: Record<string, unknown>) => p && run("save", async () => setP(await call<Project>({ action: "update", id: p.id, ...patch })));
  const setSlide = (i: number, patch: Partial<Slide>) => p && save({ slides: p.slides.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const myContents = contents.filter((c) => c.productId && c.productId === p?.productId);

  async function zip() {
    if (!p) return;
    await run("zip", async () => {
      const files = await Promise.all(p.rendered.map(async (k, i) => ({ name: `${p.name}_${String(i + 1).padStart(2, "0")}.png`, blob: await (await fetch(p.urls[k])).blob() })));
      const blob = await createZip(files);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${p.name}_캐러셀.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    });
  }

  if (error) return <ErrorState message={error} onRetry={() => void loadList()} />;
  if (!list) return <LoadingState label="캐러셀을 불러오는 중…" />;

  return (
    <div className="space-y-5" data-carousel>
      <SectionCard title="① 제품 고르기" icon={GalleryHorizontal} description="캐러셀로 만들 제품을 고르고 [새 캐러셀]. 이미 만든 캐러셀은 왼쪽에서 다시 엽니다.">
        <div className="flex flex-wrap items-center gap-2">
          {list.length > 0 && <Select className="w-60" value={p?.id ?? ""} onChange={(e) => void run("open", () => open(e.target.value))} options={list.map((x) => ({ value: x.id, label: x.name }))} aria-label="캐러셀 고르기" />}
          <Select className="w-60" value={newProduct} placeholder="제품 고르기" onChange={(e) => setNewProduct(e.target.value)} options={products.map((x) => ({ value: x.id, label: x.name }))} aria-label="제품" />
          <Button
            size="sm"
            variant="primary"
            icon={Plus}
            loading={busy === "create"}
            disabled={!newProduct}
            onClick={() =>
              void run("create", async () => {
                const np = await call<Project>({ action: "create", productId: newProduct });
                setList((l) => [{ id: np.id, name: np.name }, ...(l ?? [])]);
                setP(np);
              })
            }
            data-carousel-new
          >
            새 캐러셀
          </Button>
          {p && (
            <Button size="sm" variant="ghost" icon={Trash2} onClick={() => window.confirm(`'${p.name}' 캐러셀을 지울까요?`) && void run("remove", async () => (await call({ action: "remove", id: p.id }), setP(null), await loadList()))}>
              지우기
            </Button>
          )}
        </div>
        {p && (
          <label className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
            영상 원고로 만들기 (선택)
            <Select className="w-80" value={p.contentId ?? ""} placeholder="원고 없이 제품 정보로" onChange={(e) => void save({ contentId: e.target.value || null })} options={myContents.map((c) => ({ value: c.id, label: (c.title ?? c.headline).slice(0, 40) }))} aria-label="영상 원고" />
          </label>
        )}
      </SectionCard>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {!p ? (
        <EmptyState icon={GalleryHorizontal} title="캐러셀이 없습니다" description="제품을 고르고 [새 캐러셀]을 눌러 주세요." />
      ) : (
        <>
          <SectionCard title={`② 사진 · ${p.photos.length}장`} icon={ImagePlus} description="사진은 4:5 로 꽉 채워 자릅니다. 제품 사진, 연결된 샤오홍슈 영상 장면(원본 보관한 영상, 무료), 직접 올린 사진을 섞어 쓸 수 있습니다." data-carousel-photos>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={ImagePlus} loading={busy === "product"} disabled={!p.productId} onClick={() => void run("product", async () => { const r = await call<{ project: Project; added: number }>({ action: "product", id: p.id }); setP(r.project); setMsg({ tone: r.added ? "info" : "warning", text: r.added ? `제품 사진 ${r.added}장을 가져왔습니다.` : "가져올 제품 사진이 없습니다." }); })} data-carousel-product>
                제품 사진 가져오기
              </Button>
              <Button size="sm" variant="secondary" icon={Film} loading={busy === "videos"} disabled={!p.productId} onClick={() => void run("videos", async () => { const r = await call<{ project: Project; added: number }>({ action: "videos", id: p.id }); setP(r.project); setMsg({ tone: "info", text: `영상 장면 ${r.added}장을 뽑았습니다.` }); })} data-carousel-frames>
                영상 장면 뽑기
              </Button>
              <Button size="sm" variant="secondary" icon={ImagePlus} loading={busy === "upload"} onClick={() => fileRef.current?.click()} data-carousel-upload>
                사진 올리기
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                hidden
                onChange={(e) => {
                  const files = [...(e.target.files ?? [])];
                  e.target.value = "";
                  void run("upload", async () => {
                    let cur = p;
                    for (const f of files) cur = await call<Project>({ action: "upload", id: p.id, dataUrl: await shrink(f) });
                    setP(cur);
                  });
                }}
              />
            </div>
            {p.photos.length > 0 && (
              <ul className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
                {p.photos.map((k) => (
                  <li key={k} className="group relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.urls[k]} alt="" className="aspect-[4/5] w-full rounded object-cover" />
                    <button type="button" onClick={() => window.confirm("이 사진을 뺄까요?") && void save({ removePhoto: k })} className="absolute top-1 right-1 rounded bg-black/60 p-0.5 text-white opacity-0 group-hover:opacity-100" aria-label="사진 빼기">
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="③ 글 (AI)" icon={Wand2} description="AI 가 사진을 보고 장마다 위 작은 띠·본문·사진·글 위치와 설명글·해시태그를 씁니다 (AI 1번). 대본 포맷의 Hook, 평점 이야기 빼기 규칙을 따릅니다. 아래에서 장마다 고칩니다." data-carousel-write>
            <div className="flex flex-wrap items-center gap-2">
              <Select className="w-28" value={count} onChange={(e) => setCount(e.target.value)} options={["4", "5", "6", "7", "8"].map((v) => ({ value: v, label: `${v}장` }))} aria-label="장 수" />
              <Input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="요청 (선택, 예: 30대 직장인 말투로, 더 짧게)" className="h-9 w-80" aria-label="요청" />
              <Button variant="primary" icon={Sparkles} loading={busy === "write"} disabled={p.photos.length < 2} onClick={() => void run("write", async () => setP(await call<Project>({ action: "write", id: p.id, count: Number(count), request: ask || undefined })))} data-carousel-write-go>
                글 만들기
              </Button>
              <Select className="w-48" value={p.font} onChange={(e) => void save({ font: e.target.value })} options={CAPTION_FONTS.map((f) => ({ value: f.value, label: f.label }))} aria-label="글꼴" />
            </div>
            {p.slides.length > 0 && (
              <ol className="mt-3 space-y-2" data-carousel-slides>
                {p.slides.map((sl, i) => (
                  <li key={`${i}${sl.photoKey}`} className="grid grid-cols-[28px_72px_1fr_auto] items-start gap-2 rounded-control border border-line p-2">
                    <span className="pt-1 text-center text-[12px] font-semibold text-fg-subtle">{i + 1}</span>
                    <button type="button" onClick={() => setPickFor(pickFor === i ? null : i)} title="사진 바꾸기" className="block">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.urls[sl.photoKey]} alt="" className={cn("aspect-[4/5] w-[72px] rounded object-cover", pickFor === i && "ring-2 ring-brand")} />
                    </button>
                    <div className="min-w-0 space-y-1">
                      <Input key={`t${p.updatedAt}${i}`} defaultValue={sl.top} onBlur={(e) => e.target.value !== sl.top && setSlide(i, { top: e.target.value })} placeholder="위 작은 띠 (선택)" className="h-8 text-[12.5px]" aria-label={`${i + 1}장 위 띠`} />
                      <Textarea key={`b${p.updatedAt}${i}`} rows={3} defaultValue={sl.text} onBlur={(e) => e.target.value !== sl.text && setSlide(i, { text: e.target.value })} className="text-[13px]" aria-label={`${i + 1}장 본문`} />
                      <span className="flex items-center gap-1 text-[11.5px]">
                        {(["top", "center", "bottom"] as Pos[]).map((x) => (
                          <button key={x} type="button" onClick={() => setSlide(i, { pos: x })} className={cn("rounded px-1.5 py-0.5 ring-1 ring-inset", sl.pos === x ? "bg-brand-soft text-brand ring-brand/40" : "text-fg-muted ring-line")}>
                            {POS_LABEL[x]}
                          </button>
                        ))}
                      </span>
                      {pickFor === i && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {p.photos.map((k) => (
                            <button key={k} type="button" onClick={() => (setSlide(i, { photoKey: k }), setPickFor(null))}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={p.urls[k]} alt="" className={cn("aspect-[4/5] w-12 rounded object-cover", k === sl.photoKey && "ring-2 ring-brand")} />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="flex flex-col gap-1">
                      <button type="button" disabled={i === 0} onClick={() => { const a = [...p.slides]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; void save({ slides: a }); }} className="text-fg-subtle hover:text-fg disabled:opacity-30" aria-label="위로">
                        <ArrowUp className="size-4" />
                      </button>
                      <button type="button" disabled={i === p.slides.length - 1} onClick={() => { const a = [...p.slides]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; void save({ slides: a }); }} className="text-fg-subtle hover:text-fg disabled:opacity-30" aria-label="아래로">
                        <ArrowDown className="size-4" />
                      </button>
                      <button type="button" onClick={() => void save({ slides: p.slides.filter((_, j) => j !== i) })} className="text-fg-subtle hover:text-danger" aria-label="장 빼기">
                        <Trash2 className="size-4" />
                      </button>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>

          <SectionCard title="④ 이미지 · 설명글" icon={Download} description="장마다 4:5(1080×1350) PNG 로 만듭니다 (무료). 다 되면 ZIP 으로 한 번에 받습니다." data-carousel-render>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" icon={GalleryHorizontal} loading={busy === "render"} disabled={!p.slides.length} onClick={() => void run("render", async () => setP(await call<Project>({ action: "render", id: p.id })))} data-carousel-render-go>
                이미지 만들기 ({p.slides.length}장)
              </Button>
              {p.rendered.length > 0 && (
                <Button variant="secondary" icon={Download} loading={busy === "zip"} onClick={() => void zip()} data-carousel-zip>
                  ZIP 받기
                </Button>
              )}
            </div>
            {p.rendered.length > 0 && (
              <ul className="mt-3 flex gap-2 overflow-x-auto pb-2" data-carousel-out>
                {p.rendered.map((k, i) => (
                  <li key={k} className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.urls[k]} alt={`${i + 1}장`} className="h-80 rounded shadow-card" />
                  </li>
                ))}
              </ul>
            )}
            {(p.caption || p.hashtags.length > 0) && (
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-[12.5px] font-semibold">피드 설명글 · 해시태그</p>
                  <CopyButton value={`${p.caption}\n\n${p.hashtags.join(" ")}`} />
                </div>
                <Textarea key={`c${p.updatedAt}`} rows={5} defaultValue={p.caption} onBlur={(e) => e.target.value !== p.caption && void save({ caption: e.target.value })} aria-label="설명글" />
                <Input key={`h${p.updatedAt}`} defaultValue={p.hashtags.join(" ")} onBlur={(e) => void save({ hashtags: e.target.value.split(/\s+/).filter(Boolean) })} aria-label="해시태그" />
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
