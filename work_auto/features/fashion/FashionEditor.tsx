"use client";

import { useEffect, useState } from "react";
import { Check, Clapperboard, Download, ImageIcon, Library, Music, Palette, Plus, Shirt, Sparkles, Trash2, UserRound, Wand2 } from "lucide-react";
import { Badge, Button, Input, Modal, Notice, SectionCard, SegmentedControl, Select, Textarea } from "@/components/ui";
import { api } from "@/lib/api-client";
import { approvedOf, BACKGROUNDS, categoryLabel, newFashionId } from "@/lib/fashion/prompts";
import { FASHION_CATEGORIES, type FashionCategory, type FashionImage, type FashionLook, type FashionSettings } from "@/lib/fashion/types";
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

export function FashionEditor({ ctl }: { ctl: FashionCtl }) {
  const p = ctl.project!;
  const s = p.settings;
  const [ask, setAsk] = useState<{ jobs: ImageJob[]; title: string } | null>(null);
  const [musicAsk, setMusicAsk] = useState(false);
  const [musicNote, setMusicNote] = useState("");
  const [uploading, setUploading] = useState(false);
  const [libOpen, setLibOpen] = useState(false);
  const setSettings = (patch: Partial<FashionSettings>) => ctl.edit("settings", { ...s, ...patch });
  const running = (pred: (t: (typeof p.tasks)[number]) => boolean) => p.tasks.filter((t) => pred(t) && (t.status === "generating" || t.status === "requesting"));
  const failed = (pred: (t: (typeof p.tasks)[number]) => boolean) => p.tasks.filter((t) => pred(t) && t.status === "fail").slice(-3);
  const modelReady = Boolean(approvedOf(p.model.images));

  async function upload(files: File[], kind: "image" | "audio", target: Record<string, unknown>) {
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
      <SectionCard title="③ 배경·문구" icon={Palette} description="레퍼런스처럼 영상 하나에 배경 1개, 위쪽에 끝까지 고정되는 POV 공감 한 줄, 마지막에 댓글 링크 안내가 들어갑니다." data-fashion-copy>
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
      <Outputs ctl={ctl} uploading={uploading} upload={upload} onMusic={() => setMusicAsk(true)} musicNote={musicNote} setMusicNote={setMusicNote} />

      <CostConfirm
        open={Boolean(ask)}
        title={ask?.title ?? ""}
        items={ask ? [{ label: "Nano Banana 이미지 (9:16)", count: ask.jobs.length, credits: ask.jobs.length * IMAGE_CREDITS }] : []}
        notes={["이미지 1장 = Kie 요청 1번. 같은 요청은 두 번 보내지 않고, 자동으로 다시 보내지 않습니다."]}
        onCancel={() => setAsk(null)}
        onConfirm={() => void makeImages()}
        busy={ctl.busy === "이미지 만들기"}
      />
      <CostConfirm
        open={musicAsk}
        title="AI 음악 만들기"
        items={[{ label: "Kie Suno V6 연주곡 (가사 없음, 보통 곡 2개)", count: 1, credits: null }]}
        notes={["버튼 1번 = Kie 요청 1번 (자동으로 다시 보내지 않습니다).", "실제 쓴 크레딧은 끝난 뒤 Kie 가 알려 주는 대로 남깁니다."]}
        onCancel={() => setMusicAsk(false)}
        onConfirm={() => {
          setMusicAsk(false);
          void ctl.run("음악 만들기", () => fashionApi.music(p.id, { note: musicNote, clientRequestId: newRequestId() }));
        }}
        busy={ctl.busy === "음악 만들기"}
      />
      <LibraryPicker open={libOpen} onClose={() => setLibOpen(false)} onPick={(productId, category) => void ctl.run("가져오기", () => fashionApi.action(p.id, "import-product", { productId, category }))} />
    </div>
  );
}

