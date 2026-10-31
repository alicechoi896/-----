"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Check, Clapperboard, ListPlus, Mic, Plus, ScanFace, Sparkles, Trash2, Wand2 } from "lucide-react";
import { Badge, Button, Input, Notice, SectionCard, Select, Textarea } from "@/components/ui";
import { VIDEO_MODELS, MODE_LABEL, durationChoices, modelOptionLabel, estimateImageCredits, fitDuration, videoModel } from "@/lib/drama-studio/models";
import { DEFAULT_SHOT_SEC, MAX_SHOTS_PER_SCENE, SHOT_KINDS, recommendedVoice, approvedShotImage, dialogueFit, emptyShot, shotCode, shotCostSummary, shotsOf } from "@/lib/drama-studio/shots";
import { buildTimeline } from "@/lib/drama-studio/steps";
import type { DramaClip, DramaImage, DramaShot, ShotKind } from "@/lib/drama-studio/types";
import { cn } from "@/lib/utils";
import { newRequestId, studioApi } from "../api";
import { CostConfirm, TASK_LABEL, UploadButton, taskTone } from "../ui";
import type { ProjectCtl } from "../useProject";

const IMG_MODEL = "nano-banana-edit";

/**
 * v0.9.104 촬영 샷 (08 영상 제작 위쪽): 스토리보드 1장 → AI 가 샷 1~4개 추천 → 샷 승인 → 샷 기준 이미지(Nano Banana) 승인
 * → 샷마다 AI 영상(기본 Seedance 2.0 Mini 720p 5초, 기준 이미지를 시작 프레임으로) → 첫·끝 프레임 나란히 검수 → 타임라인.
 * 유료 요청은 모두 확인 창을 거친다. 실패·문제 있는 샷만 다시 만든다.
 */
