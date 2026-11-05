"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Download, Film, GalleryHorizontal, ImagePlus, Palette, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { api, type VideoProductionOptions } from "@/lib/api-client";
import { Button, CopyButton, EmptyState, ErrorState, Input, LoadingState, Notice, SectionCard, SegmentedControl, Select, Textarea } from "@/components/ui";
import { CAROUSEL_IMAGE_CREDITS, CAROUSEL_MAX_SLIDES, SLIDE_LAYOUTS, THEMES, emptySlide, type CarouselDesign, type CarouselImageTask, type CarouselSlide, type SlideLayout, type ThemeId } from "@/lib/carousel/types";
import { AI_CLIP_CONFIG, CAPTION_FONTS } from "@/lib/video-production/config";
import { shrinkImage } from "@/lib/image-shrink";
import { createZip } from "@/lib/zip";
import { cn } from "@/lib/utils";

/**
 * 인스타그램 캐러셀 (v0.9.173) — ① 주제·제목·내용 → [글 만들기] AI 1번 → ② 디자인(테마·색·글꼴, 참고 이미지로 고르기 AI 1번)
 * → ③ 그림 모음(올리기·제품 사진·영상 장면) → ④ 장마다 고치기 + AI 그림(Kie, 확인 후) → ⑤ PNG·ZIP + 캡션·해시태그
 * 글자는 서버가 직접 그린다. 유료는 AI 그림만 (확인 창 뒤, 자동 재시도 없음)
 */
