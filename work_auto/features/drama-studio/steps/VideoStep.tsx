"use client";

import { useMemo, useState } from "react";
import { Check, Clapperboard, Download, Film, ListPlus, RefreshCw, Sparkles, Video } from "lucide-react";
import { Badge, Button, Checkbox, EmptyState, Input, Notice, SectionCard, Select, SegmentedControl, Textarea } from "@/components/ui";
import { MODE_LABEL, VIDEO_MODELS, estimateVideoCredits, multiSceneCaveat, validateVideo, videoModel, type VideoOptions } from "@/lib/drama-studio/models";
import { videoPrompt } from "@/lib/drama-studio/prompts";
import { newId } from "@/lib/drama-studio/steps";
import type { DramaCharacter, DramaClip, DramaScene, GenMode } from "@/lib/drama-studio/types";
import { cn } from "@/lib/utils";
import { newRequestId, studioApi } from "../api";
import { CostConfirm, TASK_LABEL, UploadButton, taskTone } from "../ui";
import type { ProjectCtl } from "../useProject";
import { Timeline } from "./Timeline";

type Plan = "single" | "batch";

/** 08 영상 제작: 장면별 개별 생성(기본) / 여러 장면 묶음 → 작업 관리 → 클립 검토·승인 → 타임라인 편집 → 최종 병합 */
export function VideoStep({ ctl }: { ctl: ProjectCtl }) {
  const p = ctl.project!;
  const scenes = p.scenario.scenes;
  const [plan, setPlan] = useState<Plan>("single");
  const [picked, setPicked] = useState<string[]>([]);
  const [modelId, setModelId] = useState("seedance-2-fast");
  const m = videoModel(modelId)!;
  const [mode, setMode] = useState<GenMode>("first_frame");
  const [resolution, setResolution] = useState(m.defaultResolution);
  const [audio, setAudio] = useState(true);
  const [secs, setSecs] = useState<Record<string, number>>({});
  const [batchSec, setBatchSec] = useState(10);
  const [batchPrompt, setBatchPrompt] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { jobs: { sceneIds: string[]; options: VideoOptions; prompt?: string }[] } | { retry: string[] }>(null);
  const [uploading, setUploading] = useState(false);

  const frameOf = (id: string) => (p.storyboard[id] ?? []).find((f) => f.approved) ?? null;
  const refChars = (list: DramaScene[]): DramaCharacter[] => [...new Set(list.flatMap((s) => s.characterIds))].map((id) => p.characters.find((c) => c.id === id)).filter((c): c is DramaCharacter => Boolean(c && (p.sheets[c.id] ?? []).some((i) => i.approved)));
  const pickedScenes = scenes.filter((s) => picked.includes(s.id));
  const modesFor = (pl: Plan) => m.modes.filter((x) => (pl === "batch" ? x === "multi_shot" || x === "reference" : x !== "multi_shot"));
  const chooseModel = (id: string) => {
    const nm = videoModel(id)!;
    setModelId(id);
    setResolution(nm.defaultResolution);
    const allowed = nm.modes.filter((x) => (plan === "batch" ? x === "multi_shot" || x === "reference" : x !== "multi_shot"));
    if (!allowed.includes(mode)) setMode(allowed[0] ?? "text");
    if (nm.audio === "always") setAudio(true);
  };
  const choosePlan = (pl: Plan) => {
    setPlan(pl);
    const allowed = modesFor(pl);
    if (!allowed.includes(mode)) setMode(allowed[0] ?? "reference");
  };
  const clampSec = (s: number) => Math.min(m.maxSec, Math.max(m.minSec, Math.round(s)));
  const optFor = (s: DramaScene): VideoOptions => ({ modelId, mode, durationSec: clampSec(secs[s.id] ?? s.durationSec), resolution, aspect: p.settings.aspect, audio });
  const shotSecs = pickedScenes.map((s) => Math.max(m.multiShot?.minShotSec ?? 1, Math.min(m.multiShot?.maxShotSec ?? 12, Math.round(s.durationSec))));
  const batchOpt: VideoOptions = { modelId, mode, durationSec: mode === "multi_shot" ? shotSecs.reduce((a, b) => a + b, 0) : batchSec, resolution, aspect: p.settings.aspect, audio, shotSecs: mode === "multi_shot" ? shotSecs : undefined };

  // 검사 (서버와 같은 규칙)
  const singleErrors = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const s of pickedScenes) {
      const i = scenes.indexOf(s);
      const refs = refChars([s]).length + (frameOf(s.id) ? 1 : 0);
      out[s.id] = validateVideo(optFor(s), { first: Boolean(frameOf(s.id)), last: Boolean(scenes[i + 1] && frameOf(scenes[i + 1].id)), references: refs, scenes: 1 });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedScenes, modelId, mode, resolution, audio, secs, p.storyboard, p.sheets]);
  const batchErrors = plan === "batch" ? validateVideo(batchOpt, { first: Boolean(pickedScenes[0] && frameOf(pickedScenes[0].id)), references: refChars(pickedScenes).length + pickedScenes.filter((s) => frameOf(s.id)).length, scenes: pickedScenes.length }) : [];
  const caveat = plan === "batch" ? multiSceneCaveat(batchOpt, pickedScenes.length) : null;
  const autoBatchPrompt = pickedScenes.length ? videoPrompt(pickedScenes, p.characters, batchOpt, refChars(pickedScenes)) : "";

  function openConfirm() {
    if (plan === "single") {
      const ok = pickedScenes.filter((s) => !singleErrors[s.id]?.length);
      if (!ok.length) return ctl.setError("만들 수 있는 장면이 없습니다. 장면을 고르고 오류를 확인해 주세요.");
      setConfirm({ jobs: ok.map((s) => ({ sceneIds: [s.id], options: optFor(s) })) });
    } else {
      if (batchErrors.length) return ctl.setError(batchErrors[0]);
      setConfirm({ jobs: [{ sceneIds: pickedScenes.map((s) => s.id), options: batchOpt, prompt: batchPrompt ?? undefined }] });
    }
  }
  async function submit() {
    if (!confirm) return;
    const body = "retry" in confirm ? { retryTaskIds: confirm.retry, clientRequestId: newRequestId() } : { jobs: confirm.jobs, clientRequestId: newRequestId() };
    const r = await ctl.run("영상 요청", () => studioApi.videos(p.id, body));
    if (r) {
      setConfirm(null);
      setPicked([]);
    }
  }

  const tasks = p.tasks.filter((t) => t.kind === "video");
  const failed = tasks.filter((t) => t.status === "fail" && !tasks.some((x) => x.status !== "fail" && x.target.type === "clip" && t.target.type === "clip" && x.createdAt > t.createdAt && x.target.sceneIds.join() === t.target.sceneIds.join()));
  const setClips = (list: DramaClip[]) => ctl.edit("clips", list);
  const inTimeline = new Set(p.timeline.map((t) => t.clipId));
  const addToTimeline = (c: DramaClip) => {
    const covered = new Set(p.timeline.flatMap((t) => p.clips.find((x) => x.id === t.clipId)?.sceneIds ?? []));
    const dup = c.sceneIds.filter((id) => covered.has(id));
    if (dup.length && !window.confirm(`${dup.map((id) => `#${scenes.findIndex((s) => s.id === id) + 1}`).join(", ")} 장면은 이미 타임라인의 다른 클립에 들어 있습니다. 그래도 넣을까요? (같은 장면이 두 번 나옵니다)`)) return;
    ctl.edit("timeline", [...p.timeline, { id: newId("tl"), clipId: c.id, trimStart: 0, trimEnd: 0, audio: true }]);
  };
  async function uploadClips(files: File[], sceneIds: string[]) {
    setUploading(true);
    try {
      for (const f of files) ctl.apply(await studioApi.upload(p.id, f, "video", { type: "clip", sceneIds }));
    } catch (e) {
      ctl.setError(e instanceof Error ? e.message : "올리지 못했습니다.");
    } finally {
      setUploading(false);
    }
  }
  /** v0.9.88: 클립 모두 승인 — 같은 장면 묶음마다 가장 최근 클립 (이미 승인한 묶음은 그대로) → 원하면 타임라인에도 장면 순서대로 */
  const approveAllClips = (alsoTimeline: boolean) => {
    const groups = new Map<string, DramaClip[]>();
    for (const c of p.clips) groups.set(c.sceneIds.join(",") || c.id, [...(groups.get(c.sceneIds.join(",") || c.id) ?? []), c]);
    const pick = new Set<string>();
    for (const list of groups.values()) {
      if (list.some((c) => c.approved)) continue;
      pick.add(list[list.length - 1].id);
    }
    const clips = p.clips.map((c) => (pick.has(c.id) ? { ...c, approved: true } : c));
    ctl.edit("clips", clips);
    if (alsoTimeline) {
      const have = new Set(p.timeline.map((t) => t.clipId));
      const order = (c: DramaClip) => Math.min(...c.sceneIds.map((id) => scenes.findIndex((x) => x.id === id)).filter((n) => n >= 0), 9999);
      const add = clips.filter((c) => c.approved && !have.has(c.id)).sort((a, b) => order(a) - order(b));
      if (add.length) ctl.edit("timeline", [...p.timeline, ...add.map((c) => ({ id: newId("tl"), clipId: c.id, trimStart: 0, trimEnd: 0, audio: true }))]);
    }
  };
  const unapprovedClips = p.clips.filter((c) => !c.approved).length;
  const sceneLabel = (ids: string[]) => (ids.length ? ids.map((id) => `#${scenes.findIndex((s) => s.id === id) + 1}`).join("·") : "장면 없음");

  return (
    <div className="space-y-5">
      <SectionCard title="영상 만들기" icon={Clapperboard} description="Kie AI 로 장면 영상을 만듭니다. 작업 1개 = 1회 과금, 만들기 전에 작업 수·최소 예상 크레딧을 확인합니다.">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <span className="text-[12px] font-medium text-fg-muted">제작 방식</span>
              <SegmentedControl size="sm" value={plan} onChange={choosePlan} options={[{ value: "single", label: "장면별 개별 생성 (추천)" }, { value: "batch", label: "여러 장면 묶음" }]} />
            </div>
            <label className="space-y-1">
              <span className="text-[12px] font-medium text-fg-muted">영상 모델</span>
              <Select value={modelId} options={VIDEO_MODELS.map((x) => ({ value: x.id, label: `${x.label} — ${x.note}` }))} onChange={(e) => chooseModel(e.target.value)} className="w-80" aria-label="영상 모델" data-video-model />
            </label>
            <label className="space-y-1">
              <span className="text-[12px] font-medium text-fg-muted">입력 방식</span>
              <Select value={mode} options={modesFor(plan).map((x) => ({ value: x, label: MODE_LABEL[x] }))} onChange={(e) => setMode(e.target.value as GenMode)} className="w-64" aria-label="입력 방식" />
            </label>
            <label className="space-y-1">
              <span className="text-[12px] font-medium text-fg-muted">해상도</span>
              <Select value={resolution} options={m.resolutions.map((r) => ({ value: r, label: r }))} onChange={(e) => setResolution(e.target.value)} className="w-24" aria-label="해상도" />
            </label>
            <label className="flex items-center gap-1.5 pb-2 text-[13px]">
              <input type="checkbox" checked={audio} disabled={m.audio !== "toggle"} onChange={(e) => setAudio(e.target.checked)} className="accent-[var(--color-brand)]" />
              소리·대사 만들기 {m.audio === "always" && "(항상)"}
            </label>
          </div>
          <p className="text-[12px] text-fg-subtle">
            {m.label}: 한 번에 {m.minSec}~{m.maxSec}초 · {m.resolutions.join("/")} · 참고 이미지 최대 {m.maxReferenceImages}장 · {m.priceNote}. 첫 프레임·첫+끝 프레임·참고 이미지는 서로 섞지 않고 하나만 보냅니다.
            {mode === "first_last" && " 끝 프레임은 다음 장면의 승인 이미지를 씁니다."}
            {mode === "multi_shot" && ` 멀티 샷은 최대 ${m.multiShot?.maxShots}장면, 첫 장면 이미지만 첫 프레임으로 씁니다.`}
          </p>

          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <span className="text-[12.5px] font-medium text-fg">장면 고르기 ({picked.length}개)</span>
              <Button size="sm" variant="ghost" onClick={() => setPicked(scenes.filter((s) => !p.clips.some((c) => c.approved && c.sceneIds.includes(s.id))).map((s) => s.id))}>
                영상 없는 장면 모두
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setPicked([])}>
                모두 해제
              </Button>
            </div>
            <ul className="grid max-h-[420px] gap-1.5 overflow-y-auto md:grid-cols-2" data-video-scenes>
              {scenes.map((s, i) => {
                const on = picked.includes(s.id);
                const f = frameOf(s.id);
                const errs = plan === "single" && on ? singleErrors[s.id] ?? [] : [];
                const has = p.clips.filter((c) => c.sceneIds.includes(s.id));
                return (
                  <li key={s.id} className={cn("flex gap-2 rounded-control border p-1.5", on ? "border-brand bg-brand-soft/30" : "border-line")}>
                    <Checkbox checked={on} onChange={(v) => setPicked((x) => (v ? [...x, s.id] : x.filter((y) => y !== s.id)))} label={`${i + 1}번`} />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {f && ctl.urls[f.key] ? <img src={ctl.urls[f.key]} alt="" className="h-14 w-10 shrink-0 rounded object-cover" /> : <div className="h-14 w-10 shrink-0 rounded bg-subtle" />}
                    <div className="min-w-0 flex-1 text-[12px]">
                      <p className="truncate font-medium text-fg">
                        #{i + 1} {s.title}
                      </p>
                      <p className="truncate text-fg-subtle">{s.action}</p>
                      <p className="text-fg-subtle">
                        {has.length ? `클립 ${has.length}개${has.some((c) => c.approved) ? " · 승인" : ""}` : "클립 없음"}
                        {!f && " · 스토리보드 이미지 없음"}
                      </p>
                      {errs.map((e) => (
                        <p key={e} className="text-danger">
                          {e}
                        </p>
                      ))}
                    </div>
                    {plan === "single" && (
                      <label className="flex shrink-0 items-center gap-1 text-[11.5px] text-fg-muted">
                        <Input type="number" min={m.minSec} max={m.maxSec} value={secs[s.id] ?? clampSec(s.durationSec)} onChange={(e) => setSecs((x) => ({ ...x, [s.id]: Number(e.target.value) }))} className="h-7 w-14" aria-label="길이" />초
                      </label>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {plan === "single" && pickedScenes.length === 1 && (
            <label className="block space-y-1">
              <span className="text-[12px] font-medium text-fg-muted">영상 프롬프트 (#{scenes.indexOf(pickedScenes[0]) + 1}, 비우면 자동 — 아래는 자동 프롬프트)</span>
              <Textarea
                rows={8}
                className="font-mono text-[11.5px]"
                value={pickedScenes[0].videoPrompt}
                placeholder={videoPrompt(pickedScenes, p.characters, optFor(pickedScenes[0]), refChars(pickedScenes))}
                onChange={(e) => ctl.edit("scenario", { ...p.scenario, scenes: scenes.map((s) => (s.id === pickedScenes[0].id ? { ...s, videoPrompt: e.target.value } : s)) })}
              />
            </label>
          )}
          {plan === "batch" && pickedScenes.length > 0 && (
            <div className="space-y-2">
              {mode !== "multi_shot" && (
                <label className="flex items-center gap-2 text-[12.5px] text-fg-muted">
                  전체 길이
                  <Input type="number" min={m.minSec} max={m.maxSec} value={batchSec} onChange={(e) => setBatchSec(Number(e.target.value))} className="h-8 w-20" />초 (최대 {m.maxSec}초)
                </label>
              )}
              {mode === "multi_shot" && <p className="text-[12.5px] text-fg-muted">컷 길이: {pickedScenes.map((s, i) => `#${scenes.indexOf(s) + 1} ${shotSecs[i]}초`).join(" · ")} = {shotSecs.reduce((a, b) => a + b, 0)}초 (장면 길이를 시나리오에서 고치면 바뀝니다)</p>}
              {caveat && <Notice tone="warning">{caveat}</Notice>}
              {batchErrors.map((e) => (
                <p key={e} className="text-[12px] text-danger">
                  {e}
                </p>
              ))}
              <label className="block space-y-1">
                <span className="text-[12px] font-medium text-fg-muted">통합 프롬프트 (고칠 수 있음{mode === "multi_shot" ? " — 멀티 샷은 장면별 프롬프트를 따로 보냅니다" : ""})</span>
                <Textarea rows={10} className="font-mono text-[11.5px]" value={batchPrompt ?? autoBatchPrompt} onChange={(e) => setBatchPrompt(e.target.value)} />
              </label>
              {batchPrompt !== null && (
                <Button size="sm" variant="ghost" onClick={() => setBatchPrompt(null)}>
                  자동 프롬프트로 되돌리기
                </Button>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" icon={Sparkles} disabled={!picked.length || Boolean(ctl.busy)} onClick={openConfirm} data-gen-videos>
              {plan === "single" ? `고른 ${picked.length}장면 영상 만들기` : `${picked.length}장면을 영상 1개로 만들기`}
            </Button>
            <UploadButton accept="video/mp4,video/quicktime,video/webm" multiple disabled={uploading} onFiles={(f) => void uploadClips(f, picked.length === 1 ? picked : [])}>
              {picked.length === 1 ? "이 장면에 영상 파일 올리기" : "영상 파일 올리기 (장면 없이)"}
            </UploadButton>
            {uploading && <span className="text-[12px] text-brand">올리는 중…</span>}
          </div>
        </div>
      </SectionCard>

      {tasks.length > 0 && (
        <SectionCard
          title={`영상 작업 · 완료 ${tasks.filter((t) => t.status === "success").length} · 진행 ${tasks.filter((t) => t.status === "generating" || t.status === "requesting").length} · 실패 ${failed.length}`}
          icon={Film}
          actions={
            failed.length > 0 && (
              <Button size="sm" variant="secondary" icon={RefreshCw} disabled={Boolean(ctl.busy)} onClick={() => setConfirm({ retry: failed.map((t) => t.id) })} data-retry-failed>
                실패한 {failed.length}개만 다시 만들기
              </Button>
            )
          }
          flush
        >
          <ul className="max-h-72 divide-y divide-line overflow-y-auto text-[12.5px]" data-video-tasks>
            {[...tasks].reverse().map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2 px-4 py-1.5">
                <Badge tone={taskTone(t.status)}>{TASK_LABEL[t.status]}</Badge>
                <span className="text-fg">{t.target.type === "clip" ? sceneLabel(t.target.sceneIds) : ""}</span>
                <span className="text-fg-subtle">
                  {videoModel(t.modelId)?.label ?? t.modelId} · {MODE_LABEL[t.mode].split(" (")[0]} · {t.durationSec}초
                </span>
                {t.error && <span className="truncate text-danger">{t.error}</span>}
                <span className="ml-auto text-fg-subtle">{t.credits != null ? `실제 ${t.credits} 크레딧` : t.estimatedCredits != null ? `예상 최소 ${t.estimatedCredits}` : "가격 확인 안 됨"}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <SectionCard
        title={`클립 · ${p.clips.length}개`}
        icon={Video}
        description="같은 장면을 여러 번 만들면 모두 남겨 비교할 수 있습니다. 승인한 클립만 타임라인에 넣을 수 있습니다. [모두 승인]은 장면마다 가장 최근 클립을 승인합니다."
        actions={
          p.clips.length > 0 && (
            <span className="flex gap-1.5">
              <Button size="sm" variant="secondary" icon={Check} disabled={!unapprovedClips} onClick={() => approveAllClips(false)} data-approve-all-clips>
                모두 승인
              </Button>
              <Button size="sm" variant="primary" icon={ListPlus} onClick={() => approveAllClips(true)} data-approve-all-timeline>
                모두 승인 + 타임라인에 순서대로
              </Button>
            </span>
          )
        }
      >
        {!p.clips.length ? (
          <EmptyState compact title="아직 클립이 없습니다" description="위에서 영상을 만들거나 영상 파일을 올려 주세요." />
        ) : (
          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4" data-clips>
            {p.clips.map((c) => (
              <div key={c.id} className={cn("rounded-control border p-2", c.approved ? "border-success" : "border-line")} data-clip={c.id}>
                {ctl.urls[c.key] ? <video src={ctl.urls[c.key]} controls playsInline preload="metadata" className={cn("w-full rounded bg-black", p.settings.aspect === "9:16" ? "aspect-[9/16]" : "aspect-video")} /> : <div className="aspect-video rounded bg-subtle" />}
                <p className="mt-1 text-[12px] font-medium text-fg">
                  {sceneLabel(c.sceneIds)} · {c.durationSec}초
                </p>
                <p className="text-[11px] text-fg-subtle">
                  {c.source === "upload" ? `업로드 ${c.fileName ?? ""}` : `${videoModel(c.modelId)?.label ?? c.modelId} · ${MODE_LABEL[c.mode as GenMode]?.split(" (")[0] ?? c.mode}`}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  <Button size="sm" variant={c.approved ? "primary" : "secondary"} icon={Check} onClick={() => setClips(p.clips.map((x) => (x.id === c.id ? { ...x, approved: !x.approved } : x)))}>
                    {c.approved ? "승인됨" : "승인"}
                  </Button>
                  <Button size="sm" variant="ghost" icon={ListPlus} disabled={!c.approved || inTimeline.has(c.id)} onClick={() => addToTimeline(c)}>
                    {inTimeline.has(c.id) ? "타임라인에 있음" : "타임라인에"}
                  </Button>
                  {c.sceneIds.length > 0 && (
                    <Button size="sm" variant="ghost" icon={RefreshCw} onClick={() => (setPicked(c.sceneIds), setPlan(c.sceneIds.length > 1 ? "batch" : "single"), window.scrollTo({ top: 0, behavior: "smooth" }))}>
                      다시 생성
                    </Button>
                  )}
                  {ctl.urls[c.key] && (
                    <a href={ctl.urls[c.key]} download target="_blank" rel="noreferrer" className="inline-flex h-8 items-center px-2 text-fg-muted hover:text-fg" aria-label="다운로드">
                      <Download className="size-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <Timeline ctl={ctl} />

      <CostConfirm
        open={Boolean(confirm)}
        title={confirm && "retry" in confirm ? "실패한 영상 다시 만들기" : "AI 영상 만들기"}
        items={
          !confirm
            ? []
            : "retry" in confirm
              ? [{ label: "실패한 작업 (같은 설정·프롬프트)", count: confirm.retry.length, credits: confirm.retry.reduce<number | null>((n, id) => (n === null ? null : (() => { const e = tasks.find((t) => t.id === id)?.estimatedCredits; return e == null ? null : n + e; })()), 0) }]
              : [{ label: `${m.label} · ${MODE_LABEL[mode].split(" (")[0]}`, count: confirm.jobs.length, credits: confirm.jobs.reduce<number | null>((n, j) => (n === null ? null : (() => { const e = estimateVideoCredits(j.options); return e == null ? null : n + e; })()), 0) }]
        }
        notes={caveat && confirm && !("retry" in confirm) ? [caveat] : []}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void submit()}
        busy={ctl.busy === "영상 요청"}
      />
    </div>
  );
}
