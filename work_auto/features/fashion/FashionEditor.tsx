"use client";

import { useEffect, useState } from "react";
import { Check, Clapperboard, Download, ImageIcon, Library, Palette, Plus, Shirt, Sparkles, Trash2, UserRound, Wand2 } from "lucide-react";
import { Badge, Button, Input, Modal, Notice, SectionCard, SegmentedControl, Select, Textarea } from "@/components/ui";
import { api } from "@/lib/api-client";
import { approvedOf, BACKGROUNDS, CLIP_CONCEPTS, categoryLabel, newFashionId } from "@/lib/fashion/prompts";
import { FEED_FORMATS, REEL_FORMATS, feedFormatOf, reelFormatOf } from "@/lib/fashion/formats";
import { FASHION_CATEGORIES, FASHION_STALE_RENDER_MS, type FashionCategory, type FashionImage, type FashionLook, type FashionSettings, type FashionVoice } from "@/lib/fashion/types";
import type { VideoProductionOptions } from "@/lib/api-client";
import { TypecastVoicePicker } from "@/features/video-production/VideoProductionWorkspace";
import type { Product } from "@/lib/types";
import { cn, formatRelative } from "@/lib/utils";
import { CostConfirm, TASK_LABEL, UploadButton, taskTone } from "@/features/drama-studio/ui";
import { fashionApi, newRequestId, type ImageJob } from "./api";
import type { FashionCtl } from "./useFashion";

const IMAGE_CREDITS = 4;