export function ShotStudio({ ctl }: { ctl: ProjectCtl }) {
  const p = ctl.project!;
  const scenes = p.scenario.scenes;
  const shots = p.shots ?? [];
  const withFrame = scenes.filter((s) => (p.storyboard[s.id] ?? []).some((i) => i.approved && !i.removed));
  const [sceneId, setSceneId] = useState<string>(() => withFrame[0]?.id ?? scenes[0]?.id ?? "");
  const [count, setCount] = useState(3);
  // 샷 기본 모델 (AI 샷 나누기·한 번에 바꾸기)
  const [planModel, setPlanModel] = useState("seedance-2-mini");
  const shotModels = VIDEO_MODELS;
  /** 이 장면 샷 모델을 한 번에 (해상도·길이·방식은 그 모델이 되는 값으로) */
  const setSceneModel = (modelId: string) => {
    const nm = videoModel(modelId)!;
    setShots(shots.map((s) => (s.sceneId !== sceneId ? s : { ...s, modelId: nm.id, resolution: nm.resolutions.includes(s.resolution) ? s.resolution : nm.defaultResolution, durationSec: fitDuration(nm, s.durationSec), mode: nm.modes.includes(s.mode) ? s.mode : ((["first_frame", "first_last", "reference"] as const).find((x) => nm.modes.includes(x)) ?? "first_frame") })));
  };
  const [ask, setAsk] = useState<null | { kind: "image"; shotIds: string[] } | { kind: "video"; shotIds: string[] }>(null);
  const [uploading, setUploading] = useState(false);
  const scene = scenes.find((s) => s.id === sceneId) ?? null;
  const list = useMemo(() => shotsOf(p, sceneId), [p, sceneId]);
  const sbImg = scene ? (p.storyboard[scene.id] ?? []).find((i) => i.approved && !i.removed) : null;
  const setShots = (next: DramaShot[]) => ctl.edit("shots", next);
  const setShot = (id: string, patch: Partial<DramaShot>) => setShots(shots.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const reorder = (id: string, dir: -1 | 1) => {
    const ordered = shotsOf(p, sceneId);
    const i = ordered.findIndex((s) => s.id === id);
    const j = i + dir;
    if (j < 0 || j >= ordered.length) return;
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
    const order = new Map(ordered.map((s, k) => [s.id, k]));
    setShots(shots.map((s) => (order.has(s.id) ? { ...s, order: order.get(s.id)!, continueFromPrev: order.get(s.id) === 0 ? false : s.continueFromPrev } : s)));
  };
  const clipsOf = (shotId: string) => p.clips.filter((c) => c.shotId === shotId && !c.removed);
  const latestClip = (shotId: string): DramaClip | null => {
    const cs = clipsOf(shotId);
    return cs.filter((c) => c.approved).pop() ?? cs[cs.length - 1] ?? null;
  };
  const running = (pred: (t: (typeof p.tasks)[number]) => boolean) => p.tasks.some((t) => pred(t) && (t.status === "generating" || t.status === "requesting" || (t.status === "queued" && Boolean(t.dependsOn))));
  const shotTasks = (id: string) => (t: (typeof p.tasks)[number]) => (t.target.type === "shot" && t.target.shotId === id) || (t.target.type === "clip" && t.target.shotId === id);
  const lastFail = (id: string) => [...p.tasks].reverse().find((t) => shotTasks(id)(t) && t.status === "fail" && !p.tasks.some((x) => shotTasks(id)(x) && x.createdAt > t.createdAt && x.status !== "fail"));
  const readyForVideo = list.filter((s) => s.approved && (approvedShotImage(s) || (s.continueFromPrev && s.order > 0)) && !running(shotTasks(s.id)));
  const needImage = list.filter((s) => s.approved && !approvedShotImage(s) && !running(shotTasks(s.id)));

  async function upload(files: File[], kind: "image" | "audio", target: Record<string, unknown>) {
    setUploading(true);
    try {
      await ctl.flush();
      ctl.apply(await ctl.enqueue(() => studioApi.upload(p.id, files[0], kind, target)));
    } catch (e) {
      ctl.setError(e instanceof Error ? e.message : "올리지 못했습니다.");
    } finally {
      setUploading(false);
    }
  }
  async function confirmRun() {
    if (!ask) return;
    const a = ask;
    setAsk(null);
    if (a.kind === "image") await ctl.run("샷 이미지", () => studioApi.images(p.id, { jobs: a.shotIds.map((shotId) => ({ target: { type: "shot" as const, shotId } })), modelId: IMG_MODEL, clientRequestId: newRequestId() }));
    else
      await ctl.run("샷 영상", () =>
        studioApi.videos(p.id, {
          // 서버가 샷 설정으로 옵션을 채운다 (options 는 형식만)
          jobs: a.shotIds.map((shotId) => ({ shotId, sceneIds: [], options: { modelId: "seedance-2-mini", mode: "first_frame", durationSec: 5, resolution: "720p", aspect: p.settings.aspect, audio: true } })),
          clientRequestId: newRequestId(),
        }),
      );
  }
  const costShots = ask?.kind === "video" ? list.filter((s) => ask.shotIds.includes(s.id)) : [];
  const cost = shotCostSummary(costShots);

  /** 이 장면 샷들의 최신 클립을 승인하고 타임라인을 샷 순서대로 */
  function toTimeline() {
    const pick = new Set(list.map((s) => latestClip(s.id)?.id).filter(Boolean) as string[]);
    const clips = p.clips.map((c) => (pick.has(c.id) ? { ...c, approved: true } : c.shotId && list.some((s) => s.id === c.shotId) ? { ...c, approved: false } : c));
    ctl.edit("clips", clips);
    ctl.edit("timeline", buildTimeline({ ...p, clips }));
  }

  if (!scenes.length) return null;
  return (
    <SectionCard
      title="촬영 샷으로 나눠 만들기 (샷 단위 AI 영상)"
      icon={Clapperboard}
      description="스토리보드 1장을 서로 다른 구도의 샷 여러 개로 나눠 샷마다 움직이는 AI 영상을 만듭니다. 기본 모델 Seedance 2.0 Mini (720p · 5초 · 프로젝트 화면 비율). 순서: 샷 나누기 → 샷 승인 → 기준 이미지 승인 → 영상 → 연결 검수 → 타임라인."
      data-shot-studio
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <label className="space-y-1">
            <span className="text-[12px] font-medium text-fg-muted">스토리보드 (장면)</span>
            <Select value={sceneId} options={scenes.map((s, i) => ({ value: s.id, label: `#${i + 1} ${s.title.slice(0, 20)}${shotsOf(p, s.id).length ? ` · 샷 ${shotsOf(p, s.id).length}` : ""}${withFrame.includes(s) ? "" : " (이미지 없음)"}` }))} onChange={(e) => setSceneId(e.target.value)} className="w-72" aria-label="장면" data-shot-scene />
          </label>
          <label className="space-y-1">
            <span className="text-[12px] font-medium text-fg-muted">샷 수</span>
            <Select value={String(count)} options={[1, 2, 3, 4].map((n) => ({ value: String(n), label: `${n}개` }))} onChange={(e) => setCount(Number(e.target.value))} className="w-20" aria-label="샷 수" />
          </label>
          <label className="space-y-1">
            <span className="text-[12px] font-medium text-fg-muted">새 샷 기본 모델</span>
            <Select value={planModel} options={shotModels.map((x) => ({ value: x.id, label: modelOptionLabel(x) }))} onChange={(e) => setPlanModel(e.target.value)} className="w-64" aria-label="새 샷 기본 모델" data-shot-default-model />
          </label>
          <Button variant="primary" icon={Wand2} disabled={!scene || Boolean(ctl.busy)} loading={ctl.busy === "샷 나누기"} onClick={() => void ctl.run("샷 나누기", () => studioApi.generate(p.id, "shots-plan", { sceneId, count, modelId: planModel, replace: list.length > 0 && window.confirm("이미지·영상이 없는 기존 샷은 지우고 새로 나눌까요? (취소 = 기존 샷 뒤에 추가)") }))} data-shot-plan>
            AI 로 샷 나누기 (AI 1회)
          </Button>
          <Button variant="secondary" icon={Plus} disabled={!scene || list.length >= MAX_SHOTS_PER_SCENE} onClick={() => setShots([...shots, emptyShot(sceneId, list.length, { title: "새 샷", durationSec: fitDuration(videoModel(planModel)!, DEFAULT_SHOT_SEC), modelId: planModel, resolution: videoModel(planModel)!.defaultResolution })])}>
            샷 추가
          </Button>
        </div>

        {scene && (
          <div className="flex gap-3 rounded-control bg-subtle/60 p-2 text-[12px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {sbImg && ctl.urls[sbImg.key] ? <img src={ctl.urls[sbImg.key]} alt="" className="h-28 w-auto rounded object-cover" /> : <div className="flex h-28 w-16 items-center justify-center rounded bg-subtle text-fg-subtle">없음</div>}
            <div className="min-w-0 space-y-1">
              <p className="font-semibold text-fg">
                #{scenes.indexOf(scene) + 1} {scene.title} · {scene.location} · {scene.timeOfDay}
              </p>
              <p className="line-clamp-3 text-fg-muted">{scene.action}</p>
              {scene.dialogue && <p className="line-clamp-2 whitespace-pre-line text-fg-subtle">{scene.dialogue}</p>}
              {!sbImg && <p className="text-warning">이 장면은 승인한 스토리보드 이미지가 없어 샷 기준 이미지의 배경·위치 기준이 약합니다.</p>}
            </div>
          </div>
        )}

        {list.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-control border border-line p-2">
            <Select value="" options={[{ value: "", label: "이 장면 샷 모델 한 번에 바꾸기…" }, ...shotModels.map((x) => ({ value: x.id, label: modelOptionLabel(x) }))]} onChange={(e) => e.target.value && setSceneModel(e.target.value)} className="h-8 w-56 text-[12.5px]" aria-label="이 장면 샷 모델" data-shot-scene-model />
            <Button size="sm" variant="secondary" icon={Check} disabled={list.every((s) => s.approved)} onClick={() => setShots(shots.map((s) => (s.sceneId === sceneId ? { ...s, approved: true } : s)))}>
              이 장면 샷 모두 승인
            </Button>
            <Button size="sm" variant="secondary" icon={Sparkles} disabled={!needImage.length || Boolean(ctl.busy)} onClick={() => setAsk({ kind: "image", shotIds: needImage.map((s) => s.id) })} data-shot-images>
              기준 이미지 없는 샷 만들기 ({needImage.length})
            </Button>
            <Button size="sm" variant="primary" icon={Clapperboard} disabled={!readyForVideo.length || Boolean(ctl.busy)} onClick={() => setAsk({ kind: "video", shotIds: readyForVideo.map((s) => s.id) })} data-shot-videos>
              준비된 샷 영상 만들기 ({readyForVideo.length})
            </Button>
            <Button size="sm" variant="ghost" icon={ListPlus} disabled={!list.some((s) => latestClip(s.id))} onClick={toTimeline} data-shot-timeline>
              이 장면 샷들을 타임라인에 순서대로
            </Button>
            <Button size="sm" variant="ghost" icon={ScanFace} disabled={Boolean(ctl.busy) || !list.some((s) => latestClip(s.id)?.approved)} onClick={() => window.confirm("이 장면의 승인한 샷 클립 얼굴을 캐릭터 기준 이미지와 비교합니다 (AI 이미지 읽기, 클립 수만큼). 진행할까요?") && void ctl.run("얼굴 검사", () => studioApi.generate(p.id, "face-check", { target: "clips", ids: list.map((s) => latestClip(s.id)?.id).filter(Boolean) }))}>
              얼굴 검사 (AI)
            </Button>
          </div>
        )}

        <ol className="space-y-3" data-shot-list>
          {list.map((s, k) => {
            const img = approvedShotImage(s);
            const clip = latestClip(s.id);
            const prev = k > 0 ? list[k - 1] : null;
            const prevClip = prev ? latestClip(prev.id) : null;
            const m = videoModel(s.modelId);
            const fit = dialogueFit(s);
            const fail = lastFail(s.id);
            const busy = running(shotTasks(s.id));
            return (
              <li key={s.id} className={cn("rounded-control border p-3", s.approved ? "border-success/60" : "border-line")} data-shot>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Badge tone="brand">{shotCode(p, s)}</Badge>
                  <Select value={s.kind} options={SHOT_KINDS.map((x) => ({ value: x.value, label: x.label }))} onChange={(e) => setShot(s.id, { kind: e.target.value as ShotKind })} className="h-8 w-36 text-[12.5px]" aria-label="샷 종류" />
                  <Input value={s.title} onChange={(e) => setShot(s.id, { title: e.target.value })} placeholder="무엇을 보여 주는 샷인지 (한국어)" className="h-8 min-w-[200px] flex-1 text-[13px]" aria-label="샷 제목" />
                  <Button size="sm" variant={s.approved ? "primary" : "secondary"} icon={Check} onClick={() => setShot(s.id, { approved: !s.approved })}>
                    {s.approved ? "샷 승인됨" : "샷 승인"}
                  </Button>
                  <span className="flex">
                    <Button size="sm" variant="ghost" icon={ArrowUp} aria-label="앞으로" disabled={k === 0} onClick={() => reorder(s.id, -1)} />
                    <Button size="sm" variant="ghost" icon={ArrowDown} aria-label="뒤로" disabled={k === list.length - 1} onClick={() => reorder(s.id, 1)} />
                    <Button size="sm" variant="ghost" icon={Trash2} aria-label="샷 지우기" onClick={() => window.confirm(`${shotCode(p, s)} 샷을 지울까요? (만든 영상은 클립 목록에 남습니다)`) && setShots(shots.filter((x) => x.id !== s.id).map((x) => (x.sceneId === sceneId && x.order > s.order ? { ...x, order: x.order - 1 } : x)))} />
                  </span>
                </div>
                <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  {/* 설정 */}
                  <div className="space-y-2">
                    <Textarea rows={2} value={s.action} onChange={(e) => setShot(s.id, { action: e.target.value })} placeholder="핵심 행동 한 가지 (영어 권장: 누가 무엇을, 손·시선·표정)" className="text-[12.5px]" aria-label="행동 프롬프트" />
                    <Input value={s.camera} onChange={(e) => setShot(s.id, { camera: e.target.value })} placeholder="카메라 움직임 (예: slow push-in, static medium shot)" className="h-8 text-[12.5px]" aria-label="카메라" />
                    <Textarea rows={2} value={s.dialogue} onChange={(e) => setShot(s.id, { dialogue: e.target.value })} placeholder="이 샷 대사 ('이름: 대사' 줄바꿈, 없으면 비우기)" className="text-[12.5px]" aria-label="대사" />
                    <div className="flex flex-wrap gap-1">
                      {p.characters.map((c) => {
                        const on = s.characterIds.includes(c.id);
                        return (
                          <button key={c.id} type="button" onClick={() => setShot(s.id, { characterIds: on ? s.characterIds.filter((x) => x !== c.id) : [...s.characterIds, c.id] })} className={cn("rounded-full px-2 py-0.5 text-[11.5px] ring-1 ring-inset", on ? "bg-brand-soft text-brand ring-brand/40" : "text-fg-subtle ring-line")}>
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                      <Select value={s.modelId} options={VIDEO_MODELS.map((x) => ({ value: x.id, label: modelOptionLabel(x) }))} onChange={(e) => {
                        const nm = videoModel(e.target.value)!;
                        setShot(s.id, { modelId: nm.id, resolution: nm.resolutions.includes(s.resolution) ? s.resolution : nm.defaultResolution, durationSec: fitDuration(nm, s.durationSec), mode: nm.modes.includes(s.mode) ? s.mode : ((["first_frame", "first_last", "reference"] as const).find((x) => nm.modes.includes(x)) ?? "first_frame") });
                      }} className="h-8 w-40" aria-label="영상 모델" />
                      <Select value={s.resolution} options={(m?.resolutions ?? []).map((r) => ({ value: r, label: r }))} onChange={(e) => setShot(s.id, { resolution: e.target.value })} className="h-8 w-20" aria-label="해상도" />
                      <Select value={String(s.durationSec)} options={(m ? durationChoices(m) : [5]).map((n) => ({ value: String(n), label: `${n}초` }))} onChange={(e) => setShot(s.id, { durationSec: Number(e.target.value) })} className="h-8 w-20" aria-label="길이" />
                      <Select value={s.mode} options={(["first_frame", "first_last", "reference"] as const).filter((x) => m?.modes.includes(x)).map((x) => ({ value: x, label: x === "first_last" ? "시작+끝 프레임 (끝 = 다음 샷 이미지)" : MODE_LABEL[x].split(" (")[0] }))} onChange={(e) => setShot(s.id, { mode: e.target.value as DramaShot["mode"], continueFromPrev: e.target.value === "first_frame" ? s.continueFromPrev : false })} className="h-8 w-56" aria-label="입력 방식" />
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-[12px]">
                      <ShotCheck checked={s.continueFromPrev} disabled={k === 0 || s.mode !== "first_frame"} onChange={(v) => setShot(s.id, { continueFromPrev: v })} label="앞 샷 마지막 프레임에서 이어 만들기 (같은 인물·같은 행동일 때만)" />
                      <ShotCheck checked={s.audio} disabled={m?.audio !== "toggle"} onChange={(v) => setShot(s.id, { audio: v })} label="AI 소리 만들기" />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                      <Mic className="size-3.5 text-fg-subtle" />
                      <Select value={s.voiceSource} options={[{ value: "ai", label: "음성: AI 생성 (영상과 함께)" }, { value: "upload", label: "음성: 올린 파일" }, { value: "none", label: "음성 없음" }]} onChange={(e) => setShot(s.id, { voiceSource: e.target.value as DramaShot["voiceSource"] })} className="h-8 w-52" aria-label="음성" />
                      {s.voiceSource === "upload" && (
                        <UploadButton accept="audio/mpeg,audio/mp4,audio/wav,.mp3,.m4a,.wav" disabled={uploading} onFiles={(f) => void upload(f, "audio", { type: "shot-voice", shotId: s.id })}>
                          {s.voiceKey ? `바꾸기 (${(s.voiceName ?? "").slice(0, 14)})` : "음성 파일 올리기"}
                        </UploadButton>
                      )}
                    </div>
                    {s.dialogue.trim() && (
                      <p className={cn("text-[12px]", fit.ok ? "text-fg-subtle" : "text-warning")}>
                        대사를 말하는 데 약 {fit.needSec}초 필요 / 샷 {s.durationSec}초{fit.ok ? "" : " — 샷을 늘리거나 대사를 나눠 주세요"}
                      </p>
                    )}
                  </div>
                  {/* 기준 이미지 · 영상 · 검수 */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button size="sm" variant="secondary" icon={Sparkles} disabled={!s.approved || busy || Boolean(ctl.busy)} onClick={() => setAsk({ kind: "image", shotIds: [s.id] })} title={s.approved ? "" : "샷을 먼저 승인해 주세요"}>
                        {img ? "기준 이미지 다시" : "기준 이미지 만들기"}
                      </Button>
                      <UploadButton accept="image/png,image/jpeg,image/webp" variant="ghost" disabled={uploading} onFiles={(f) => void upload(f, "image", { type: "shot-image", shotId: s.id })}>
                        이미지 올리기
                      </UploadButton>
                      <Button size="sm" variant="primary" icon={Clapperboard} disabled={!s.approved || (!img && !(s.continueFromPrev && k > 0)) || busy || Boolean(ctl.busy)} onClick={() => setAsk({ kind: "video", shotIds: [s.id] })} data-shot-video>
                        {clip ? "영상 다시 만들기" : "영상 만들기"}
                      </Button>
                      {busy && <Badge tone={taskTone("generating")}>{TASK_LABEL.generating}</Badge>}
                    </div>
                    {fail && <p className="text-[12px] text-danger">실패: {fail.error} — 이 샷만 다시 만들 수 있습니다.</p>}
                    <ShotImages shot={s} urls={ctl.urls} onChange={(images) => setShot(s.id, { images })} />
                    {clip && (
                      <div className="space-y-1.5 rounded-control border border-line p-2" data-shot-review>
                        <div className="flex flex-wrap items-center gap-2 text-[12px]">
                          <span className="font-medium">영상 {clipsOf(s.id).length}개 중 최신</span>
                          {clip.faceCheck && (clip.faceCheck.ok ? <Badge tone="success">얼굴 같음</Badge> : <Badge tone="danger">얼굴 다름</Badge>)}
                          <Button size="sm" variant={clip.approved ? "primary" : "secondary"} icon={Check} onClick={() => ctl.edit("clips", p.clips.map((c) => (c.id === clip.id ? { ...c, approved: !c.approved } : c.shotId === s.id ? { ...c, approved: false } : c)))}>
                            {clip.approved ? "이 영상 사용 중" : "이 영상 쓰기"}
                          </Button>
                          {s.dialogue.trim() && <ShotCheck checked={Boolean(s.syncChecked)} onChange={(v) => setShot(s.id, { syncChecked: v })} label="입모양·대사 싱크 확인함" />}
                        </div>
                        {ctl.urls[clip.key] && <video src={ctl.urls[clip.key]} controls playsInline preload="metadata" className={cn("max-h-72 rounded bg-black", p.settings.aspect === "9:16" ? "aspect-[9/16]" : "aspect-video w-full")} />}
                        {/* 연결 검수: 앞 샷 끝 ↔ 이 샷 시작, 이 샷 끝 */}
                        <div className="flex flex-wrap items-end gap-2 text-[11px] text-fg-subtle">
                          {prev && <Frame label={`앞 샷 끝 (${shotCode(p, prev)})`} k={prevClip?.lastFrameKey} urls={ctl.urls} />}
                          <Frame label="이 샷 시작" k={clip.firstFrameKey} urls={ctl.urls} />
                          <Frame label="이 샷 끝" k={clip.lastFrameKey} urls={ctl.urls} />
                          <span className="max-w-[220px]">얼굴·의상·배경·시선·위치가 이어지는지 보고, 어긋난 샷만 [영상 다시 만들기] 하세요.</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
        {!list.length && scene && <p className="text-[13px] text-fg-subtle">[AI 로 샷 나누기]를 누르면 이 장면을 전체·클로즈업·대사·반응·인서트·이동 샷 중에서 골라 나눠 줍니다. 직접 [샷 추가]도 됩니다.</p>}
        <CharacterVoices ctl={ctl} />
      </div>

      <CostConfirm
        open={ask?.kind === "image"}
        title="샷 기준 이미지 만들기"
        items={ask?.kind === "image" ? [{ label: "Nano Banana Edit (인물 기준 이미지 + 장면 스토리보드 참고)", count: ask.shotIds.length, credits: estimateImageCredits(IMG_MODEL, ask.shotIds.length) }] : []}
        notes={["샷마다 1장 = Kie 요청 1번. 마음에 드는 1장을 승인하면 그 이미지가 영상의 시작 프레임이 됩니다."]}
        onCancel={() => setAsk(null)}
        onConfirm={() => void confirmRun()}
        busy={ctl.busy === "샷 이미지"}
      />
      <CostConfirm
        open={ask?.kind === "video"}
        title={`샷 영상 만들기 · 총 ${cost.shots}샷 · ${cost.seconds}초`}
        items={cost.lines.map((l) => ({ label: `${l.label} · ${l.shots}샷 · ${l.seconds}초`, count: l.shots, credits: l.credits }))}
        notes={[
          `Mini ${cost.lines.filter((l) => l.modelId === "seedance-2-mini").reduce((n, l) => n + l.shots, 0)}샷 · Fast ${cost.lines.filter((l) => l.modelId === "seedance-2-fast").reduce((n, l) => n + l.shots, 0)}샷 · 기타 ${cost.lines.filter((l) => !["seedance-2-mini", "seedance-2-fast"].includes(l.modelId)).reduce((n, l) => n + l.shots, 0)}샷`,
          "샷 1개 = Kie 요청 1번. 이미 만든 영상은 그대로 두고 새 버전을 더합니다. 실패해도 자동으로 다시 보내지 않습니다 (Kie 는 실패 작업에 비용을 받지 않음).",
          "'앞 샷에서 이어 만들기'를 켠 샷은 앞 샷 영상이 끝난 뒤 그 마지막 프레임으로 보냅니다.",
        ]}
        onCancel={() => setAsk(null)}
        onConfirm={() => void confirmRun()}
        busy={ctl.busy === "샷 영상"}
      />
    </SectionCard>
  );
}

/** 글자가 보이는 체크박스 */
function ShotCheck({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <label className={cn("flex items-center gap-1.5 text-[12px]", disabled ? "text-fg-subtle" : "text-fg-muted")}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="accent-[var(--color-brand)]" />
      {label}
    </label>
  );
}

function Frame({ label, k, urls }: { label: string; k?: string | null; urls: Record<string, string> }) {
  return (
    <span className="flex flex-col items-center gap-0.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {k && urls[k] ? <img src={urls[k]} alt={label} className="h-28 w-auto rounded border border-line object-cover" /> : <span className="flex h-28 w-16 items-center justify-center rounded bg-subtle">없음</span>}
      {label}
    </span>
  );
}

function ShotImages({ shot, urls, onChange }: { shot: DramaShot; urls: Record<string, string>; onChange: (images: DramaImage[]) => void }) {
  const list = shot.images.filter((i) => !i.removed);
  if (!list.length) return <p className="text-[12px] text-fg-subtle">기준 이미지가 없습니다 (샷 승인 → 만들기 또는 올리기).</p>;
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1">
      {[...list].reverse().map((img) => (
        <div key={img.id} className={cn("w-[92px] shrink-0 rounded border p-0.5", img.approved ? "border-success ring-1 ring-success" : "border-line")}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {urls[img.key] ? <img src={urls[img.key]} alt="" className="aspect-[9/16] w-full rounded object-cover" /> : <div className="aspect-[9/16] rounded bg-subtle" />}
          <div className="mt-0.5 flex items-center">
            <button type="button" className={cn("flex-1 rounded px-1 py-0.5 text-[10.5px]", img.approved ? "bg-success text-white" : "bg-subtle text-fg-muted")} onClick={() => onChange(shot.images.map((x) => ({ ...x, approved: x.id === img.id })))}>
              {img.approved ? "승인됨" : "승인"}
            </button>
            <button type="button" aria-label="지우기" className="p-0.5 text-fg-subtle hover:text-danger" onClick={() => window.confirm("이 기준 이미지를 지울까요?") && onChange(shot.images.map((x) => (x.id === img.id ? { ...x, removed: true, approved: false } : x)))}>
              <Trash2 className="size-3" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

/** 인물 목소리 설정 (AI 음성 생성 프롬프트에 넣는다). 바꿔도 앞 단계 승인은 그대로 */
function CharacterVoices({ ctl }: { ctl: ProjectCtl }) {
  const p = ctl.project!;
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-control border border-line p-2" data-character-voices>
      <button type="button" className="flex w-full items-center gap-1.5 text-left text-[12.5px] font-medium" onClick={() => setOpen((x) => !x)}>
        <Mic className="size-3.5" /> 인물 목소리 설정 (직접 고친 인물 {p.characters.filter((c) => c.voice?.trim()).length}/{p.characters.length} · 나머지는 추천 목소리) {open ? "▲" : "▼"}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          <Notice tone="info">AI 영상 모델이 대사 소리를 만들 때 넣는 목소리 설명입니다 (비워 두면 성별·나이·말투로 고른 추천 목소리). 모델이 클립마다 목소리를 새로 만들어 완전히 같은 목소리는 보장되지 않습니다. 별도 음성 파일은 샷마다 [음성: 올린 파일]로 넣습니다. 따로 립싱크 API 는 쓰지 않고, 대사 샷은 영상을 보고 [싱크 확인함]을 체크합니다.</Notice>
          {p.characters.map((c) => (
            <label key={c.id} className="flex items-center gap-2 text-[12.5px]">
              <span className="w-20 shrink-0 truncate font-medium">{c.name}</span>
              <Input value={c.voice ?? recommendedVoice(c)} onChange={(e) => ctl.edit("characters", p.characters.map((x) => (x.id === c.id ? { ...x, voice: e.target.value.slice(0, 120) } : x)))} placeholder={recommendedVoice(c)} className="h-8 flex-1 text-[12.5px]" />
              {!c.voice?.trim() && <span className="shrink-0 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] text-brand">추천</span>}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