function Outputs({ ctl, uploading, upload, onMusic, musicNote, setMusicNote }: { ctl: FashionCtl; uploading: boolean; upload: (f: File[], kind: "image" | "audio", target: Record<string, unknown>) => Promise<void>; onMusic: () => void; musicNote: string; setMusicNote: (v: string) => void }) {
  const p = ctl.project!;
  const s = p.settings;
  const ready = p.looks.filter((l) => approvedOf(l.images));
  const rendering = p.renders.some((r) => r.status === "running");
  const musicBusy = p.tasks.some((t) => t.kind === "music" && (t.status === "generating" || t.status === "requesting"));
  const musicFail = p.tasks.filter((t) => t.kind === "music" && t.status === "fail").slice(-1);
  return (
    <SectionCard title="⑤ 결과물 — 피드·릴스" icon={Clapperboard} description={`이미지를 고른 룩 ${ready.length}개로 만듭니다 (외부 유료 호출 없음). 피드 = 표지 + 룩마다 '착용 사진 + 제품 사진' 카드(4:5) · 릴스 = 룩마다 ${s.secPerLook}초, 위쪽 POV 고정, 마지막 댓글 안내.`} data-fashion-output>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2 rounded-control border border-line p-3">
          <p className="text-[13px] font-semibold">피드 카드</p>
          <Button variant="primary" icon={ImageIcon} disabled={!ready.length || rendering || Boolean(ctl.busy)} onClick={() => void ctl.run("피드 만들기", () => fashionApi.render(p.id, "feed"))} data-render-feed>
            피드 카드 만들기 ({ready.length + (ready.length ? 1 : 0)}장)
          </Button>
        </div>
        <div className="space-y-2 rounded-control border border-line p-3">
          <p className="text-[13px] font-semibold">릴스</p>
          <SegmentedControl value={s.reelStyle} onChange={(v) => ctl.edit("settings", { ...s, reelStyle: v as "a" | "b" })} options={[{ value: "a", label: "(가) 사진 + 움직임 · 저렴" }, { value: "b", label: "(나) AI 영상 · 준비 중" }]} />
          {s.reelStyle === "b" && <p className="text-[12px] text-fg-subtle">(나)는 룩마다 Seedance 로 2~4초 움직이는 영상을 만들어 잇는 방식입니다. 다음 업데이트에서 열립니다.</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={String(s.secPerLook)} options={[1.5, 2, 2.5, 3].map((x) => ({ value: String(x), label: `룩마다 ${x}초` }))} onChange={(e) => ctl.edit("settings", { ...s, secPerLook: Number(e.target.value) })} className="h-9 w-32" aria-label="룩 길이" />
            <Button variant="primary" icon={Clapperboard} disabled={!ready.length || rendering || s.reelStyle === "b" || Boolean(ctl.busy)} onClick={() => void ctl.run("릴스 만들기", () => fashionApi.render(p.id, "reels"))} data-render-reels>
              릴스 만들기 (약 {Math.round(ready.length * s.secPerLook + 2.5)}초)
            </Button>
          </div>
          <div className="space-y-1.5 border-t border-line pt-2" data-fashion-music>
            <p className="flex items-center gap-1 text-[12.5px] font-medium">
              <Music className="size-3.5" /> 음악 (릴스는 말소리가 없어 음악이 분위기를 만듭니다)
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Input value={musicNote} onChange={(e) => setMusicNote(e.target.value.slice(0, 300))} placeholder="어떤 음악? (비우면 주제에 맞게)" className="h-8 min-w-[160px] flex-1 text-[12.5px]" />
              <Button size="sm" variant="secondary" icon={Wand2} disabled={musicBusy || Boolean(ctl.busy)} loading={musicBusy} onClick={onMusic}>
                {musicBusy ? "만드는 중…" : "AI 음악 만들기"}
              </Button>
              <UploadButton accept="audio/mpeg,audio/mp4,audio/wav,.mp3,.m4a,.wav" disabled={uploading} onFiles={(f) => void upload(f.slice(0, 1), "audio", { type: "bgm" })}>
                음악 올리기
              </UploadButton>
            </div>
            {musicFail.map((t) => (
              <p key={t.id} className="text-[12px] text-danger">
                음악 실패: {t.error}
              </p>
            ))}
            {p.tracks.map((t) => (
              <div key={t.id} className={cn("flex flex-wrap items-center gap-2 rounded border p-1.5", p.bgmKey === t.key ? "border-brand bg-brand-soft" : "border-line")}>
                <span className="text-[12px] font-medium">{t.name}</span>
                {ctl.urls[t.key] && <audio src={ctl.urls[t.key]} controls preload="none" className="h-7 max-w-[220px] flex-1" />}
                {p.bgmKey === t.key ? <Badge tone="brand">사용 중</Badge> : <Button size="sm" variant="ghost" onClick={() => ctl.edit("bgmKey", t.key)}>쓰기</Button>}
                <button type="button" aria-label="음악 지우기" className="p-1 text-fg-subtle hover:text-danger" onClick={() => window.confirm(`'${t.name}'을 지울까요?`) && void ctl.run("음악 지우기", () => fashionApi.action(p.id, "delete-track", { trackId: t.id }))}>
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
            {p.bgmKey && (
              <label className="flex items-center gap-2 text-[12px] text-fg-muted">
                음악 볼륨 {Math.round(s.bgmVolume * 100)}%
                <input type="range" min={0} max={1} step={0.05} value={s.bgmVolume} onChange={(e) => ctl.edit("settings", { ...s, bgmVolume: Number(e.target.value) })} className="w-36 accent-[var(--color-brand)]" />
              </label>
            )}
          </div>
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
                <Badge tone={r.status === "success" ? "success" : r.status === "fail" ? "danger" : "info"}>{r.status === "success" ? "완료" : r.status === "fail" ? "실패" : "만드는 중"}</Badge>
                {r.totalSec != null && <span className="text-fg-muted">{r.totalSec}초</span>}
                <span className="text-fg-subtle">{formatRelative(r.createdAt)}</span>
                {r.status !== "running" && (
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
  const shown = (list ?? []).filter((x) => !q.trim() || x.name.includes(q.trim()));
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
