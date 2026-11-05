"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Download, FileImage, Film, ImagePlus, Plus, Sparkles, Tags, Trash2, Wand2 } from "lucide-react";
import { api } from "@/lib/api-client";
import { Button, CopyButton, EmptyState, ErrorState, Input, LoadingState, Notice, SectionCard, Select, Textarea } from "@/components/ui";
import { createZip } from "@/lib/zip";
import { cn } from "@/lib/utils";

/**
 * 상세페이지 만들기 (v0.9.167) — ① 제품 → ② 사진 → ③ 기획·글 (AI 1번: 섹션 + 등록명·키워드·태그) → ④ 이미지 (섹션 PNG · 전체 JPG · ZIP)
 */
type Kind = "hero" | "photo" | "text" | "spec" | "cta";
const KIND_LABEL: Record<Kind, string> = { hero: "첫 화면 (Hook)", photo: "사진 + 설명", text: "글 (공감·고민)", spec: "제품 정보 표", cta: "마무리 (구매 유도)" };
interface Section {
  kind: Kind;
  title: string;
  body: string;
  photoKey: string | null;
}
interface Project {
  id: string;
  name: string;
  productId: string | null;
  photos: string[];
  sections: Section[];
  names: string[];
  keywords: string[];
  tags: string[];
  accent: string;
  rendered: string[];
  full: string | null;
  urls: Record<string, string>;
  updatedAt: string;
}
const ACCENTS = ["#2F6BFF", "#111827", "#E11D48", "#059669", "#D97706", "#7C3AED"];

async function call<T>(body?: Record<string, unknown>, id?: string): Promise<T> {
  const res = await fetch(body ? "/api/detail-page" : `/api/detail-page${id ? `?id=${encodeURIComponent(id)}` : ""}`, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined, cache: "no-store" });
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