interface Project {
  id: string;
  name: string;
  topic: string;
  title: string;
  notes: string;
  productId: string | null;
  contentId: string | null;
  photos: string[];
  slides: CarouselSlide[];
  design: CarouselDesign;
  tasks: CarouselImageTask[];
  caption: string;
  hashtags: string[];
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

const LINES_HINT: Partial<Record<SlideLayout, string>> = {
  cards: "한 줄에 상자 하나 — 라벨: 내용 (마지막 상자는 강조)",
  chat: "구역 이름: (콜론만) → 나: 말 / 상대: 말 / 결과: 문구",
  list: "한 줄에 하나 — 라벨: 내용 또는 내용만",
  cta: "버튼: 팔로우하고 다음 편 보기",
};
const usdPer = (CAROUSEL_IMAGE_CREDITS * AI_CLIP_CONFIG.creditUsd).toFixed(2);

export function CarouselStudio() {
  const [list, setList] = useState<{ id: string; name: string }[] | null>(null);
  const [p, setP] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "info" | "warning"; text: string } | null>(null);
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [contents, setContents] = useState<VideoProductionOptions["contents"]>([]);
  const [newTopic, setNewTopic] = useState("");
  const [count, setCount] = useState("8");
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
  const [pickFor, setPickFor] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sameChar, setSameChar] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);
  const refRef = useRef<HTMLInputElement>(null);
  const slideFileRef = useRef<HTMLInputElement>(null);
  const slideFor = useRef<string | null>(null);

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
      .then((l) => setProducts(l.map((x) => ({ id: x.id, name: x.name }))))
      .catch(() => setProducts([]));
    void api.videoProduction
      .options("youtube")
      .then((o) => setContents(o.contents))
      .catch(() => setContents([]));
  }, [loadList]);

  // AI 그림 확인 (무료): 만드는 중인 그림이 있을 때만 6초마다
  const waiting = Boolean(p?.tasks.some((t) => t.state === "waiting"));
  useEffect(() => {
    if (!p || !waiting) return;
    const t = setInterval(() => void call<Project>({ action: "status", id: p.id }).then(setP).catch(() => undefined), 6000);
    return () => clearInterval(t);
  }, [p, waiting]);

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
  const setSlides = (slides: CarouselSlide[]) => save({ slides });
  const setSlide = (id: string, patch: Partial<CarouselSlide>) => p && setSlides(p.slides.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const setDesign = (patch: Partial<CarouselDesign>) => p && save({ design: { ...p.design, ...patch } });
  const myContents = contents.filter((c) => c.productId && c.productId === p?.productId);
  const busyOf = (id: string) => p?.tasks.some((t) => t.slideId === id && t.state === "waiting");
  const failOf = (id: string) => [...(p?.tasks ?? [])].reverse().find((t) => t.slideId === id)?.state === "fail" ? [...(p?.tasks ?? [])].reverse().find((t) => t.slideId === id)?.error : null;
  const aiTargets = p ? p.slides.filter((s) => picked.has(s.id) && s.imagePrompt.trim() && !busyOf(s.id)) : [];

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
  const move = (i: number, d: number) => {
    if (!p) return;
    const arr = [...p.slides];
    const [x] = arr.splice(i, 1);
    arr.splice(Math.max(0, Math.min(arr.length, i + d)), 0, x);
    void setSlides(arr);
  };

  if (error) return <ErrorState message={error} onRetry={() => void loadList()} />;
  if (!list) return <LoadingState label="캐러셀을 불러오는 중…" />;

  return (
    <div className="space-y-5" data-carousel>
      <div className="flex flex-wrap items-center gap-2">
        {list.length > 0 && <Select className="w-60" value={p?.id ?? ""} onChange={(e) => void run("open", () => open(e.target.value))} options={list.map((x) => ({ value: x.id, label: x.name }))} aria-label="캐러셀 고르기" />}
        <Input className="h-9 w-72" value={newTopic} onChange={(e) => setNewTopic(e.target.value)} placeholder="새 캐러셀 주제 (예: AI 한테 욕하면 계정 정지)" aria-label="새 캐러셀 주제" />
        <Button
          size="sm"
          variant="primary"
          icon={Plus}
          loading={busy === "create"}
          onClick={() =>
            void run("create", async () => {
              const np = await call<Project>({ action: "create", topic: newTopic });
              setList((l) => [{ id: np.id, name: np.name }, ...(l ?? [])]);
              setP(np);
              setNewTopic("");
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
      {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
      {!p ? (
        <EmptyState icon={GalleryHorizontal} title="캐러셀이 없습니다" description="주제를 쓰고 [새 캐러셀]을 눌러 주세요." />
      ) : (
        <>
          <SectionCard title="① 주제 · 제목 · 내용" icon={Wand2} description="주제와 넣을 내용(사실·자료·메모)을 쓰고 [글 만들기]를 누르면 AI 가 장마다 종류·글과 캡션·해시태그를 씁니다 (AI 1번). 제목을 쓰면 그대로 씁니다.">
            <div key={`f${p.id}`} className="grid gap-2 md:grid-cols-2">
              <Input defaultValue={p.topic} onBlur={(e) => e.target.value !== p.topic && void save({ topic: e.target.value })} placeholder="주제 (예: AI 한테 욕하던 사람들 계정 정지)" aria-label="주제" />
              <Input defaultValue={p.title} key={`t${p.updatedAt}`} onBlur={(e) => e.target.value !== p.title && void save({ title: e.target.value })} placeholder="제목 (선택, 비우면 AI 가 정함)" aria-label="제목" />
              <Textarea className="md:col-span-2" rows={4} defaultValue={p.notes} onBlur={(e) => e.target.value !== p.notes && void save({ notes: e.target.value })} placeholder={"넣을 내용·자료 (선택) — 사실은 여기 쓴 범위 안에서만 씁니다\n예: 11월 12일 시행, 앤트로픽 공식 발표 / 욕하면 대화 종료 → 반복하면 계정 정지 / 안 걸리는 문장 4개 …"} aria-label="넣을 내용" />
              <Select value={p.productId ?? ""} placeholder="참고할 제품 (선택)" onChange={(e) => void save({ productId: e.target.value || null })} options={[{ value: "", label: "제품 없이" }, ...products.map((x) => ({ value: x.id, label: x.name }))]} aria-label="참고할 제품" />
              {p.productId && <Select value={p.contentId ?? ""} placeholder="영상 원고로 (선택)" onChange={(e) => void save({ contentId: e.target.value || null })} options={[{ value: "", label: "원고 없이" }, ...myContents.map((c) => ({ value: c.id, label: (c.title ?? c.headline).slice(0, 40) }))]} aria-label="영상 원고" />}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Select className="w-28" value={count} onChange={(e) => setCount(e.target.value)} options={[5, 6, 7, 8, 9, 10, 12, 13, 15].map((v) => ({ value: String(v), label: `${v}장` }))} aria-label="장 수" />
              <Input className="h-9 w-80" value={ask} onChange={(e) => setAsk(e.target.value)} placeholder="요청 (선택, 예: 20대 직장인 말투, 숫자 강조)" aria-label="요청" />
              <label className="flex items-center gap-1.5 text-[12.5px]" title="행동경제학·설득 원칙(손실 회피·대비·구체적 숫자·실수 효과·피크엔드 등)을 사실 범위 안에서 씁니다" data-carousel-psy>
                <input type="checkbox" checked={psy} onChange={(e) => setPsy(e.target.checked)} />
                마케팅 심리 원칙 적용
              </label>
              <Button
                variant="primary"
                icon={Sparkles}
                loading={busy === "write"}
                onClick={() => (!p.slides.length || window.confirm("지금 장들을 새로 쓴 글로 바꿉니다. 계속할까요?")) && void run("write", async () => setP(await call<Project>({ action: "write", id: p.id, count: Number(count), request: ask || undefined, psychology: psy })))}
                data-carousel-write
              >
                글 만들기 (AI 1번)
              </Button>
            </div>
          </SectionCard>

          <SectionCard title="② 디자인" icon={Palette} description="테마를 고르고 색·글꼴·머리말을 바꿉니다. 참고할 캐러셀 이미지를 올리면 AI 가 보고 비슷한 테마·색을 골라 줍니다 (AI 1번). 바꾼 뒤 ⑤ [이미지 만들기]를 다시 누르세요." data-carousel-design>
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl value={p.design.theme} onChange={(v) => setDesign({ ...THEMES.find((t) => t.value === v)!.design, theme: v as ThemeId })} options={THEMES.map((t) => ({ value: t.value, label: t.label }))} />
              <Button size="sm" variant="secondary" icon={ImagePlus} loading={busy === "style"} onClick={() => refRef.current?.click()} data-carousel-style>
                참고 이미지로 디자인 고르기
              </Button>
              <input
                ref={refRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                hidden
                onChange={(e) => {
                  const files = [...(e.target.files ?? [])].slice(0, 3);
                  e.target.value = "";
                  if (files.length) void run("style", async () => setP(await call<Project>({ action: "style", id: p.id, images: await Promise.all(files.map((f) => shrinkImage(f, 1200, 0.85))) })));
                }}
              />
            </div>
            <div key={`d${p.updatedAt}`} className="mt-3 flex flex-wrap items-center gap-3 text-[12.5px]">
              {(["bg", "fg", "accent"] as const).map((k) => (
                <label key={k} className="flex items-center gap-1.5">
                  {k === "bg" ? "바탕" : k === "fg" ? "글자" : "강조"}
                  <input type="color" defaultValue={p.design[k]} onBlur={(e) => e.target.value !== p.design[k] && setDesign({ [k]: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent" aria-label={`${k} 색`} />
                </label>
              ))}
              <Select className="w-44" value={p.design.font} onChange={(e) => setDesign({ font: e.target.value })} options={CAPTION_FONTS.map((f) => ({ value: f.value, label: `제목: ${f.label}` }))} aria-label="제목 글꼴" />
              <Input className="h-8 w-64" defaultValue={p.design.header} onBlur={(e) => e.target.value !== p.design.header && setDesign({ header: e.target.value })} placeholder="머리말 (예: 비기의 Tip · CLAUDE POLICY)" aria-label="머리말" />
              <Input className="h-8 w-36" defaultValue={p.design.badge} onBlur={(e) => e.target.value !== p.design.badge && setDesign({ badge: e.target.value })} placeholder="오른쪽 표시 (READ FIRST)" aria-label="오른쪽 표시" />
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={p.design.pageNo} onChange={(e) => setDesign({ pageNo: e.target.checked })} />
                쪽수 (1/8)
              </label>
            </div>
            {p.design.note && <p className="mt-2 text-[12px] text-fg-muted">참고한 느낌: {p.design.note}</p>}
          </SectionCard>

          <SectionCard title={`③ 그림 모음 · ${p.photos.length}장`} icon={ImagePlus} description="장에 넣을 그림·사진입니다. 직접 올리거나, 참고할 제품을 골랐으면 제품 사진·연결된 영상 장면을 가져옵니다 (무료). AI 그림은 ④ 장마다 만듭니다." data-carousel-photos>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" icon={ImagePlus} loading={busy === "upload"} onClick={() => fileRef.current?.click()} data-carousel-upload>
                사진 올리기
              </Button>
              {p.productId && (
                <>
                  <Button size="sm" variant="secondary" icon={ImagePlus} loading={busy === "product"} onClick={() => void run("product", async () => { const r = await call<{ project: Project; added: number }>({ action: "product", id: p.id }); setP(r.project); setMsg({ tone: r.added ? "info" : "warning", text: r.added ? `제품 사진 ${r.added}장을 가져왔습니다.` : "가져올 제품 사진이 없습니다." }); })}>
                    제품 사진 가져오기
                  </Button>
                  <Button size="sm" variant="secondary" icon={Film} loading={busy === "videos"} onClick={() => void run("videos", async () => { const r = await call<{ project: Project; added: number }>({ action: "videos", id: p.id }); setP(r.project); setMsg({ tone: "info", text: `영상 장면 ${r.added}장을 뽑았습니다.` }); })}>
                    영상 장면 뽑기
                  </Button>
                </>
              )}
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
                    for (const f of files) cur = await call<Project>({ action: "upload", id: p.id, dataUrl: await shrinkImage(f, 1800, 0.9) });
                    setP(cur);
                  });
                }}
              />
            </div>
            {p.photos.length > 0 && (
              <ul className="mt-3 grid grid-cols-5 gap-2 sm:grid-cols-10">
                {p.photos.map((k) => (
                  <li key={k} className="group relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.urls[k]} alt="" className="aspect-[4/5] w-full rounded object-cover" />
                    <button type="button" onClick={() => window.confirm("이 그림을 뺄까요?") && void save({ removePhoto: k })} className="absolute top-1 right-1 rounded bg-black/60 p-0.5 text-white opacity-0 group-hover:opacity-100" aria-label="그림 빼기">
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <SectionCard
            title={`④ 장 · ${p.slides.length}장`}
            icon={GalleryHorizontal}
            description="장마다 종류·글을 고칩니다 (칸을 벗어나면 저장). 제목에서 *별표*로 감싼 말은 강조색입니다. 그림이 필요한 장은 그림 칸을 눌러 모음에서 고르거나, 영어 그림 설명을 쓰고 체크한 뒤 [AI 그림 만들기]를 누르세요."
            data-carousel-slides
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="primary"
                icon={Sparkles}
                disabled={!aiTargets.length || Boolean(busy)}
                loading={busy === "image"}
                onClick={() =>
                  window.confirm(`AI 그림 ${aiTargets.length}장을 만들까요?\n예상 비용 약 $${(aiTargets.length * Number(usdPer)).toFixed(2)} (Kie 크레딧 ${aiTargets.length * CAROUSEL_IMAGE_CREDITS}). 한 번 누르면 바로 과금됩니다.`) &&
                  void run("image", async () => {
                    const r = await call<{ project: Project; created: number }>({ action: "image", id: p.id, slideIds: aiTargets.map((s) => s.id), confirmed: true, useCover: sameChar });
                    setP(r.project);
                    setPicked(new Set());
                    setMsg({ tone: "info", text: `${r.created}장 만들기를 시작했습니다. 30초~1분 뒤 장에 들어갑니다 (자동 확인, 무료).` });
                  })
                }
                data-carousel-ai-image
              >
                {waiting ? "그림 만드는 중… (자동 확인)" : `AI 그림 만들기 (${aiTargets.length}장 · 약 $${(aiTargets.length * Number(usdPer)).toFixed(2)})`}
              </Button>
              <label className="flex items-center gap-1.5 text-[12.5px]">
                <input type="checkbox" checked={sameChar} onChange={(e) => setSameChar(e.target.checked)} />
                표지 그림과 같은 캐릭터로
              </label>
              <Button size="sm" variant="ghost" icon={Plus} disabled={p.slides.length >= CAROUSEL_MAX_SLIDES} onClick={() => void setSlides([...p.slides.slice(0, -1), emptySlide("title"), ...p.slides.slice(-1)])}>
                장 추가
              </Button>
            </div>
            <input
              ref={slideFileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                const sid = slideFor.current;
                if (f && sid) void run("upload", async () => setP(await call<Project>({ action: "upload", id: p.id, slideId: sid, dataUrl: await shrinkImage(f, 1800, 0.9) })));
              }}
            />
            {p.slides.length === 0 ? (
              <p className="text-[12.5px] text-fg-subtle">아직 장이 없습니다. ①에서 [글 만들기]를 눌러 주세요.</p>
            ) : (
              <ol className="space-y-3">
                {p.slides.map((s, i) => (
                  <li key={s.id} className="rounded-control border border-line p-3" data-carousel-slide>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="w-6 text-center text-[13px] font-bold text-fg-subtle">{i + 1}</span>
                      <Select className="w-36" value={s.layout} onChange={(e) => setSlide(s.id, { layout: e.target.value as SlideLayout })} options={SLIDE_LAYOUTS.map((l) => ({ value: l.value, label: l.label }))} aria-label={`${i + 1}번 장 종류`} />
                      <span className="text-[11.5px] text-fg-subtle">{SLIDE_LAYOUTS.find((l) => l.value === s.layout)?.hint}</span>
                      <span className="ml-auto flex items-center gap-1">
                        <button type="button" onClick={() => move(i, -1)} disabled={i === 0} className="text-fg-subtle hover:text-fg disabled:opacity-30" aria-label="위로">
                          <ArrowUp className="size-4" />
                        </button>
                        <button type="button" onClick={() => move(i, 1)} disabled={i === p.slides.length - 1} className="text-fg-subtle hover:text-fg disabled:opacity-30" aria-label="아래로">
                          <ArrowDown className="size-4" />
                        </button>
                        <button type="button" onClick={() => window.confirm(`${i + 1}번 장을 뺄까요?`) && void setSlides(p.slides.filter((x) => x.id !== s.id))} className="text-fg-subtle hover:text-danger" aria-label="장 빼기">
                          <Trash2 className="size-4" />
                        </button>
                      </span>
                    </div>
                    <div className="grid gap-2 md:grid-cols-[1fr_120px]">
                      <div className="min-w-0 space-y-1.5">
                        <div className="grid gap-1.5 sm:grid-cols-[140px_1fr]">
                          <Input className="h-8 text-[12.5px]" defaultValue={s.tag} onBlur={(e) => e.target.value !== s.tag && setSlide(s.id, { tag: e.target.value })} placeholder="태그 (WARNING)" aria-label={`${i + 1}번 태그`} />
                          <Textarea rows={2} className="text-[14px] font-semibold" defaultValue={s.title} onBlur={(e) => e.target.value !== s.title && setSlide(s.id, { title: e.target.value })} placeholder={"큰 제목 (줄바꿈 = 줄, *강조*)\n예: 욕 한 줄에\n*대화가 끝납니다*"} aria-label={`${i + 1}번 제목`} />
                        </div>
                        <Textarea rows={2} className="text-[13px]" defaultValue={s.body} onBlur={(e) => e.target.value !== s.body && setSlide(s.id, { body: e.target.value })} placeholder={s.layout === "cover" ? "첫 줄 = 굵은 부제 (정지 됩니다…ㄷㄷ), 둘째 줄부터 작은 설명" : "본문 (선택)"} aria-label={`${i + 1}번 본문`} />
                        {LINES_HINT[s.layout] && <Textarea rows={3} className="font-mono text-[12.5px]" defaultValue={s.lines} onBlur={(e) => e.target.value !== s.lines && setSlide(s.id, { lines: e.target.value })} placeholder={LINES_HINT[s.layout]} aria-label={`${i + 1}번 줄`} />}
                        <div className="flex flex-wrap items-center gap-1.5">
                          <input type="checkbox" checked={picked.has(s.id)} disabled={!s.imagePrompt.trim() || busyOf(s.id)} onChange={(e) => setPicked((old) => { const n = new Set(old); if (e.target.checked) n.add(s.id); else n.delete(s.id); return n; })} aria-label={`${i + 1}번 AI 그림 고르기`} />
                          <Input className="h-8 min-w-[240px] flex-1 text-[12px]" defaultValue={s.imagePrompt} onBlur={(e) => e.target.value !== s.imagePrompt && setSlide(s.id, { imagePrompt: e.target.value })} placeholder="AI 그림 설명 (영어, 글자 없이) — 예: a cute fluffy red monster pressing a red button, dark room, 3d" aria-label={`${i + 1}번 그림 설명`} />
                          {busyOf(s.id) && <span className="text-[11.5px] text-info">그림 만드는 중…</span>}
                          {failOf(s.id) && <span className="truncate text-[11.5px] text-danger">그림 실패: {failOf(s.id)}</span>}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <button type="button" onClick={() => setPickFor(pickFor === s.id ? null : s.id)} className={cn("block w-full", pickFor === s.id && "ring-2 ring-brand")} aria-label={`${i + 1}번 그림 고르기`}>
                          {s.imageKey && p.urls[s.imageKey] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={p.urls[s.imageKey]} alt="" className="aspect-[4/5] w-full rounded object-cover" />
                          ) : (
                            <span className="flex aspect-[4/5] w-full items-center justify-center rounded bg-muted text-[11px] text-fg-subtle">그림 없음</span>
                          )}
                        </button>
                        <button type="button" className="w-full text-[11.5px] text-brand hover:underline" onClick={() => ((slideFor.current = s.id), slideFileRef.current?.click())}>
                          이 장에 올리기
                        </button>
                      </div>
                    </div>
                    {pickFor === s.id && (
                      <div className="mt-2 flex flex-wrap gap-1.5 rounded bg-subtle p-2">
                        <button type="button" onClick={() => (setSlide(s.id, { imageKey: null }), setPickFor(null))} className="flex aspect-[4/5] w-14 items-center justify-center rounded bg-muted text-[10px]">
                          없음
                        </button>
                        {p.photos.map((k) => (
                          <button key={k} type="button" onClick={() => (setSlide(s.id, { imageKey: k }), setPickFor(null))}>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={p.urls[k]} alt="" className={cn("aspect-[4/5] w-14 rounded object-cover", k === s.imageKey && "ring-2 ring-brand")} />
                          </button>
                        ))}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>

          <SectionCard title="⑤ 이미지 · 캡션" icon={Download} description="1080×1350 PNG 로 만듭니다 (무료). 글이나 디자인을 바꿨으면 다시 누르세요." data-carousel-render>
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
              <div className="mt-3 flex gap-2 overflow-x-auto pb-2" data-carousel-out>
                {p.rendered.map((k, i) => (
                  <a key={k} href={p.urls[k]} download={`${p.name}_${i + 1}.png`} target="_blank" rel="noreferrer" className="w-[200px] shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.urls[k]} alt={`${i + 1}장`} className="aspect-[4/5] w-full rounded border border-line object-cover" />
                  </a>
                ))}
              </div>
            )}
            {(p.caption || p.hashtags.length > 0) && (
              <div className="mt-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12.5px] font-semibold">캡션 · 해시태그</span>
                  <CopyButton value={`${p.caption}\n\n${p.hashtags.join(" ")}`} />
                </div>
                <Textarea key={`c${p.updatedAt}`} rows={6} defaultValue={p.caption} onBlur={(e) => e.target.value !== p.caption && void save({ caption: e.target.value })} aria-label="캡션" />
                <Input key={`h${p.updatedAt}`} defaultValue={p.hashtags.join(" ")} onBlur={(e) => void save({ hashtags: e.target.value.split(/\s+/).filter(Boolean) })} aria-label="해시태그" />
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
