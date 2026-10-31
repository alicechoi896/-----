"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Check, Download, GripVertical, Images, Languages, LayoutGrid, Pencil, ScanFace, Sparkles, Square, Upload } from "lucide-react";
import { Badge, Button, Checkbox, EmptyState, Modal, Notice, SectionCard, Select, SegmentedControl, Textarea } from "@/components/ui";
import { IMAGE_MODELS, estimateImageCredits, imageModel } from "@/lib/drama-studio/models";
import { framePrompt } from "@/lib/drama-studio/prompts";
import type { DramaImage, DramaScene } from "@/lib/drama-studio/types";
import { cn } from "@/lib/utils";
import { newRequestId, studioApi } from "../api";
import { CostConfirm, PromptModal, TASK_LABEL, UploadButton, taskTone } from "../ui";
import type { ProjectCtl } from "../useProject";
import { ImageCard } from "./SheetsStep";

/** 파일 이름의 숫자 → 장면 번호 (예: scene_03.png → 3) */
export function numberOf(name: string): number | null {
  const m = name.replace(/\.[^.]+$/, "").match(/(\d+)(?!.*\d)/);
  return m ? Number(m[1]) : null;
}

/** 07 스토리보드: 장면마다 이미지(개별 작업) → 검토·재생성·교체·승인. 이미 만든 이미지 여러 장을 한 번에 올려 장면에 잇기 */
export function StoryboardStep({ ctl }: { ctl: ProjectCtl }) {
  const p = ctl.project!;
  const scenes = p.scenario.scenes;
  const [view, setView] = useState<"grid" | "single">("grid");
  const [cur, setCur] = useState(0);
  const [picked, setPicked] = useState<string[]>([]);
  const [modelId, setModelId] = useState("nano-banana-edit");
  const [confirm, setConfirm] = useState<{ sceneId: string; prompt?: string }[] | null>(null);
  // v0.9.91: 프롬프트 고치기 창 (장면 id)
  const [promptFor, setPromptFor] = useState<string | null>(null);
  const [bulk, setBulk] = useState<{ file: File; sceneId: string }[] | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const m = imageModel(modelId)!;
  const frames = (id: string) => (p.storyboard[id] ?? []).filter((f) => !f.removed);
  const approvedOf = (id: string) => frames(id).find((f) => f.approved) ?? null;
  const tasks = p.tasks.filter((t) => t.kind === "image" && t.target.type === "frame");
  const running = (id: string) => tasks.some((t) => t.target.type === "frame" && t.target.sceneId === id && (t.status === "generating" || t.status === "requesting"));
  const lastFail = (id: string) => [...tasks].reverse().find((t) => t.target.type === "frame" && t.target.sceneId === id);
  const setFrames = (id: string, list: DramaImage[]) => ctl.edit("storyboard", { ...p.storyboard, [id]: list });
  /** 올리기도 저장과 같은 줄에 (앞 저장이 끝난 뒤 올리고, 결과를 바로 반영) */
  const queued = <T,>(fn: () => Promise<T>) => ctl.flush().then(() => ctl.enqueue(fn));
  const approve = (id: string, img: DramaImage) => setFrames(id, (p.storyboard[id] ?? []).map((f) => ({ ...f, approved: f.id === img.id ? !img.approved : false })));
  /** v0.9.88: 한 번에 승인 — 장면마다 가장 최근 이미지 (이미 승인한 장면은 그대로). ids 를 주면 그 장면만 */
  const approveAll = (ids?: string[]) => {
    const next = { ...p.storyboard };
    for (const sc of scenes) {
      if (ids && !ids.includes(sc.id)) continue;
      const list = next[sc.id] ?? [];
      const live = list.filter((x) => !x.removed);
      if (!live.length || live.some((x) => x.approved)) continue;
      const last = live[live.length - 1];
      next[sc.id] = list.map((x) => ({ ...x, approved: x.id === last.id }));
    }
    ctl.edit("storyboard", next);
  };
  const unapproved = scenes.filter((sc) => frames(sc.id).length && !approvedOf(sc.id));
  /** 보여 주는 이미지의 얼굴 검사 결과 (undefined = 검사 안 함) */
  const shownFace = (id: string) => (approvedOf(id) ?? frames(id).at(-1))?.faceCheck?.ok;
  const setScene = (id: string, patch: Partial<DramaScene>) => ctl.edit("scenario", { ...p.scenario, scenes: scenes.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const noRefs = useMemo(() => p.characters.filter((c) => !(p.sheets[c.id] ?? []).some((i) => i.approved)).map((c) => c.name), [p.characters, p.sheets]);
  const done = scenes.filter((s) => approvedOf(s.id)).length;

  async function submit(jobs: { sceneId: string; prompt?: string }[]) {
    const r = await ctl.run("이미지 요청", () => studioApi.images(p.id, { jobs: jobs.map((j) => ({ target: { type: "frame", sceneId: j.sceneId }, prompt: j.prompt })), modelId, clientRequestId: newRequestId() }));
    if (r) {
      setConfirm(null);
      setPicked([]);
    }
  }
  async function uploadOne(sceneId: string | undefined, file: File, title?: string) {
    return queued(() => studioApi.upload(p.id, file, "image", { type: "frame", sceneId, newSceneTitle: title }));
  }
  function startBulk(files: File[]) {
    const sorted = [...files].sort((a, b) => (numberOf(a.name) ?? 1e9) - (numberOf(b.name) ?? 1e9) || a.name.localeCompare(b.name));
    setBulk(sorted.map((file, i) => {
      const n = numberOf(file.name);
      const byNo = n && scenes[n - 1] ? scenes[n - 1].id : scenes[i]?.id;
      return { file, sceneId: byNo ?? "" };
    }));
  }
  async function runBulk() {
    if (!bulk) return;
    try {
      for (const [i, b] of bulk.entries()) {
        setUploading(`${i + 1}/${bulk.length} 올리는 중…`);
        ctl.apply(await uploadOne(b.sceneId || undefined, b.file, b.file.name.replace(/\.[^.]+$/, "")));
      }
      setBulk(null);
    } catch (e) {
      ctl.setError(e instanceof Error ? e.message : "올리지 못했습니다.");
    } finally {
      setUploading(null);
    }
  }
  /** v0.9.92: 끄는 동안 지나가는 자리로 바로 옮긴다 */
  function moveTo(to: number) {
    if (drag === null || drag === to) return;
    const list = [...scenes];
    const [it] = list.splice(drag, 1);
    list.splice(to, 0, it);
    ctl.edit("scenario", { ...p.scenario, scenes: list });
    setDrag(to);
  }

  const card = (s: DramaScene, i: number, big = false) => {
    const a = approvedOf(s.id);
    const shown = a ?? frames(s.id).at(-1);
    const f = lastFail(s.id);
    return (
      <div
        key={s.id}
        draggable={!big}
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", s.id);
          setDrag(i);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          moveTo(i);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(null);
        }}
        onDragEnd={() => setDrag(null)}
        className={cn("rounded-card border bg-canvas p-2.5", a ? "border-success" : "border-line", drag === i && "ring-2 ring-brand")}
        data-frame={s.id}
      >
        <div className="mb-1.5 flex items-center gap-1.5">
          {!big && <GripVertical className="size-3.5 cursor-grab text-fg-subtle" aria-label="끌어서 순서 바꾸기" />}
          <Checkbox checked={picked.includes(s.id)} onChange={(v) => setPicked((x) => (v ? [...x, s.id] : x.filter((y) => y !== s.id)))} label={`${i + 1}번 고르기`} />
          <span className="tabular text-[12px] font-bold text-brand">#{i + 1}</span>
          <span className="truncate text-[12.5px] font-medium text-fg">{s.title || "(제목 없음)"}</span>
          <span className="ml-auto flex gap-1">
            {shownFace(s.id) === false && <Badge tone="danger">얼굴 다름</Badge>}
            {a ? <Badge tone="success">승인</Badge> : running(s.id) ? <Badge tone="info">생성 중</Badge> : f?.status === "fail" ? <Badge tone="danger">실패</Badge> : null}
          </span>
        </div>
        {shown && ctl.urls[shown.key] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={ctl.urls[shown.key]} alt={s.title} draggable={false} className={cn("w-full rounded bg-subtle object-cover", p.settings.aspect === "9:16" ? "aspect-[9/16]" : "aspect-video", !big && "max-h-72")} loading="lazy" />
        ) : (
          <div className={cn("flex w-full items-center justify-center rounded bg-subtle text-[11px] text-fg-subtle", p.settings.aspect === "9:16" ? "aspect-[9/16] max-h-72" : "aspect-video")}>이미지 없음</div>
        )}
        <p className="mt-1.5 line-clamp-2 text-[11.5px] text-fg-muted">{s.visual || s.action}</p>
        {shownFace(s.id) === false && <p className="text-[11px] text-danger">얼굴 검사: {(approvedOf(s.id) ?? frames(s.id).at(-1))?.faceCheck?.note || "기준 이미지와 다른 사람처럼 보입니다"} — [프롬프트]·[재생성]으로 다시 만들어 주세요.</p>}
        {f?.status === "fail" && !a && <p className="text-[11px] text-danger">{f.error}</p>}
        <div className="mt-1.5 flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" icon={Sparkles} disabled={Boolean(ctl.busy) || running(s.id)} onClick={() => setConfirm([{ sceneId: s.id }])}>
            {frames(s.id).length ? "재생성" : "만들기"}
          </Button>
          <Button size="sm" variant={s.imagePrompt.trim() ? "subtle" : "ghost"} icon={Pencil} onClick={() => setPromptFor(s.id)} data-frame-prompt>
            프롬프트{s.imagePrompt.trim() ? " (고침)" : ""}
          </Button>
          <UploadButton accept="image/png,image/jpeg,image/webp" variant="ghost" disabled={Boolean(uploading)} onFiles={async (fs) => {
            setUploading("올리는 중…");
            try {
              ctl.apply(await uploadOne(s.id, fs[0]));
            } catch (e) {
              ctl.setError(e instanceof Error ? e.message : "올리지 못했습니다.");
            } finally {
              setUploading(null);
            }
          }}>
            교체
          </UploadButton>
          {shown && !shown.approved && (
            <Button size="sm" variant="ghost" icon={Check} onClick={() => approve(s.id, shown)}>
              승인
            </Button>
          )}
          {shown && ctl.urls[shown.key] && (
            <a href={ctl.urls[shown.key]} download target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 px-2 text-[13px] text-fg-muted hover:text-fg">
              <Download className="size-3.5" />
            </a>
          )}
        </div>
        {big && (
          <div className="mt-3 space-y-3">
            {frames(s.id).length > 1 && (
              <div>
                <p className="mb-1 text-[12px] font-medium text-fg-muted">버전 (눌러서 승인할 이미지 고르기)</p>
                <div className="grid grid-cols-4 gap-1.5 md:grid-cols-6">
                  {frames(s.id).map((img) => (
                    <ImageCard key={img.id} img={img} url={ctl.urls[img.key]} onApprove={() => approve(s.id, img)} approveLabel="이 이미지 승인" onRemove={() => setFrames(s.id, (p.storyboard[s.id] ?? []).map((x) => (x.id === img.id ? { ...x, removed: true, approved: false } : x)))} />
                  ))}
                </div>
              </div>
            )}
            <label className="block space-y-1">
              <span className="text-[12px] font-medium text-fg-muted">이미지 프롬프트 (비우면 자동 — 아래는 자동 프롬프트)</span>
              <Textarea rows={8} className="font-mono text-[11.5px]" value={s.imagePrompt} placeholder={framePrompt(s, p.characters, p.settings.aspect, [])} onChange={(e) => setScene(s.id, { imagePrompt: e.target.value })} />
            </label>
            <p className="text-[12px] text-fg-muted">
              등장인물: {s.characterIds.map((id) => p.characters.find((c) => c.id === id)?.name ?? "?").join(", ") || "없음"} · 기준 이미지를 고정한 인물은 그 이미지를 참고로 넣습니다.
            </p>
          </div>
        )}
      </div>
    );
  };

  if (!scenes.length)
    return (
      <SectionCard>
        <EmptyState icon={Images} title="장면이 없습니다" description="06 시나리오에서 장면을 만들거나, 이미 만든 스토리보드 이미지를 한 번에 올리면 이미지마다 장면을 만듭니다." action={<UploadButton accept="image/png,image/jpeg,image/webp" multiple onFiles={startBulk} variant="secondary" size="md">스토리보드 이미지 여러 장 올리기</UploadButton>} className="py-14" />
        <BulkModal bulk={bulk} setBulk={setBulk} scenes={scenes} onRun={() => void runBulk()} uploading={uploading} />
      </SectionCard>
    );

  return (
    <div className="space-y-5">
      <SectionCard title={`스토리보드 · 승인 ${done}/${scenes.length}`} icon={LayoutGrid}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className="text-[12px] font-medium text-fg-muted">이미지 모델</span>
            <Select value={modelId} options={IMAGE_MODELS.map((x) => ({ value: x.id, label: x.label }))} onChange={(e) => setModelId(e.target.value)} className="w-64" aria-label="이미지 모델" />
          </label>
          <Button variant="secondary" icon={Languages} disabled={Boolean(ctl.busy)} loading={ctl.busy === "영어 프롬프트"} onClick={() => void ctl.run("영어 프롬프트", () => studioApi.generate(p.id, "en-prompts"))}>
            영어 프롬프트 만들기 (AI)
          </Button>
          <Button variant="primary" icon={Sparkles} disabled={Boolean(ctl.busy)} onClick={() => setConfirm((picked.length ? picked : scenes.filter((s) => !approvedOf(s.id)).map((s) => s.id)).map((sceneId) => ({ sceneId })))} data-gen-frames>
            {picked.length ? `고른 ${picked.length}장면 만들기` : "승인 안 된 장면 모두 만들기"}
          </Button>
          <Button variant="secondary" icon={Check} disabled={!unapproved.length} onClick={() => approveAll(picked.length ? picked : undefined)} data-approve-all-frames>
            {picked.length ? `고른 ${picked.length}장면 승인` : `이미지 있는 장면 모두 승인 (${unapproved.length})`}
          </Button>
          <Button variant="ghost" onClick={() => setPicked(picked.length === scenes.length ? [] : scenes.map((sc) => sc.id))} data-pick-all-frames>
            {picked.length === scenes.length ? "전체 해제" : "전체 선택"}
          </Button>
          <Button
            variant="secondary"
            icon={ScanFace}
            disabled={Boolean(ctl.busy)}
            loading={ctl.busy === "얼굴 검사"}
            onClick={() => {
              const n = scenes.filter((sc) => frames(sc.id).length && sc.characterIds.length).length;
              if (window.confirm(`스토리보드 ${Math.min(30, n)}장의 얼굴이 캐릭터 기준 이미지와 같은 사람인지 AI 로 검사합니다 (AI 이미지 읽기 ${Math.min(30, n)}회). 진행할까요?`)) void ctl.run("얼굴 검사", () => studioApi.generate(p.id, "face-check", { target: "frames", ids: picked.length ? picked : undefined }));
            }}
            data-face-check-frames
          >
            얼굴 일관성 검사 (AI)
          </Button>
          <UploadButton accept="image/png,image/jpeg,image/webp" multiple onFiles={startBulk} disabled={Boolean(uploading)}>
            여러 장 한 번에 올리기
          </UploadButton>
          <SegmentedControl size="sm" className="ml-auto" value={view} onChange={setView} options={[{ value: "grid", label: "전체 보기", icon: LayoutGrid }, { value: "single", label: "한 장씩", icon: Square }]} />
        </div>
        <p className="mt-2 text-[12px] text-fg-subtle">장면마다 이미지 1장 = 작업 1개 (콜라주로 묶지 않음). {m.note}. 카드를 끌어 놓으면 장면 순서가 바뀝니다. [모두 승인]은 장면마다 가장 최근 이미지를 승인합니다 (다른 버전을 쓰려면 [한 장씩]에서 고르기). {scenes.some((s) => !s.en) ? "[영어 프롬프트 만들기]를 먼저 하면 한국어 시나리오를 영어 프롬프트로 바꿔 더 정확해집니다." : ""}</p>
        {noRefs.length > 0 && <Notice tone="warning" className="mt-2">기준 이미지를 고정하지 않은 인물({noRefs.join(", ")})은 글로만 그려져 얼굴이 달라질 수 있습니다. 05 캐릭터 시트에서 고정해 주세요.</Notice>}
        {uploading && <p className="mt-2 text-[12px] text-brand">{uploading}</p>}
      </SectionCard>

      {view === "grid" ? (
        <div className={cn("grid gap-3", p.settings.aspect === "9:16" ? "grid-cols-2 md:grid-cols-4 xl:grid-cols-5" : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3")} data-storyboard>
          {scenes.map((s, i) => card(s, i))}
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" icon={ChevronLeft} disabled={cur <= 0} onClick={() => setCur((c) => c - 1)}>
              이전 장면
            </Button>
            <span className="text-[13px] text-fg-muted">
              {Math.min(cur, scenes.length - 1) + 1} / {scenes.length}
            </span>
            <Button size="sm" variant="secondary" iconRight={ChevronRight} disabled={cur >= scenes.length - 1} onClick={() => setCur((c) => c + 1)}>
              다음 장면
            </Button>
          </div>
          <div className="mx-auto max-w-2xl">{card(scenes[Math.min(cur, scenes.length - 1)], Math.min(cur, scenes.length - 1), true)}</div>
        </div>
      )}

      {tasks.length > 0 && (
        <SectionCard title="이미지 작업" flush>
          <ul className="max-h-64 divide-y divide-line overflow-y-auto text-[12.5px]" data-frame-tasks>
            {[...tasks].reverse().slice(0, 60).map((t) => (
              <li key={t.id} className="flex items-center gap-2 px-4 py-1.5">
                <Badge tone={taskTone(t.status)}>{TASK_LABEL[t.status]}</Badge>
                <span>#{t.target.type === "frame" ? scenes.findIndex((s) => t.target.type === "frame" && s.id === t.target.sceneId) + 1 : "?"}</span>
                <span className="text-fg-subtle">{t.modelId}</span>
                {t.error && <span className="truncate text-danger">{t.error}</span>}
                <span className="ml-auto text-fg-subtle">{t.credits != null ? `실제 ${t.credits}` : t.estimatedCredits != null ? `예상 최소 ${t.estimatedCredits}` : ""}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {promptFor && (() => {
        const sc = scenes.find((x) => x.id === promptFor)!;
        const refs = p.characters.filter((c) => sc.characterIds.includes(c.id) && (p.sheets[c.id] ?? []).some((i) => i.approved && !i.removed));
        const auto = framePrompt({ ...sc, imagePrompt: "" }, p.characters, p.settings.aspect, m.maxReferenceImages ? refs : []);
        return (
          <PromptModal
            key={promptFor}
            title={`#${scenes.indexOf(sc) + 1} ${sc.title} — 이미지 프롬프트`}
            value={sc.imagePrompt}
            auto={auto}
            note={refs.length ? `기준 이미지 참고: ${refs.map((c) => c.name).join(", ")}` : "기준 이미지 없음 (글만)"}
            onClose={() => setPromptFor(null)}
            onSave={(text) => (setScene(sc.id, { imagePrompt: text }), setPromptFor(null))}
            onRegenerate={(text) => {
              setScene(sc.id, { imagePrompt: text.trim() === auto.trim() ? "" : text });
              setPromptFor(null);
              setConfirm([{ sceneId: sc.id, prompt: text }]);
            }}
          />
        );
      })()}
      <CostConfirm
        open={Boolean(confirm)}
        title="스토리보드 이미지 만들기"
        items={confirm ? [{ label: `${m.label} · 장면마다 1장`, count: confirm.length, credits: estimateImageCredits(modelId, confirm.length) }] : []}
        notes={noRefs.length ? [`기준 이미지가 없는 인물: ${noRefs.join(", ")}`] : []}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm && void submit(confirm)}
        busy={ctl.busy === "이미지 요청"}
      />
      <BulkModal bulk={bulk} setBulk={setBulk} scenes={scenes} onRun={() => void runBulk()} uploading={uploading} />
    </div>
  );
}

/** 여러 장 올리기: 파일 이름 번호로 장면에 잇고, 사람이 고칠 수 있게 */
function BulkModal({ bulk, setBulk, scenes, onRun, uploading }: { bulk: { file: File; sceneId: string }[] | null; setBulk: (b: { file: File; sceneId: string }[] | null) => void; scenes: DramaScene[]; onRun: () => void; uploading: string | null }) {
  if (!bulk) return null;
  const dup = bulk.filter((b) => b.sceneId).map((b) => b.sceneId).filter((id, i, a) => a.indexOf(id) !== i);
  return (
    <Modal
      open
      onClose={() => !uploading && setBulk(null)}
      title={`스토리보드 이미지 ${bulk.length}장 올리기`}
      description="파일 이름의 번호(예: scene_03.png → 3번 장면)로 장면에 이어 두었습니다. 다르면 고쳐 주세요. '새 장면'은 장면을 새로 만듭니다."
      footer={
        <>
          <Button variant="secondary" disabled={Boolean(uploading)} onClick={() => setBulk(null)}>
            취소
          </Button>
          <Button variant="primary" icon={Upload} loading={Boolean(uploading)} onClick={onRun} data-bulk-upload>
            {uploading ?? `${bulk.length}장 올리기`}
          </Button>
        </>
      }
    >
      <ul className="max-h-[50vh] space-y-1.5 overflow-y-auto" data-bulk-list>
        {bulk.map((b, i) => (
          <li key={`${b.file.name}-${i}`} className="flex items-center gap-2 text-[12.5px]">
            <span className="w-6 text-right text-fg-subtle">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate text-fg">{b.file.name}</span>
            <Select
              value={b.sceneId}
              options={[{ value: "", label: "새 장면" }, ...scenes.map((s, k) => ({ value: s.id, label: `#${k + 1} ${s.title.slice(0, 16)}` }))]}
              onChange={(e) => setBulk(bulk.map((x, j) => (j === i ? { ...x, sceneId: e.target.value } : x)))}
              className="h-8 w-48"
              aria-label={`${b.file.name} 장면`}
            />
          </li>
        ))}
      </ul>
      {dup.length > 0 && <p className="mt-2 text-[12px] text-warning">같은 장면에 여러 장이 이어져 있습니다. 마지막에 올린 이미지가 승인됩니다.</p>}
    </Modal>
  );
}