export function DetailPageStudio({ initialProductId }: { initialProductId?: string }) {
  const [list, setList] = useState<{ id: string; name: string; productId: string | null }[] | null>(null);
  const [p, setP] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "info" | "warning"; text: string } | null>(null);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [newProduct, setNewProduct] = useState(initialProductId ?? "");
  const [ask, setAsk] = useState("");
  // v0.9.175 마케팅 심리 원칙: 처음엔 AI 학습 관리의 공통 설정, 여기서 바꿀 수 있다
  const [psy, setPsy] = useState(false);
  useEffect(() => {
    let live = true;
    void fetch("/api/ai-options", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; data?: { psychology?: boolean } }) => live && j?.ok && setPsy(Boolean(j.data?.psychology)))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const [pickFor, setPickFor] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const open = useCallback(async (id: string) => setP(await call<Project>(undefined, id)), []);
  const loadList = useCallback(async () => {
    try {
      const l = await call<Project[]>();
      setList(l.map((x) => ({ id: x.id, name: x.name, productId: x.productId })));
      const pick = (initialProductId && l.find((x) => x.productId === initialProductId)) || (!initialProductId && l[0]) || null;
      if (pick) await open(pick.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "불러오지 못했습니다.");
    }
  }, [open, initialProductId]);
  useEffect(() => {
    void (async () => loadList())();
    void api.products
      .list()
      .then((l) => setProducts(l.filter((x) => x.productGroup !== "stay").map((x) => ({ id: x.id, name: x.name }))))
      .catch(() => setProducts([]));
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
  const setSec = (i: number, patch: Partial<Section>) => p && save({ sections: p.sections.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const download = (url: string, name: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
  };
  async function zip() {
    if (!p) return;
    await run("zip", async () => {
      const files = await Promise.all(p.rendered.map(async (k, i) => ({ name: `${p.name}_상세_${String(i + 1).padStart(2, "0")}.png`, blob: await (await fetch(p.urls[k])).blob() })));
      if (p.full) files.push({ name: `${p.name}_상세_전체.jpg`, blob: await (await fetch(p.urls[p.full])).blob() });
      const blob = await createZip(files);
      download(URL.createObjectURL(blob), `${p.name}_상세페이지.zip`);
    });
  }

  if (error) return <ErrorState message={error} onRetry={() => void loadList()} />;
  if (!list) return <LoadingState label="상세페이지를 불러오는 중…" />;

  return (
    <div className="space-y-5" data-detail-page>
      <SectionCard title="① 제품 고르기" icon={FileImage} description="상세페이지를 만들 제품을 고르고 [새 상세페이지]. 제품 상세페이지 학습으로 저장한 분석(특징·스펙·구매 포인트)을 사실 근거로 씁니다.">
        <div className="flex flex-wrap items-center gap-2">
          {list.length > 0 && <Select className="w-60" value={p?.id ?? ""} placeholder="만든 상세페이지" onChange={(e) => void run("open", () => open(e.target.value))} options={list.map((x) => ({ value: x.id, label: x.name }))} aria-label="상세페이지 고르기" />}
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
                setList((l) => [{ id: np.id, name: np.name, productId: np.productId }, ...(l ?? [])]);
                setP(np);
              })
            }
            data-detail-new
          >
            새 상세페이지
          </Button>
          {p && (
            <Button size="sm" variant="ghost" icon={Trash2} onClick={() => window.confirm(`'${p.name}' 상세페이지를 지울까요?`) && void run("remove", async () => (await call({ action: "remove", id: p.id }), setP(null), await loadList()))}>
              지우기
            </Button>
          )}
        </div>
      </SectionCard>
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {!p ? (
        <EmptyState icon={FileImage} title="상세페이지가 없습니다" description="제품을 고르고 [새 상세페이지]를 눌러 주세요." />
      ) : (
        <>
          <SectionCard title={`② 사진 · ${p.photos.length}장`} icon={ImagePlus} description="제품 사진·연결된 샤오홍슈 영상 장면(원본 보관한 영상)·직접 올린 사진을 섞어 씁니다. 외부 비용 없음." data-detail-photos>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={ImagePlus} loading={busy === "product"} onClick={() => void run("product", async () => { const r = await call<{ project: Project; added: number }>({ action: "product", id: p.id }); setP(r.project); setMsg({ tone: r.added ? "info" : "warning", text: r.added ? `제품 사진 ${r.added}장을 가져왔습니다.` : "가져올 제품 사진이 없습니다." }); })} data-detail-product>
                제품 사진 가져오기
              </Button>
              <Button size="sm" variant="secondary" icon={Film} loading={busy === "videos"} onClick={() => void run("videos", async () => { const r = await call<{ project: Project; added: number }>({ action: "videos", id: p.id }); setP(r.project); setMsg({ tone: "info", text: `영상 장면 ${r.added}장을 뽑았습니다.` }); })} data-detail-frames>
                영상 장면 뽑기
              </Button>
              <Button size="sm" variant="secondary" icon={ImagePlus} loading={busy === "upload"} onClick={() => fileRef.current?.click()} data-detail-upload>
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
                    <img src={p.urls[k]} alt="" className="aspect-square w-full rounded object-cover" />
                    <button type="button" onClick={() => window.confirm("이 사진을 뺄까요?") && void save({ removePhoto: k })} className="absolute top-1 right-1 rounded bg-black/60 p-0.5 text-white opacity-0 group-hover:opacity-100" aria-label="사진 빼기">
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard title="③ 기획·글 (AI)" icon={Wand2} description="AI 가 사진과 제품 사실을 보고 섹션 구성(첫 화면 → 고민 → 핵심 특징 → 사용 장면 → 제품 정보 → 구매 유도)과 상품 등록명·검색 키워드·태그를 만듭니다 (AI 1번, 사실에 없는 수치·평점은 쓰지 않음)." data-detail-write>
            {/* v0.9.169 사진 없는 섹션 안내 */}
            {p.photos.length === 0 ? (
              <Notice tone="warning" className="mb-3">사진이 아직 없습니다. ②에서 사진을 넣어 주세요. 비어 있으면 [기획·글 만들기]·[이미지 만들기] 때 제품 사진을 한 번 자동으로 가져옵니다.</Notice>
            ) : p.sections.some((x) => !x.photoKey && x.kind !== "text" && x.kind !== "spec") ? (
              <Notice tone="info" className="mb-3">사진 없는 섹션은 [이미지 만들기] 때 아직 안 쓴 사진으로 자동으로 채웁니다. 원하는 사진이 있으면 섹션의 사진 칸을 눌러 고르세요.</Notice>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Input value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="요청 (선택, 예: 30대 자취생 대상, 차분한 말투)" className="h-9 w-80" aria-label="요청" />
<label className="flex items-center gap-1.5 text-[12.5px]" title="행동경제학·설득 원칙(손실 회피·대비·구체적 숫자·실수 효과·피크엔드 등)을 사실 범위 안에서 씁니다" data-detail-psy>
                <input type="checkbox" checked={psy} onChange={(e) => setPsy(e.target.checked)} />
                마케팅 심리 원칙 적용
              </label>
              <Button variant="primary" icon={Sparkles} loading={busy === "write"} onClick={() => void run("write", async () => setP(await call<Project>({ action: "write", id: p.id, request: ask || undefined, psychology: psy })))} data-detail-write-go>
                기획·글 만들기
              </Button>
              <span className="flex items-center gap-1 text-[12px] text-fg-muted">
                강조색
                {ACCENTS.map((c) => (
                  <button key={c} type="button" onClick={() => void save({ accent: c })} className={cn("size-5 rounded-full ring-offset-1", p.accent === c && "ring-2 ring-fg")} style={{ background: c }} aria-label={`강조색 ${c}`} />
                ))}
              </span>
            </div>
            {(p.names.length > 0 || p.keywords.length > 0) && (
              <div className="mt-3 grid gap-3 md:grid-cols-2" data-detail-names>
                <div className="rounded-control border border-line p-2.5">
                  <p className="mb-1 flex items-center gap-1 text-[12.5px] font-semibold">
                    <Tags className="size-3.5" /> 상품 등록명 추천
                  </p>
                  <ul className="space-y-1 text-[13px]">
                    {p.names.map((n) => (
                      <li key={n} className="flex items-center gap-1.5">
                        <span className="flex-1">{n}</span>
                        <span className="text-[11px] text-fg-subtle">{n.length}자</span>
                        <CopyButton value={n} iconOnly />
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-2 rounded-control border border-line p-2.5">
                  <div>
                    <p className="mb-1 flex items-center justify-between text-[12.5px] font-semibold">
                      검색 키워드 · {p.keywords.length}개 <CopyButton value={p.keywords.join(", ")} iconOnly />
                    </p>
                    <p className="text-[12.5px] text-fg-muted">{p.keywords.join(", ")}</p>
                  </div>
                  <div>
                    <p className="mb-1 flex items-center justify-between text-[12.5px] font-semibold">
                      스마트스토어 태그 · {p.tags.length}개 <CopyButton value={p.tags.join(",")} iconOnly />
                    </p>
                    <p className="text-[12.5px] text-fg-muted">{p.tags.map((t) => `#${t}`).join(" ")}</p>
                  </div>
                </div>
              </div>
            )}
            {p.sections.length > 0 && (
              <ol className="mt-3 space-y-2" data-detail-sections>
                {p.sections.map((sec, i) => (
                  <li key={`${i}${sec.kind}`} className="grid grid-cols-[28px_72px_1fr_auto] items-start gap-2 rounded-control border border-line p-2">
                    <span className="pt-1 text-center text-[12px] font-semibold text-fg-subtle">{i + 1}</span>
                    <button type="button" onClick={() => setPickFor(pickFor === i ? null : i)} title="사진 바꾸기" className="block">
                      {sec.photoKey ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={p.urls[sec.photoKey]} alt="" className={cn("aspect-square w-[72px] rounded object-cover", pickFor === i && "ring-2 ring-brand")} />
                      ) : (
                        <span className={cn("flex aspect-square w-[72px] items-center justify-center rounded bg-muted text-[11px] text-fg-subtle", pickFor === i && "ring-2 ring-brand")}>사진 없음</span>
                      )}
                    </button>
                    <div className="min-w-0 space-y-1">
                      <Select className="w-44" value={sec.kind} onChange={(e) => setSec(i, { kind: e.target.value as Kind })} options={(Object.keys(KIND_LABEL) as Kind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))} aria-label={`${i + 1} 섹션 종류`} />
                      <Input key={`t${p.updatedAt}${i}`} defaultValue={sec.title} onBlur={(e) => e.target.value !== sec.title && setSec(i, { title: e.target.value })} placeholder="제목" className="h-8 text-[13px]" aria-label={`${i + 1} 제목`} />
                      <Textarea key={`b${p.updatedAt}${i}`} rows={3} defaultValue={sec.body} onBlur={(e) => e.target.value !== sec.body && setSec(i, { body: e.target.value })} placeholder={sec.kind === "spec" ? "항목: 값 (한 줄에 하나)" : "설명 (줄바꿈 = 줄)"} className="text-[13px]" aria-label={`${i + 1} 본문`} />
                      {pickFor === i && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          <button type="button" onClick={() => (setSec(i, { photoKey: null }), setPickFor(null))} className="flex aspect-square w-12 items-center justify-center rounded bg-muted text-[10px]">
                            없음
                          </button>
                          {p.photos.map((k) => (
                            <button key={k} type="button" onClick={() => (setSec(i, { photoKey: k }), setPickFor(null))}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={p.urls[k]} alt="" className={cn("aspect-square w-12 rounded object-cover", k === sec.photoKey && "ring-2 ring-brand")} />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="flex flex-col gap-1">
                      <button type="button" disabled={i === 0} onClick={() => { const a = [...p.sections]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; void save({ sections: a }); }} className="text-fg-subtle hover:text-fg disabled:opacity-30" aria-label="위로">
                        <ArrowUp className="size-4" />
                      </button>
                      <button type="button" disabled={i === p.sections.length - 1} onClick={() => { const a = [...p.sections]; [a[i + 1], a[i]] = [a[i], a[i + 1]]; void save({ sections: a }); }} className="text-fg-subtle hover:text-fg disabled:opacity-30" aria-label="아래로">
                        <ArrowDown className="size-4" />
                      </button>
                      <button type="button" onClick={() => void save({ sections: p.sections.filter((_, j) => j !== i) })} className="text-fg-subtle hover:text-danger" aria-label="섹션 빼기">
                        <Trash2 className="size-4" />
                      </button>
                    </span>
                  </li>
                ))}
                <li>
                  <Button size="sm" variant="ghost" icon={Plus} onClick={() => void save({ sections: [...p.sections, { kind: "photo", title: "", body: "", photoKey: null }] })}>
                    섹션 추가
                  </Button>
                </li>
              </ol>
            )}
          </SectionCard>

          <SectionCard title="④ 이미지" icon={Download} description="폭 860px 로 섹션마다 PNG 와 이어 붙인 전체 JPG 를 만듭니다 (무료). 쇼핑몰 상세 편집기에 전체 JPG 한 장 또는 섹션 PNG 를 차례로 올리면 됩니다." data-detail-render>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="primary" icon={FileImage} loading={busy === "render"} disabled={!p.sections.length} onClick={() => void run("render", async () => setP(await call<Project>({ action: "render", id: p.id })))} data-detail-render-go>
                이미지 만들기 ({p.sections.length}개 섹션)
              </Button>
              {p.full && (
                <>
                  <Button variant="secondary" icon={Download} onClick={() => download(p.urls[p.full!], `${p.name}_상세_전체.jpg`)} data-detail-full>
                    전체 JPG 받기
                  </Button>
                  <Button variant="secondary" icon={Download} loading={busy === "zip"} onClick={() => void zip()} data-detail-zip>
                    ZIP 받기
                  </Button>
                </>
              )}
            </div>
            {p.full && (
              <div className="mt-3 max-h-[80vh] overflow-y-auto rounded border border-line bg-subtle p-2" data-detail-out>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.urls[p.full]} alt="상세페이지 전체" className="mx-auto w-full max-w-[430px] shadow-card" />
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