/** 승인·지우기가 있는 이미지 묶음 */
function ImageStrip({ list, urls, onChange, empty }: { list: FashionImage[]; urls: Record<string, string>; onChange: (next: FashionImage[]) => void; empty: string }) {
  if (!list.length) return <p className="text-[12px] text-fg-subtle">{empty}</p>;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {[...list].reverse().map((img) => (
        <div key={img.id} className={cn("w-[120px] shrink-0 rounded-control border p-1", img.approved ? "border-success ring-1 ring-success" : "border-line")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {urls[img.key] ? <img src={urls[img.key]} alt="" className="aspect-[9/16] w-full rounded bg-subtle object-cover" /> : <div className="aspect-[9/16] rounded bg-subtle" />}
          <div className="mt-1 flex items-center gap-1">
            <Button size="sm" variant={img.approved ? "primary" : "secondary"} icon={Check} className="h-7 flex-1 px-1 text-[11px]" onClick={() => onChange(list.map((x) => ({ ...x, approved: x.id === img.id })))}>
              {img.approved ? "사용 중" : "이걸로"}
            </Button>
            <button type="button" aria-label="이미지 지우기" className="p-1 text-fg-subtle hover:text-danger" onClick={() => window.confirm("이 이미지를 지울까요?") && onChange(list.map((x) => (x.id === img.id ? ({ ...x, removed: true } as FashionImage) : x)))}>
              <Trash2 className="size-3.5" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * v0.9.169 POV 문구 자리 정하기: 룩 사진(9:16) 위에서 문구 상자를 끌어다 놓는다 (놓을 때 저장).
 * 릴스와 피드 표지 모두 같은 자리 (피드 표지는 4:5 라 위아래가 잘린 만큼 맞춰 그린다)
 */
function PovPlacer({ text, photo, pos, onChange }: { text: string; photo: string | null; pos: { x: number; y: number } | null | undefined; onChange: (pos: { x: number; y: number } | null) => void }) {
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const cur = drag ?? pos ?? { x: 0.5, y: 0.13 };
  const at = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const c = (n: number) => Math.min(0.95, Math.max(0.05, n));
    return { x: c((e.clientX - r.left) / r.width), y: c((e.clientY - r.top) / r.height) };
  };
  return (
    <div className="flex flex-wrap items-start gap-3" data-fashion-pov-pos>
      <div
        className="relative aspect-[9/16] w-[180px] shrink-0 cursor-crosshair touch-none select-none overflow-hidden rounded-control border border-line bg-subtle"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          setDrag(at(e));
        }}
        onPointerMove={(e) => drag && setDrag(at(e))}
        onPointerUp={(e) => {
          const next = at(e);
          setDrag(null);
          onChange(next);
        }}
        aria-label="POV 문구 자리 (눌러서 끌기)"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {photo ? <img src={photo} alt="" draggable={false} className="size-full object-cover" /> : <span className="absolute inset-0 flex items-center justify-center p-3 text-center text-[11px] text-fg-subtle">룩 이미지를 고르면 사진 위에서 볼 수 있어요</span>}
        <span
          className="pointer-events-none absolute max-w-[80%] -translate-x-1/2 -translate-y-1/2 rounded bg-white/95 px-1.5 py-0.5 text-center text-[8.5px] leading-tight font-semibold text-[#111] shadow"
          style={{ left: `${cur.x * 100}%`, top: `${cur.y * 100}%` }}
        >
          {text || "POV 문구"}
        </span>
      </div>
      <div className="min-w-0 flex-1 space-y-1.5 text-[12px] text-fg-muted">
        <p>사진 위를 누르거나 끌어서 문구 자리를 정하세요. 모델 얼굴을 피해 두면 됩니다. 놓으면 바로 저장되고, 릴스와 피드 표지에 같이 들어갑니다.</p>
        <div className="flex flex-wrap gap-1.5">
          {[
            { label: "위", y: 0.08 },
            { label: "가운데", y: 0.5 },
            { label: "아래", y: 0.7 },
          ].map((o) => (
            <Button key={o.label} size="sm" variant="secondary" onClick={() => onChange({ x: 0.5, y: o.y })}>
              {o.label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" disabled={!pos} onClick={() => onChange(null)}>
            기본 자리로
          </Button>
        </div>
      </div>
    </div>
  );
}

/** v0.9.181 룩마다 추가 이미지 (피드용·플랫레이·벽에 건 코디·언박싱 컷) — 같은 모양의 블록 */
type ExtraKind = "feedlook" | "flatlook" | "unboxlook";
const EXTRA_FIELD: Record<ExtraKind, "feedImages" | "flatImages" | "unboxImages"> = { feedlook: "feedImages", flatlook: "flatImages", unboxlook: "unboxImages" };
function ExtraImages({ ctl, kind, title, hint, empty, onAsk }: { ctl: FashionCtl; kind: ExtraKind; title: string; hint: string; empty: string; onAsk: (a: { jobs: ImageJob[]; title: string }) => void }) {
  const p = ctl.project!;
  const field = EXTRA_FIELD[kind];
  const ready = p.looks.filter((l) => approvedOf(l.images));
  const busy = p.tasks.some((t) => t.target.type === kind && (t.status === "generating" || t.status === "requesting"));
  const todo = ready.filter((l) => !approvedOf(l[field] ?? []));
  const fails = p.tasks.filter((t) => t.target.type === kind && t.status === "fail").slice(-2);
  return (
    <div className="space-y-1.5 rounded border border-line bg-subtle/40 p-2" data-fashion-extra={kind}>
      <p className="text-[12px] text-fg-muted">
        <b className="text-fg">{title}</b> — {hint} 룩 1개 = 약 {IMAGE_CREDITS}크레딧(≈ $0.02).
      </p>
      <Button size="sm" variant="secondary" icon={Sparkles} disabled={!todo.length || Boolean(ctl.busy) || busy} onClick={() => onAsk({ jobs: todo.map((l) => ({ target: { type: kind, lookId: l.id } })), title: `${title} ${todo.length}개 만들기` })} data-make-extra={kind}>
        {busy ? "만드는 중… (자동 확인)" : todo.length ? `${title} 만들기 (${todo.length}개)` : `모든 룩에 ${title} 있음`}
      </Button>
      {fails.map((t) => (
        <p key={t.id} className="text-[11.5px] text-danger">
          실패: {t.error}
        </p>
      ))}
      {ready.map((l) => (
        <div key={l.id} className="flex items-start gap-2">
          <span className="w-14 shrink-0 pt-1 text-[11.5px] font-medium text-fg-muted">{l.name}</span>
          <div className="min-w-0 flex-1">
            <ImageStrip list={l[field] ?? []} urls={ctl.urls} empty={empty} onChange={(next) => ctl.edit("looks", p.looks.map((x) => (x.id === l.id ? { ...x, [field]: next } : x)))} />
          </div>
          <Button size="sm" variant="ghost" disabled={Boolean(ctl.busy) || busy} onClick={() => onAsk({ jobs: [{ target: { type: kind, lookId: l.id } }], title: `${l.name} ${title} 만들기` })}>
            {l[field]?.length ? "다시" : "만들기"}
          </Button>
        </div>
      ))}
    </div>
  );
}

export function FashionEditor({ ctl }: { ctl: FashionCtl }) {
  const p = ctl.project!;
  const s = p.settings;
  const [ask, setAsk] = useState<{ jobs: ImageJob[]; title: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [libOpen, setLibOpen] = useState(false);
  const setSettings = (patch: Partial<FashionSettings>) => ctl.edit("settings", { ...s, ...patch });
  // POV 자리 미리보기: 첫 완성 룩 → 없으면 모델 사진
  const povPhoto = p.looks.map((l) => approvedOf(l.images)?.key).find(Boolean) ?? approvedOf(p.model.images)?.key ?? null;
  const running = (pred: (t: (typeof p.tasks)[number]) => boolean) => p.tasks.filter((t) => pred(t) && (t.status === "generating" || t.status === "requesting"));
  const failed = (pred: (t: (typeof p.tasks)[number]) => boolean) => p.tasks.filter((t) => pred(t) && t.status === "fail").slice(-3);
  const modelReady = Boolean(approvedOf(p.model.images));

  async function upload(files: File[], kind: "image" | "audio" | "video", target: Record<string, unknown>) {
    setUploading(true);
    try {
      await ctl.flush();
      for (const f of files) ctl.apply(await ctl.enqueue(() => fashionApi.upload(p.id, f, kind, target)));
    } catch (e) {
      ctl.setError(e instanceof Error ? e.message : "올리지 못했습니다.");
    } finally {
      setUploading(false);
    }
  }
  async function makeImages() {
    if (!ask) return;
    const jobs = ask.jobs;
    setAsk(null);
    await ctl.run("이미지 만들기", () => fashionApi.images(p.id, { jobs, clientRequestId: newRequestId() }));
  }
  const setLooks = (looks: FashionLook[]) => ctl.edit("looks", looks);
  const setLook = (id: string, patch: Partial<FashionLook>) => setLooks(p.looks.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const lookTasks = (lookId: string) => (t: (typeof p.tasks)[number]) => t.target.type === "look" && t.target.lookId === lookId;
  const todoLooks = p.looks.filter((l) => l.itemIds.length && !approvedOf(l.images) && !running(lookTasks(l.id)).length);

  return (
    <div className="space-y-6">
      {ctl.error && <Notice tone="warning">{ctl.error}</Notice>}

      {/* ① 상품 */}
      <SectionCard
        title={`① 상품 · ${p.items.length}개`}
        icon={Shirt}
        description="쿠팡 상품 사진을 올리고(여러 장 한 번에) 이름·종류·쿠팡 링크를 적어 주세요. 이미 학습한 쿠팡 상품은 [제품 라이브러리에서]로 가져옵니다 (쿠팡 호출 없음). 사진은 룩 이미지를 만들 때 '이 옷 그대로' 참고 이미지로 들어갑니다."
        actions={
          <span className="flex flex-wrap gap-1.5">
            <UploadButton accept="image/png,image/jpeg,image/webp" multiple disabled={uploading} onFiles={(f) => void upload(f, "image", { type: "item" })}>
              상품 사진 올리기
            </UploadButton>
            <Button size="sm" variant="secondary" icon={Library} onClick={() => setLibOpen(true)} data-fashion-library>
              제품 라이브러리에서
            </Button>
          </span>
        }
        data-fashion-items
      >
        {!p.items.length ? (
          <p className="text-[13px] text-fg-subtle">상품 사진(배경이 깨끗한 제품컷이 가장 좋아요)을 올리면 상품이 하나씩 생깁니다.</p>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {p.items.map((it) => (
              <div key={it.id} className="flex gap-2.5 rounded-control border border-line p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {it.imageKey && ctl.urls[it.imageKey] ? <img src={ctl.urls[it.imageKey]} alt="" className="h-24 w-20 shrink-0 rounded bg-subtle object-contain" /> : <div className="flex h-24 w-20 shrink-0 items-center justify-center rounded bg-subtle text-[11px] text-fg-subtle">사진 없음</div>}
                <div className="min-w-0 flex-1 space-y-1">
                  <Input value={it.name} onChange={(e) => ctl.edit("items", p.items.map((x) => (x.id === it.id ? { ...x, name: e.target.value } : x)))} className="h-8 text-[13px]" aria-label="상품 이름" />
                  <div className="flex gap-1">
                    <Select value={it.category} options={FASHION_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))} onChange={(e) => ctl.edit("items", p.items.map((x) => (x.id === it.id ? { ...x, category: e.target.value as FashionCategory } : x)))} className="h-8 w-24 text-[12px]" aria-label="종류" />
                    <Input value={it.sourceUrl} onChange={(e) => ctl.edit("items", p.items.map((x) => (x.id === it.id ? { ...x, sourceUrl: e.target.value } : x)))} placeholder="https://www.coupang.com/…" className="h-8 min-w-0 flex-1 text-[12px]" aria-label="쿠팡 링크" />
                  </div>
                  <div className="flex gap-1">
                    <UploadButton accept="image/png,image/jpeg,image/webp" variant="ghost" disabled={uploading} onFiles={(f) => void upload(f.slice(0, 1), "image", { type: "item", itemId: it.id })}>
                      사진 바꾸기
                    </UploadButton>
                    <Button size="sm" variant="ghost" icon={Trash2} onClick={() => window.confirm(`'${it.name}'을 뺄까요? 룩에서도 빠집니다.`) && ctl.edit("items", p.items.filter((x) => x.id !== it.id))}>
                      빼기
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ② 모델 */}
      <SectionCard
        title="② 모델"
        icon={UserRound}
        description="모든 룩의 얼굴 기준이 되는 모델 1명을 정합니다. AI 모델은 설명대로 새로 만들고, 실제 사진은 분위기·머리·체형만 참고해 '살짝 다른 얼굴'로 만듭니다. 마음에 드는 1장을 [이걸로] 고르면 모든 룩에 같은 얼굴로 들어갑니다."
        data-fashion-model
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <div className="space-y-2.5">
            <SegmentedControl value={p.model.mode} onChange={(v) => ctl.edit("model", { ...p.model, mode: v as "ai" | "photo" })} options={[{ value: "ai", label: "AI 모델" }, { value: "photo", label: "실제 사진 → 살짝 다르게" }]} />
            <label className="block space-y-1">
              <span className="text-[12px] font-medium text-fg-muted">모델 설명 (비우면 20대 초반 한국 여성 모델, 긴 웨이브 머리)</span>
              <Textarea value={p.model.description} onChange={(e) => ctl.edit("model", { ...p.model, description: e.target.value })} rows={3} placeholder="예: 30대 초반 한국 여성, 단발 C컬, 슬림, 차분하고 세련된 분위기" />
            </label>
            {p.model.mode === "photo" && (
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p.model.photoKey && ctl.urls[p.model.photoKey] && <img src={ctl.urls[p.model.photoKey]} alt="참고 사진" className="h-20 w-16 rounded object-cover" />}
                <UploadButton accept="image/png,image/jpeg,image/webp" disabled={uploading} onFiles={(f) => void upload(f.slice(0, 1), "image", { type: "model-photo" })}>
                  {p.model.photoKey ? "참고 사진 바꾸기" : "참고할 실제 사진 올리기"}
                </UploadButton>
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">
              <Button variant="primary" icon={Sparkles} disabled={Boolean(ctl.busy) || running((t) => t.target.type === "model").length > 0 || (p.model.mode === "photo" && !p.model.photoKey)} onClick={() => setAsk({ jobs: [{ target: { type: "model" } }], title: "모델 기준 이미지 만들기" })} data-make-model>
                {running((t) => t.target.type === "model").length ? "만드는 중…" : "모델 이미지 만들기"}
              </Button>
              <UploadButton accept="image/png,image/jpeg,image/webp" variant="ghost" disabled={uploading} onFiles={(f) => void upload(f.slice(0, 1), "image", { type: "model" })}>
                모델 이미지 직접 올리기
              </UploadButton>
            </div>
            {failed((t) => t.target.type === "model").map((t) => (
              <p key={t.id} className="text-[12px] text-danger">
                실패: {t.error}
              </p>
            ))}
          </div>
          <ImageStrip list={p.model.images} urls={ctl.urls} onChange={(images) => ctl.edit("model", { ...p.model, images })} empty="아직 모델 이미지가 없습니다. 1장 만들어 보고 마음에 들 때까지 다시 만들 수 있습니다 (1장 = 4크레딧 ≈ $0.02)." />
        </div>
      </SectionCard>

      {/* ③ 배경·문구 */}
      <SectionCard title="③ 콘텐츠 유형 · 배경·문구" icon={Palette} description="먼저 릴스·피드 유형을 고르면 룩 이미지 구도·포즈·배경, 화면 글자 배치, 컷 전환, AI 영상 동작이 그 유형에 맞게 바뀝니다 (레퍼런스 12종 분석). 그다음 [AI 로 문구 쓰기]도 유형에 맞게 씁니다." data-fashion-copy>
        <div className="mb-3 grid gap-3 md:grid-cols-2" data-fashion-format>
          <label className="block space-y-1">
            <span className="text-[12px] font-medium text-fg-muted">릴스 유형</span>
            <Select
              value={s.format ?? "lookbook"}
              options={REEL_FORMATS.map((x) => ({ value: x.value, label: x.label }))}
              onChange={(e) => {
                const fmt = reelFormatOf(e.target.value);
                setSettings({
                  format: fmt.value,
                  background: fmt.background ?? s.background,
                  secPerLook: fmt.secPerLook ?? s.secPerLook,
                  ...(fmt.clip ? { reelStyle: "b" as const, clipConcept: fmt.value === "walking" ? "walkout" : "review" } : {}),
                });
              }}
              aria-label="릴스 유형"
            />
            <span className="block text-[11.5px] text-fg-subtle">{reelFormatOf(s.format).hint}{reelFormatOf(s.format).character ? " · ② 모델을 이 유형으로 다시 만들어 주세요 (캐릭터 얼굴)" : ""}</span>
          </label>
          <label className="block space-y-1">
            <span className="text-[12px] font-medium text-fg-muted">피드 유형</span>
            <Select value={s.feedFormat ?? "card"} options={FEED_FORMATS.map((x) => ({ value: x.value, label: x.label }))} onChange={(e) => setSettings({ feedFormat: e.target.value })} aria-label="피드 유형" />
            <span className="block text-[11.5px] text-fg-subtle">{feedFormatOf(s.feedFormat).hint}</span>
          </label>
          {reelFormatOf(s.format).overlay.bodyLine && <Input value={s.bodyLine ?? ""} onChange={(e) => setSettings({ bodyLine: e.target.value })} placeholder="위쪽 고정 체형 줄 (예: 171cm 81kg)" aria-label="체형 줄" />}
          {reelFormatOf(s.format).overlay.noteLine && <Input value={s.noteLine ?? ""} onChange={(e) => setSettings({ noteLine: e.target.value })} placeholder="POV 아래 작은 안내 (예: 프로필링크에 5%할인쿠폰)" aria-label="작은 안내" />}
          {(s.feedFormat === "flatTitle" || s.feedFormat === "flatlay") && (
            <>
              {s.feedFormat === "flatTitle" && <Input value={s.coverTag ?? ""} onChange={(e) => setSettings({ coverTag: e.target.value })} placeholder="표지 태그 (예: 2~3만원대)" aria-label="표지 태그" />}
              <Input value={s.coverSub ?? ""} onChange={(e) => setSettings({ coverSub: e.target.value })} placeholder="표지 작은 줄 (예: 편안함과 멋, 둘 다 챙긴 데일리 출근룩!)" aria-label="표지 작은 줄" />
            </>
          )}
          {s.feedFormat === "cardLabel" && (
            <>
              <Input value={s.brand ?? ""} onChange={(e) => setSettings({ brand: e.target.value })} placeholder="아래 브랜드 이름 (선택, 영문)" aria-label="브랜드" />
              <Input value={s.script ?? ""} onChange={(e) => setSettings({ script: e.target.value })} placeholder="손글씨 한 줄 (기본: for a better day)" aria-label="손글씨" />
            </>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-[12px] font-medium text-fg-muted">주제</span>
            <Input value={s.theme} onChange={(e) => setSettings({ theme: e.target.value })} />
          </label>
          <label className="block space-y-1">
            <span className="text-[12px] font-medium text-fg-muted">배경 (모든 룩 같은 배경)</span>
            <Select value={s.background} options={[...BACKGROUNDS.map((b) => ({ value: b.id, label: b.label })), { value: "custom", label: "직접 쓰기" }]} onChange={(e) => setSettings({ background: e.target.value })} aria-label="배경" />
          </label>
          {s.background === "custom" && <Input value={s.backgroundText} onChange={(e) => setSettings({ backgroundText: e.target.value })} placeholder="예: 벽돌 벽 앞 골목, 오후 햇빛 (영어로 쓰면 더 정확해요)" className="md:col-span-2" />}
          <label className="block space-y-1 md:col-span-2">
            <span className="text-[12px] font-medium text-fg-muted">위쪽 고정 문구 (POV)</span>
            <Input value={s.pov} onChange={(e) => setSettings({ pov: e.target.value })} placeholder="POV: 퇴근한 순간부터 연휴 즐기려고 꾸꾸꾸 상태로 출근한 나" data-fashion-pov />
          </label>
          <div className="space-y-1 md:col-span-2">
            <span className="text-[12px] font-medium text-fg-muted">POV 문구 자리</span>
            <PovPlacer text={s.pov || p.title} photo={povPhoto ? (ctl.urls[povPhoto] ?? null) : null} pos={s.povPos} onChange={(povPos) => setSettings({ povPos })} />
          </div>
          <label className="block space-y-1 md:col-span-2">
            <span className="text-[12px] font-medium text-fg-muted">마지막 안내 (댓글 링크)</span>
            <Input value={s.cta} onChange={(e) => setSettings({ cta: e.target.value })} />
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Button variant="primary" icon={Wand2} disabled={!p.items.length || Boolean(ctl.busy)} loading={ctl.busy === "AI 문구"} onClick={() => void ctl.run("AI 문구", () => fashionApi.action(p.id, "copy", { regroup: !p.looks.length }))} data-fashion-ai-copy>
            {p.looks.length ? "AI 로 문구 쓰기 (룩 묶음은 그대로)" : "AI 로 문구 쓰기 + 룩 묶기"}
          </Button>
          {p.looks.length > 0 && (
            <Button variant="ghost" disabled={!p.items.length || Boolean(ctl.busy)} onClick={() => window.confirm("룩 묶음을 AI 가 새로 짭니다 (만든 룩 이미지는 순서대로 남습니다). 계속할까요?") && void ctl.run("AI 문구", () => fashionApi.action(p.id, "copy", { regroup: true }))}>
              룩 묶음도 새로
            </Button>
          )}
          <span className="self-center text-[12px] text-fg-subtle">AI 글 1회</span>
        </div>
      </SectionCard>

      {/* ④ 룩 */}
      <SectionCard
        title={`④ 룩 · ${p.looks.length}개`}
        icon={ImageIcon}
        description="룩마다 입힐 상품을 고르고 이미지를 만듭니다. 같은 모델·같은 배경·같은 카메라로 옷만 바뀌게 (참고 이미지: 모델 1장 + 그 룩의 상품 사진). 레퍼런스는 룩 3~6개."
        actions={
          <span className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="secondary" icon={Plus} disabled={p.looks.length >= 10} onClick={() => setLooks([...p.looks, { id: newFashionId("lk"), name: `LOOK ${p.looks.length + 1}`, itemIds: [], caption: "", pose: "", images: [] }])}>
              룩 추가
            </Button>
            <Button size="sm" variant="primary" icon={Sparkles} disabled={!todoLooks.length || !modelReady || Boolean(ctl.busy)} onClick={() => setAsk({ jobs: todoLooks.map((l) => ({ target: { type: "look", lookId: l.id } })), title: `이미지 없는 룩 ${todoLooks.length}개 만들기` })} data-make-looks>
              이미지 없는 룩 모두 만들기 ({todoLooks.length})
            </Button>
          </span>
        }
        data-fashion-looks
      >
        {!modelReady && <Notice tone="info">② 모델에서 기준 이미지를 1장 고르면 룩 이미지를 만들 수 있습니다 (모든 룩이 같은 얼굴).</Notice>}
        {!p.looks.length ? (
          <p className="mt-2 text-[13px] text-fg-subtle">③의 [AI 로 문구 쓰기 + 룩 묶기]를 누르면 상품을 룩 3~6개로 묶어 줍니다. 직접 [룩 추가]도 됩니다.</p>
        ) : (
          <div className="mt-2 space-y-3">
            {p.looks.map((l, i) => (
              <div key={l.id} className="grid gap-3 rounded-control border border-line p-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]" data-fashion-look>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="brand">LOOK {i + 1}</Badge>
                    <Input value={l.caption} onChange={(e) => setLook(l.id, { caption: e.target.value })} placeholder="한 줄 설명 (예: 하객룩은 차분하게)" className="h-8 min-w-[180px] flex-1 text-[13px]" aria-label="한 줄 설명" />
                    <Button size="sm" variant="ghost" icon={Trash2} aria-label="룩 지우기" onClick={() => window.confirm(`LOOK ${i + 1}을 지울까요?`) && setLooks(p.looks.filter((x) => x.id !== l.id))} />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {p.items.map((it) => {
                      const on = l.itemIds.includes(it.id);
                      return (
                        <button key={it.id} type="button" onClick={() => setLook(l.id, { itemIds: on ? l.itemIds.filter((x) => x !== it.id) : [...l.itemIds, it.id] })} className={cn("flex items-center gap-1 rounded-full py-0.5 pl-0.5 pr-2 text-[11.5px] ring-1 ring-inset", on ? "bg-brand-soft text-brand ring-brand/40" : "text-fg-subtle ring-line hover:bg-subtle")}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {it.imageKey && ctl.urls[it.imageKey] ? <img src={ctl.urls[it.imageKey]} alt="" className="size-5 rounded-full object-cover" /> : <span className="size-5" />}
                          {categoryLabel(it.category)} · {it.name.slice(0, 14)}
                        </button>
                      );
                    })}
                  </div>
                  <Input value={l.pose} onChange={(e) => setLook(l.id, { pose: e.target.value })} placeholder="자세 (비우면 자연스럽게 정면, 가방끈 살짝 잡기)" className="h-8 text-[12.5px]" aria-label="자세" />
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Button size="sm" variant="secondary" icon={Sparkles} disabled={!l.itemIds.length || !modelReady || Boolean(ctl.busy) || running(lookTasks(l.id)).length > 0} onClick={() => setAsk({ jobs: [{ target: { type: "look", lookId: l.id } }], title: `LOOK ${i + 1} 이미지 만들기` })}>
                      {running(lookTasks(l.id)).length ? "만드는 중…" : l.images.length ? "다시 만들기" : "이미지 만들기"}
                    </Button>
                    <UploadButton accept="image/png,image/jpeg,image/webp" variant="ghost" disabled={uploading} onFiles={(f) => void upload(f.slice(0, 1), "image", { type: "look", lookId: l.id })}>
                      직접 올리기
                    </UploadButton>
                    {failed(lookTasks(l.id)).map((t) => (
                      <span key={t.id} className="text-[12px] text-danger">
                        실패: {t.error}
                      </span>
                    ))}
                  </div>
                </div>
                <ImageStrip list={l.images} urls={ctl.urls} onChange={(images) => setLook(l.id, { images })} empty="아직 이미지가 없습니다." />
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ⑤ 결과물 */}
      <Outputs ctl={ctl} uploading={uploading} upload={upload} onAsk={setAsk} />

      <CostConfirm
        open={Boolean(ask)}
        title={ask?.title ?? ""}
        items={ask ? [{ label: "Nano Banana 이미지 (9:16)", count: ask.jobs.length, credits: ask.jobs.length * IMAGE_CREDITS }] : []}
        notes={["이미지 1장 = Kie 요청 1번. 같은 요청은 두 번 보내지 않고, 자동으로 다시 보내지 않습니다."]}
        onCancel={() => setAsk(null)}
        onConfirm={() => void makeImages()}
        busy={ctl.busy === "이미지 만들기"}
      />
      <LibraryPicker open={libOpen} onClose={() => setLibOpen(false)} onPick={(productId, category) => void ctl.run("가져오기", () => fashionApi.action(p.id, "import-product", { productId, category }))} />
    </div>
  );
}

function Outputs({ ctl, uploading, upload, onAsk }: { ctl: FashionCtl; uploading: boolean; upload: (f: File[], kind: "image" | "audio" | "video", target: Record<string, unknown>) => Promise<void>; onAsk: (a: { jobs: ImageJob[]; title: string }) => void }) {
  // 멈춤 판단용 지금 시각 (1분마다 새로)
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const p = ctl.project!;
  const s = p.settings;
  const ready = p.looks.filter((l) => approvedOf(l.images));
  const feedFmt = feedFormatOf(s.feedFormat);
  const reelFmt = reelFormatOf(s.format);
  // v0.9.120: 피드·릴스는 서로 막지 않는다 (피드 없이 릴스만 만들어도 됨)
  // v0.9.170 끊겨서 '만드는 중'으로 멈춘 결과물은 막지 않는다 (서버와 같은 15분 기준)
  const live = (r: (typeof p.renders)[number]) => r.status === "running" && now - Date.parse(r.updatedAt) < FASHION_STALE_RENDER_MS;
  const renderingOf = (kind: "feed" | "reels") => p.renders.some((r) => r.kind === kind && live(r));
  const rendering = renderingOf("feed") && renderingOf("reels");
  return (
    <SectionCard title="⑤ 결과물 — 피드·릴스" icon={Clapperboard} description={`이미지를 고른 룩 ${ready.length}개로 만듭니다 (외부 유료 호출 없음). 피드 = 표지 + 룩마다 '착용 사진 + 제품 사진' 카드(4:5) · 릴스 = 룩마다 ${s.secPerLook}초, 위쪽 POV 고정, 마지막 댓글 안내.`} data-fashion-output>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2 rounded-control border border-line p-3">
          <p className="text-[13px] font-semibold">피드 카드</p>
          <p className="text-[12px] text-fg-muted">유형: <b>{feedFmt.label}</b> — {feedFmt.hint} (③에서 바꿈)</p>
          {feedFmt.image === "look" ? (
            <ExtraImages ctl={ctl} kind="feedlook" title="피드용 이미지" hint="룩 이미지를 그대로 두고 배경만 밝은 무지로 바꿔, 카드에 오려 붙인 것처럼 들어갑니다. 없으면 룩 이미지를 그대로 씁니다." empty="아직 없음 (룩 이미지로 들어감)" onAsk={onAsk} />
          ) : (
            <ExtraImages
              ctl={ctl}
              kind="flatlook"
              title={feedFmt.image === "hanging" ? "벽에 건 코디 이미지" : "플랫레이 이미지"}
              hint={feedFmt.image === "hanging" ? "모델 없이 이 룩의 제품 사진으로 '벽에 건 코디'를 만듭니다 (위쪽에 색 칩이 들어감)." : "모델 없이 이 룩의 제품 사진을 바닥에 펼쳐 놓은 코디 사진을 만듭니다 (모든 장 같은 바닥·빛)."}
              empty="아직 없음 (룩 이미지로 들어감)"
              onAsk={onAsk}
            />
          )}
          {feedFmt.value === "palette" && (
            <div className="flex flex-wrap gap-2 text-[11.5px]" data-fashion-colors>
              {ready.map((l) => (
                <span key={l.id} className="flex items-center gap-1 rounded border border-line px-1.5 py-1">
                  {l.name}
                  {(l.colors ?? []).map((c) => (
                    <span key={c.hex + c.name} className="flex items-center gap-0.5">
                      <span className="size-3 rounded-sm ring-1 ring-line" style={{ background: c.hex }} />
                      {c.name}
                    </span>
                  ))}
                  {!l.colors?.length && <span className="text-fg-subtle">색 없음 — ③ AI 로 문구 쓰기</span>}
                </span>
              ))}
            </div>
          )}
          <Button variant="primary" icon={ImageIcon} disabled={!ready.length || renderingOf("feed") || Boolean(ctl.busy)} onClick={() => void ctl.run("피드 만들기", () => fashionApi.render(p.id, "feed"))} data-render-feed>
            피드 만들기 ({feedFmt.value === "card" ? ready.length + (ready.length ? 1 : 0) : ready.length}장)
          </Button>
        </div>
        <div className="space-y-2 rounded-control border border-line p-3">
          <p className="text-[13px] font-semibold">릴스</p>
          <p className="text-[12px] text-fg-muted">유형: <b>{reelFmt.label}</b> — {reelFmt.hint} (③에서 바꿈)</p>
          {reelFmt.unbox && <ExtraImages ctl={ctl} kind="unboxlook" title="언박싱 컷" hint="이 룩의 대표 제품을 손으로 꺼내 펼쳐 보여 주는 컷을 만들어, 룩 앞에 넣습니다." empty="아직 없음 (언박싱 컷 없이 룩만)" onAsk={onAsk} />}
          <SegmentedControl value={s.reelStyle} onChange={(v) => ctl.edit("settings", { ...s, reelStyle: v as "a" | "b" })} options={[{ value: "a", label: "(가) 사진 + 움직임 · 무료" }, { value: "b", label: "(나) AI 영상 · 룩마다 약 $0.16" }]} />
          <ConceptPicker ctl={ctl} />
          {s.reelStyle === "b" && <LookClips ctl={ctl} upload={upload} uploading={uploading} />}
          <ReelVoice ctl={ctl} />
          <div className="flex flex-wrap items-center gap-2">
            <Select value={String(s.secPerLook)} options={[1.5, 2, 2.5, 3].map((x) => ({ value: String(x), label: `룩마다 ${x}초` }))} onChange={(e) => ctl.edit("settings", { ...s, secPerLook: Number(e.target.value) })} className="h-9 w-32" aria-label="룩 길이" />
            <Button variant="primary" icon={Clapperboard} disabled={!ready.length || renderingOf("reels") || Boolean(ctl.busy)} onClick={() => void ctl.run("릴스 만들기", () => fashionApi.render(p.id, "reels"))} data-render-reels>
              릴스 만들기 (약 {Math.round(ready.length * s.secPerLook + 2.5)}초)
            </Button>
          </div>
          <p className="text-[12px] text-fg-subtle" data-fashion-no-music>음악은 넣지 않습니다{s.voice?.on ? " (AI 내레이션만 들어감)" : " (소리 없는 영상)"}. 인스타·쇼츠에 올릴 때 앱의 음악을 고르세요.</p>
        </div>
      </div>
      {p.renders.length > 0 && (
        <div className="mt-4 space-y-3" data-fashion-renders>
          <div className="flex justify-end">
            <Button size="sm" variant="danger" icon={Trash2} disabled={rendering || Boolean(ctl.busy)} onClick={() => window.confirm("만든 결과물을 모두 지울까요? (파일도 지웁니다)") && void ctl.run("지우기", () => fashionApi.action(p.id, "delete-render", { all: true }))}>
              결과물 모두 지우기
            </Button>
          </div>
          {[...p.renders].reverse().map((r) => (
            <div key={r.id} className="rounded-control border border-line p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px]">
                <span className="font-semibold">{r.kind === "feed" ? "피드 카드" : "릴스"}</span>
                <Badge tone={r.status === "success" ? "success" : r.status === "fail" || !live(r) ? "danger" : "info"}>{r.status === "success" ? "완료" : r.status === "fail" ? "실패" : live(r) ? "만드는 중" : "멈춤 (다시 만들어 주세요)"}</Badge>
                {r.totalSec != null && <span className="text-fg-muted">{r.totalSec}초</span>}
                <span className="text-fg-subtle">{formatRelative(r.createdAt)}</span>
                {!live(r) && (
                  <Button size="sm" variant="ghost" icon={Trash2} className="ml-auto" onClick={() => window.confirm("이 결과물을 지울까요?") && void ctl.run("지우기", () => fashionApi.action(p.id, "delete-render", { renderId: r.id }))}>
                    지우기
                  </Button>
                )}
              </div>
              {r.error && <p className="text-[12px] text-danger">{r.error}</p>}
              {r.kind === "reels" && r.keys[0] && ctl.urls[r.keys[0]] && (
                <div className="flex flex-wrap items-end gap-3">
                  <video src={ctl.urls[r.keys[0]]} controls playsInline className="aspect-[9/16] max-h-[480px] rounded bg-black" />
                  <a href={ctl.urls[r.keys[0]]} download={`${p.title}_릴스.mp4`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[13px] text-brand hover:underline">
                    <Download className="size-4" /> MP4 다운로드
                  </a>
                </div>
              )}
              {r.kind === "feed" && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {r.keys.map((k, i) =>
                    ctl.urls[k] ? (
                      <a key={k} href={ctl.urls[k]} download={`${p.title}_피드_${i + 1}.png`} target="_blank" rel="noreferrer" className="w-[180px] shrink-0" title="눌러서 받기">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={ctl.urls[k]} alt={`피드 ${i + 1}`} className="aspect-[4/5] w-full rounded border border-line object-cover" />
                        <span className="mt-0.5 block text-center text-[11px] text-fg-subtle">{i === 0 ? "표지" : `LOOK ${i}`} · 받기</span>
                      </a>
                    ) : null,
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {p.tasks.some((t) => t.status === "generating" || t.status === "requesting") && (
        <p className="mt-3 text-[12px] text-fg-subtle">
          <Badge tone={taskTone("generating")}>{TASK_LABEL.generating}</Badge> Kie 작업 {p.tasks.filter((t) => t.status === "generating" || t.status === "requesting").length}개 — 8초마다 확인합니다 (무료).
        </p>
      )}
    </SectionCard>
  );
}

/** v0.9.193 영상 컨셉 고르기 — 항상 보이게 (전에는 (나) AI 영상을 골라야만 보여서 고를 방법이 없는 것처럼 보였다). 컨셉은 AI 영상 동작이라 고르면 (나)로 */
function ConceptPicker({ ctl }: { ctl: FashionCtl }) {
  const p = ctl.project!;
  const s = p.settings;
  const cur = s.clipConcept ?? "pose";
  return (
    <div className="space-y-1.5 rounded-control border border-line bg-subtle/40 p-2" data-clip-concept>
      <p className="text-[12px] text-fg-muted">
        <b className="text-fg">영상 컨셉</b> — 룩마다 AI 영상(나)에서 모델이 할 동작입니다.{s.reelStyle !== "b" ? " 고르면 (나) AI 영상으로 바뀝니다 (룩마다 약 $0.16, 만들 때 확인 창)." : ""}
      </p>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {CLIP_CONCEPTS.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={s.reelStyle === "b" && cur === c.id}
            onClick={() => ctl.edit("settings", { ...s, clipConcept: c.id, reelStyle: "b" })}
            className={cn("rounded-control px-2 py-1.5 text-left ring-1 ring-inset", s.reelStyle === "b" && cur === c.id ? "bg-brand-soft ring-brand-line" : "bg-surface ring-line hover:bg-subtle")}
          >
            <span className="block text-[12px] font-semibold">{s.reelStyle === "b" && cur === c.id ? "✓ " : ""}{c.label}</span>
            <span className="block text-[11px] leading-snug text-fg-subtle">{c.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** v0.9.193 릴스 AI 내레이션 — 목소리·말하기 속도·말 자막, 룩마다 내레이션 (비우면 룩 문구) */
function ReelVoice({ ctl }: { ctl: FashionCtl }) {
  const p = ctl.project!;
  const s = p.settings;
  const v: FashionVoice = s.voice ?? { on: false, ttsEngine: "openai", voice: "", voiceSpeed: 1.5, captions: true };
  const [opts, setOpts] = useState<VideoProductionOptions | null>(null);
  useEffect(() => {
    if (v.on && !opts) void api.videoProduction.options("youtube").then(setOpts).catch(() => undefined);
  }, [v.on, opts]);
  const set = (patch: Partial<FashionVoice>) => ctl.edit("settings", { ...s, voice: { ...v, ...patch } });
  const ready = p.looks.filter((l) => approvedOf(l.images));
  return (
    <div className="space-y-2 rounded-control border border-line p-2" data-fashion-voice>
      <label className="flex items-center gap-2 text-[12.5px] font-semibold">
        <input type="checkbox" checked={v.on} onChange={(e) => set({ on: e.target.checked })} className="accent-[var(--color-brand)]" />
        AI 내레이션 넣기 <span className="font-normal text-fg-subtle">(첫 컷 POV · 룩마다 한 줄 · 마지막 댓글 안내를 읽어 줌)</span>
      </label>
      {v.on && (
        <div className="space-y-2 text-[12.5px]">
          {!opts ? (
            <p className="text-fg-subtle">목소리 목록 준비 중…</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[12px] text-fg-muted">음성 엔진</span>
                <SegmentedControl size="sm" value={v.ttsEngine} onChange={(x) => set({ ttsEngine: x as FashionVoice["ttsEngine"], voice: "" })} options={[{ value: "openai", label: "OpenAI" }, { value: "typecast", label: "타입캐스트" }]} />
              </div>
              {v.ttsEngine === "typecast" ? (
                <TypecastVoicePicker channelId="youtube" ready={opts.ready.typecast} value={v.voice} onChange={(id) => set({ voice: id })} emotion={v.ttsEmotion ?? "normal"} onEmotion={(x) => set({ ttsEmotion: x })} emotions={opts.typecastEmotions} />
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select value={v.voice || opts.voices[0]?.value || ""} options={opts.voices.map((x) => ({ value: x.value, label: x.label }))} onChange={(e) => set({ voice: e.target.value })} aria-label="목소리" />
                  <Select value={v.voiceStyle ?? "shorts"} options={opts.voiceStyles} onChange={(e) => set({ voiceStyle: e.target.value })} aria-label="말투" />
                </div>
              )}
            </>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12px] text-fg-muted">말하기 속도 <span className="text-fg-subtle">(자막도 같이)</span></span>
            <SegmentedControl size="sm" value={String(v.voiceSpeed)} onChange={(x) => set({ voiceSpeed: Number(x) })} options={[1, 1.25, 1.5, 1.75, 2].map((x) => ({ value: String(x), label: x === 1 ? "보통" : `${x}배` }))} />
          </div>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={v.captions} onChange={(e) => set({ captions: e.target.checked })} className="accent-[var(--color-brand)]" />
            말하는 내용을 자막으로 (룩 문구 대신 아래쪽에, 말소리에 맞춰)
          </label>
          <div className="space-y-1">
            {ready.map((l) => (
              <div key={l.id} className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-[11.5px] font-medium text-fg-muted">{l.name}</span>
                <Input value={l.voiceLine ?? ""} onChange={(e) => ctl.edit("looks", p.looks.map((x) => (x.id === l.id ? { ...x, voiceLine: e.target.value } : x)))} placeholder={l.caption ? `비우면 룩 문구: ${l.caption}` : "이 룩 내레이션 (예: 하객룩은 차분하게)"} className="h-8 text-[12.5px]" aria-label={`${l.name} 내레이션`} />
              </div>
            ))}
          </div>
          <p className="text-[11.5px] text-fg-subtle">말이 룩 길이보다 길면 그 룩을 늘립니다 (최대 8초). 릴스를 만들 때마다 음성 AI 를 부릅니다 (줄마다 1번).</p>
        </div>
      )}
    </div>
  );
}

/** v0.9.120 릴스 (나): 룩마다 AI 영상 (Seedance 2.0 Mini 4초, 시작 화면 = 고른 룩 이미지) */
function LookClips({ ctl, upload, uploading }: { ctl: FashionCtl; upload: (f: File[], kind: "image" | "audio" | "video", target: Record<string, unknown>) => Promise<void>; uploading: boolean }) {
  const p = ctl.project!;
  const [ask, setAsk] = useState<string[] | null>(null);
  const ready = p.looks.filter((l) => approvedOf(l.images));
  const busyLook = (id: string) => p.tasks.some((t) => t.target.type === "lookclip" && t.target.lookId === id && (t.status === "generating" || t.status === "requesting"));
  const failOf = (id: string) => [...p.tasks].reverse().find((t) => t.target.type === "lookclip" && t.target.lookId === id && t.status === "fail");
  const todo = ready.filter((l) => !(l.clips ?? []).length && !busyLook(l.id));
  const setClips = (lookId: string, clips: NonNullable<FashionLook["clips"]>) => ctl.edit("looks", p.looks.map((l) => (l.id === lookId ? { ...l, clips } : l)));
  return (
    <div className="space-y-2 rounded-control border border-line p-2" data-look-clips>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" icon={Sparkles} disabled={!todo.length || Boolean(ctl.busy)} onClick={() => setAsk(todo.map((l) => l.id))} data-make-clips>
          영상 없는 룩 모두 만들기 ({todo.length}개 × 4초 ≈ ${"$"}{(todo.length * 4 * 8.2 * 0.005).toFixed(2)})
        </Button>
        <span className="text-[11.5px] text-fg-subtle">Seedance 2.0 Mini 720p · 룩 이미지에서 시작해 같은 얼굴·옷으로 움직임 · 영상이 없는 룩은 사진 + 움직임으로 들어갑니다</span>
      </div>
      <div className="grid gap-2" data-clip-note>
        <Input value={p.settings.clipNote ?? ""} onChange={(e) => ctl.edit("settings", { ...p.settings, clipNote: e.target.value })} placeholder="추가 요청 (모든 룩 공통, 한국어 가능) 예: 엘리베이터 문이 열리며 걸어 나옴, 밝게 웃기" aria-label="영상 추가 요청" />
        <p className="text-[11.5px] text-fg-subtle">컨셉: {CLIP_CONCEPTS.find((c) => c.id === (p.settings.clipConcept ?? "pose"))?.label} (위에서 바꿈) · 룩마다 아래 [이 룩 동작]에 적으면 그 룩만 그 동작으로 만듭니다.</p>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {ready.map((l) => {
          const clip = (l.clips ?? []).find((c) => c.approved) ?? (l.clips ?? [])[0];
          const fail = failOf(l.id);
          return (
            <div key={l.id} className="w-[130px] shrink-0 space-y-1 text-[11.5px]">
              <p className="font-medium">{l.name}</p>
              <Textarea value={l.clipMotion ?? ""} onChange={(e) => ctl.edit("looks", p.looks.map((x) => (x.id === l.id ? { ...x, clipMotion: e.target.value } : x)))} placeholder="이 룩 동작 (비우면 컨셉)" rows={2} className="min-h-0 text-[11px]" aria-label={`${l.name} 영상 동작`} />
              {clip && ctl.urls[clip.key] ? <video src={ctl.urls[clip.key]} muted loop autoPlay playsInline className="aspect-[9/16] w-full rounded bg-black object-cover" /> : <div className="flex aspect-[9/16] items-center justify-center rounded bg-subtle text-fg-subtle">{busyLook(l.id) ? "만드는 중…" : "영상 없음"}</div>}
              {(l.clips ?? []).length > 1 && (
                <Select value={clip?.id ?? ""} options={(l.clips ?? []).map((c, i) => ({ value: c.id, label: `버전 ${i + 1}` }))} onChange={(e) => setClips(l.id, (l.clips ?? []).map((c) => ({ ...c, approved: c.id === e.target.value })))} className="h-7 text-[11px]" aria-label="영상 버전" />
              )}
              <Button size="sm" variant="ghost" className="h-7 w-full px-1 text-[11px]" disabled={busyLook(l.id) || Boolean(ctl.busy)} onClick={() => setAsk([l.id])}>
                {(l.clips ?? []).length ? "다시 만들기" : "영상 만들기"}
              </Button>
              <UploadButton accept="video/mp4,video/quicktime,video/webm" disabled={uploading} onFiles={(f) => void upload(f.slice(0, 1), "video", { type: "lookclip", lookId: l.id })}>
                영상 직접 올리기
              </UploadButton>
              {fail && <p className="text-danger">실패: {fail.error}</p>}
            </div>
          );
        })}
      </div>
      <CostConfirm
        open={Boolean(ask)}
        title="룩 AI 영상 만들기"
        items={ask ? [{ label: "Seedance 2.0 Mini 720p 4초 (시작 화면 = 룩 이미지)", count: ask.length, credits: Math.round(ask.length * 4 * 8.2) }] : []}
        notes={["룩 1개 = Kie 요청 1번. 자동으로 다시 보내지 않습니다. 끝나면 8초마다 확인해 미리보기에 나옵니다."]}
        onCancel={() => setAsk(null)}
        onConfirm={() => {
          const ids = ask ?? [];
          setAsk(null);
          void ctl.run("룩 영상", () => fashionApi.clips(p.id, { lookIds: ids, clientRequestId: newRequestId() }));
        }}
        busy={ctl.busy === "룩 영상"}
      />
    </div>
  );
}

/** 제품 라이브러리(이미 학습한 상품)에서 가져오기 — 목록 읽기만 (외부 호출 없음) */
function LibraryPicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (productId: string, category: FashionCategory) => void }) {
  const [list, setList] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cat, setCat] = useState<FashionCategory>("top");
  const [q, setQ] = useState("");
  useEffect(() => {
    if (!open || list) return;
    let alive = true;
    api.products
      .list()
      .then((x) => alive && setList(x))
      .catch((e: Error) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [open, list]);
  // v0.9.135: 패션으로 분류한 제품만 (하나도 없으면 전체)
  const fashionOnly = (list ?? []).filter((x) => x.productGroup === "fashion");
  const shown = (fashionOnly.length ? fashionOnly : (list ?? [])).filter((x) => !q.trim() || x.name.includes(q.trim()));
  return (
    <Modal open={open} onClose={onClose} title="제품 라이브러리에서 가져오기" description="이미 학습한 쿠팡·스마트스토어 상품의 대표 사진·이름·링크를 가져옵니다 (쿠팡 호출 없음)." className="max-w-2xl">
      <div className="space-y-2">
        <div className="flex gap-2">
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="상품 이름으로 찾기" className="h-9 flex-1" />
          <Select value={cat} options={FASHION_CATEGORIES.map((c) => ({ value: c.value, label: `종류: ${c.label}` }))} onChange={(e) => setCat(e.target.value as FashionCategory)} className="h-9 w-32" aria-label="종류" />
        </div>
        {error && <Notice tone="warning">{error}</Notice>}
        {!list && !error && <p className="text-[13px] text-fg-subtle">불러오는 중…</p>}
        {list && !shown.length && <p className="text-[13px] text-fg-subtle">상품이 없습니다. 공통 도구 › 제품 상세페이지 학습에서 쿠팡 링크로 먼저 학습해 주세요.</p>}
        <ul className="max-h-[50vh] divide-y divide-line overflow-y-auto">
          {shown.map((x) => (
            <li key={x.id} className="flex items-center gap-2 py-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {x.imageUrl ? <img src={x.imageUrl} alt="" className="size-12 rounded object-cover" referrerPolicy="no-referrer" /> : <span className="size-12 rounded bg-subtle" />}
              <span className="min-w-0 flex-1 truncate text-[13px]">{x.name}</span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  onPick(x.id, cat);
                  onClose();
                }}
              >
                가져오기
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
