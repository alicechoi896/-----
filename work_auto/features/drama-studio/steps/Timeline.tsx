"use client";

import { useEffect, useState } from "react";
import { BGM_DEFAULT_VOLUME } from "@/lib/drama-studio/steps";
import { newRequestId } from "../api";
import { ArrowDown, ArrowUp, Clapperboard, Download, GripVertical, Music, Trash2, Wand2 } from "lucide-react";
import { Badge, Button, EmptyState, IconButton, Input, Notice, SectionCard, Select, Textarea } from "@/components/ui";
import type { TimelineItem } from "@/lib/drama-studio/types";
import { cn, formatRelative } from "@/lib/utils";
import { buildTimeline, clipSubtitle } from "@/lib/drama-studio/steps";
import { shotCode } from "@/lib/drama-studio/shots";
import { studioApi } from "../api";
import { CostConfirm, TASK_LABEL, UploadButton, taskTone } from "../ui";
import type { ProjectCtl } from "../useProject";

/** 장면이 여러 타임라인 클립에 들어 있으면 (묶음 1~5 + 개별 3 같은 중복) */
export function duplicateScenes(timeline: TimelineItem[], clipScenes: (clipId: string) => string[]): string[] {
  const seen = new Map<string, number>();
  for (const t of timeline) for (const id of clipScenes(t.clipId)) seen.set(id, (seen.get(id) ?? 0) + 1);
  return [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
}

/** 타임라인: 순서(끌기·위아래)·앞뒤 다듬기·소리 켜고 끄기·빼기 → 최종 병합 (FFmpeg, 서버) */
export function Timeline({ ctl }: { ctl: ProjectCtl }) {
  const p = ctl.project!;
  const tl = p.timeline;
  const [drag, setDrag] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const rs = p.renderSettings;
  const clipOf = (id: string) => p.clips.find((c) => c.id === id);
  const sceneNo = (id: string) => p.scenario.scenes.findIndex((s) => s.id === id) + 1;
  const len = (t: TimelineItem) => Math.max(0.3, (clipOf(t.clipId)?.durationSec ?? 0) - t.trimStart - t.trimEnd);
  const total = tl.reduce((n, t) => n + len(t), 0);
  const dups = duplicateScenes(tl, (id) => clipOf(id)?.sceneIds ?? []);
  const set = (list: TimelineItem[]) => ctl.edit("timeline", list);
  const patch = (id: string, x: Partial<TimelineItem>) => set(tl.map((t) => (t.id === id ? { ...t, ...x } : t)));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= tl.length || from === to) return;
    const list = [...tl];
    const [it] = list.splice(from, 1);
    list.splice(to, 0, it);
    set(list);
  };
  const [musicNote, setMusicNote] = useState("");
  const [musicAsk, setMusicAsk] = useState(false);
  const musicTasks = p.tasks.filter((t) => t.kind === "music");
  const musicBusy = musicTasks.some((t) => t.status === "generating" || t.status === "requesting");
  const tracks = p.bgmTracks ?? [];
  async function makeMusic() {
    const clientRequestId = newRequestId();
    setMusicAsk(false);
    await ctl.run("음악 만들기", () => studioApi.music(p.id, { note: musicNote, clientRequestId }));
  }
  // v0.9.104: 효과음 목록 (자료 폴더, 외부 호출 없음)
  const [sfxList, setSfxList] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    studioApi
      .home()
      .then((h) => alive && setSfxList(h.sfx ?? []))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  const running = p.renders.some((r) => r.status === "running");
  const lastOk = [...p.renders].reverse().find((r) => r.status === "success");
  async function uploadLogo(files: File[]) {
    setUploading(true);
    try {
      await ctl.flush();
      ctl.apply(await ctl.enqueue(() => studioApi.upload(p.id, files[0], "image", { type: "logo" })));
    } catch (e) {
      ctl.setError(e instanceof Error ? e.message : "올리지 못했습니다.");
    } finally {
      setUploading(false);
    }
  }
  async function uploadBgm(files: File[]) {
    setUploading(true);
    try {
      await ctl.flush();
      ctl.apply(await ctl.enqueue(() => studioApi.upload(p.id, files[0], "audio", { type: "bgm" })));
    } catch (e) {
      ctl.setError(e instanceof Error ? e.message : "올리지 못했습니다.");
    } finally {
      setUploading(false);
    }
  }
  return (
    <>
      <SectionCard
        title={`타임라인 · ${tl.length}개 · ${total.toFixed(1)}초 / 목표 ${p.settings.targetSec}초`}
        icon={Clapperboard}
        actions={
          tl.length > 0 && (
            <Button size="sm" variant="secondary" onClick={() => set(buildTimeline(p))} data-timeline-rebuild>
              장면 순서로 정리 (중복 빼기)
            </Button>
          )
        } description="승인한 클립만 넣을 수 있습니다. 줄을 끌어 원하는 자리로 옮기거나(끄는 동안 바로 자리가 바뀜) 화살표로 순서를 바꾸고, 앞·뒤를 초 단위로 다듬습니다. 순서를 바꾼 뒤 [다시 렌더링]을 눌러야 최종 영상에 반영됩니다.">
        {!tl.length ? (
          <EmptyState compact title="타임라인이 비어 있습니다" description="클립 카드에서 [타임라인에]를 눌러 주세요." />
        ) : (
          <>
            {dups.length > 0 && <Notice tone="warning" className="mb-2">같은 장면이 여러 클립에 들어 있습니다: {dups.map((id) => `#${sceneNo(id)}`).join(", ")} (묶음 영상과 개별 영상이 겹치는지 확인해 주세요)</Notice>}
            <ol className="space-y-1.5" data-timeline>
              {tl.map((t, i) => {
                const c = clipOf(t.clipId);
                return (
                  <li
                    key={t.id}
                    draggable
                    // v0.9.92: 끄는 동안 마우스가 지나가는 자리로 바로 옮긴다 (줄 사이 빈 곳에 놓아도 적용). 일부 브라우저는 setData 가 있어야 끌기가 시작된다
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", t.id);
                      setDrag(i);
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (drag !== null && drag !== i) {
                        move(drag, i);
                        setDrag(i);
                      }
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDrag(null);
                    }}
                    onDragEnd={() => setDrag(null)}
                    className={cn("flex cursor-grab flex-wrap items-center gap-2 rounded-control border bg-canvas px-2 py-1.5 text-[12.5px] active:cursor-grabbing", drag === i ? "border-brand bg-brand-soft/40 ring-1 ring-brand" : "border-line", !c?.approved && "border-danger")}
                    data-timeline-item
                  >
                    <GripVertical className="size-4 cursor-grab text-fg-subtle" />
                    <span className="tabular w-5 text-fg-subtle">{i + 1}</span>
                    {c && ctl.urls[c.key] && <video src={ctl.urls[c.key]} preload="metadata" muted draggable={false} className="pointer-events-none h-12 w-8 rounded bg-black object-cover" />}
                    <span className="min-w-28 font-medium text-fg">{c?.shotId && (p.shots ?? []).some((x) => x.id === c.shotId) ? shotCode(p, (p.shots ?? []).find((x) => x.id === c.shotId)!) : c?.sceneIds.length ? c.sceneIds.map((id) => `#${sceneNo(id)}`).join("·") : c?.fileName ?? "클립"}</span>
                    {c && !c.approved && <Badge tone="danger">승인 안 됨 (병합에서 빠짐)</Badge>}
                    <label className="flex items-center gap-1 text-fg-muted">
                      앞
                      <Input type="number" step={0.1} min={0} value={t.trimStart} onChange={(e) => patch(t.id, { trimStart: Math.max(0, Number(e.target.value) || 0) })} className="h-7 w-16" aria-label="앞 다듬기" />
                    </label>
                    <label className="flex items-center gap-1 text-fg-muted">
                      뒤
                      <Input type="number" step={0.1} min={0} value={t.trimEnd} onChange={(e) => patch(t.id, { trimEnd: Math.max(0, Number(e.target.value) || 0) })} className="h-7 w-16" aria-label="뒤 다듬기" />
                    </label>
                    <label className="flex items-center gap-1 text-fg-muted">
                      <input type="checkbox" checked={t.audio} onChange={(e) => patch(t.id, { audio: e.target.checked })} className="accent-[var(--color-brand)]" />
                      원본 소리
                    </label>
                    {sfxList.length > 0 && (
                      <Select value={t.sfx ?? ""} options={[{ value: "", label: "효과음 없음" }, ...sfxList.map((x) => ({ value: x, label: x.replace(/\.[^.]+$/, "").slice(0, 18) }))]} onChange={(e) => patch(t.id, { sfx: e.target.value || null })} className="h-7 w-32 text-[12px]" aria-label="효과음" data-timeline-sfx />
                    )}
                    <span className="tabular text-fg-subtle">{len(t).toFixed(1)}초</span>
                    <span className="ml-auto flex">
                      <IconButton icon={ArrowUp} label="앞으로" disabled={i === 0} onClick={() => move(i, i - 1)} />
                      <IconButton icon={ArrowDown} label="뒤로" disabled={i === tl.length - 1} onClick={() => move(i, i + 1)} />
                      <IconButton icon={Trash2} label="타임라인에서 빼기" onClick={() => set(tl.filter((x) => x.id !== t.id))} />
                    </span>
                    {rs.subtitles && (
                      <Textarea
                        rows={2}
                        value={t.subtitle ?? ""}
                        placeholder={(c ? clipSubtitle(p, c) : "") || "자막 (한 줄에 하나씩, 비우면 장면·샷 대사)"}
                        onChange={(e) => patch(t.id, { subtitle: e.target.value })}
                        onDragStart={(e) => e.stopPropagation()}
                        draggable={false}
                        className="basis-full text-[12.5px]"
                        aria-label={`${i + 1}번 클립 자막`}
                        data-timeline-subtitle
                      />
                    )}
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </SectionCard>

      <SectionCard title="최종 병합" icon={Wand2} description="타임라인 순서대로 하나의 MP4 로 만듭니다 (화면 비율·해상도 720p·30fps 통일, 외부 유료 호출 없음). 자막(장면 대사 또는 직접 쓴 줄)·왼쪽 위 로고·배경음악을 넣을 수 있습니다. 개별 이미지·클립은 지우지 않습니다.">
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1">
              <span className="text-[12px] font-medium text-fg-muted">최종 제목</span>
              <Input value={rs.title} onChange={(e) => ctl.edit("renderSettings", { ...rs, title: e.target.value })} className="h-9 w-56" />
            </label>
            <label className="space-y-1">
              <span className="text-[12px] font-medium text-fg-muted">컷 전환</span>
              <Select value={rs.transition} options={[{ value: "none", label: "바로 이어 붙이기" }, { value: "fade", label: "짧은 페이드" }]} onChange={(e) => ctl.edit("renderSettings", { ...rs, transition: e.target.value as "none" | "fade" })} className="w-40" aria-label="컷 전환" />
            </label>
            <div className="space-y-1">
              <span className="text-[12px] font-medium text-fg-muted">배경음악</span>
              <div className="flex items-center gap-2">
                {rs.bgmKey ? (
                  <>
                    <Badge tone="brand">
                      <Music className="mr-1 inline size-3" />
                      {rs.bgmName ?? "음악"}
                    </Badge>
                    <Button size="sm" variant="ghost" onClick={() => ctl.edit("renderSettings", { ...rs, bgmKey: null, bgmName: null })}>
                      빼기
                    </Button>
                  </>
                ) : (
                  <span className="text-[12px] text-fg-subtle">없음 (아래에서 만들거나 올리기)</span>
                )}
              </div>
            </div>
            <div className="space-y-1" data-subtitle-settings>
              <span className="text-[12px] font-medium text-fg-muted">자막</span>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-[13px]">
                  <input type="checkbox" checked={Boolean(rs.subtitles)} onChange={(e) => ctl.edit("renderSettings", { ...rs, subtitles: e.target.checked })} className="accent-[var(--color-brand)]" />
                  자막 넣기
                </label>
                {rs.subtitles && (
                  <Select value={rs.subtitleSize ?? "m"} options={[{ value: "s", label: "작게" }, { value: "m", label: "보통" }, { value: "l", label: "크게" }]} onChange={(e) => ctl.edit("renderSettings", { ...rs, subtitleSize: e.target.value as "s" | "m" | "l" })} className="h-8 w-20" aria-label="자막 크기" />
                )}
              </div>
            </div>
            <div className="space-y-1" data-logo-settings>
              <span className="text-[12px] font-medium text-fg-muted">왼쪽 위 로고</span>
              <div className="flex items-center gap-2">
                {rs.logoKey ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {ctl.urls[rs.logoKey] && <img src={ctl.urls[rs.logoKey]} alt="로고" className="h-8 w-auto rounded border border-line bg-subtle" />}
                    <Button size="sm" variant="ghost" onClick={() => ctl.edit("renderSettings", { ...rs, logoKey: null, logoName: null })}>
                      빼기
                    </Button>
                  </>
                ) : (
                  <UploadButton accept="image/png,image/jpeg,image/webp" disabled={uploading} onFiles={(f) => void uploadLogo(f)}>
                    로고 올리기
                  </UploadButton>
                )}
              </div>
            </div>
            {rs.bgmKey && (
              <label className="space-y-1">
                <span className="text-[12px] font-medium text-fg-muted">
                  음악 볼륨 {Math.round(rs.bgmVolume * 100)}% {Math.abs(rs.bgmVolume - BGM_DEFAULT_VOLUME) < 0.005 ? "(기본: 아주 작게)" : ""}
                </span>
                <input type="range" min={0} max={0.5} step={0.01} value={Math.min(0.5, rs.bgmVolume)} onChange={(e) => ctl.edit("renderSettings", { ...rs, bgmVolume: Number(e.target.value) })} className="block w-40 accent-[var(--color-brand)]" />
              </label>
            )}
            <Button variant="primary" icon={Clapperboard} className="ml-auto" disabled={!tl.length || running || Boolean(ctl.busy)} loading={running} onClick={() => void ctl.run("병합 시작", () => studioApi.render(p.id))} data-render>
              {running ? "병합 중…" : lastOk ? "다시 렌더링" : "최종 영상 만들기"}
            </Button>
          </div>
          <div className="rounded-control border border-line p-3" data-bgm>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Music className="size-4 text-fg-muted" />
              <span className="text-[13px] font-semibold">배경음악 만들기·고르기</span>
              <span className="text-[12px] text-fg-subtle">대사 밑에 아주 작게 깔리고, 대사가 나오면 더 줄어듭니다.</span>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <label className="min-w-[240px] flex-1 space-y-1">
                <span className="text-[12px] font-medium text-fg-muted">어떤 음악? (비우면 장르·분위기로)</span>
                <Input value={musicNote} onChange={(e) => setMusicNote(e.target.value.slice(0, 300))} placeholder="예: 신비롭고 따뜻한 동화풍 피아노와 현악" className="h-9" data-music-note />
              </label>
              <Button variant="primary" icon={Wand2} disabled={musicBusy || Boolean(ctl.busy)} loading={musicBusy || ctl.busy === "음악 만들기"} onClick={() => setMusicAsk(true)} data-make-music>
                {musicBusy ? "음악 만드는 중…" : "AI 음악 만들기"}
              </Button>
              <UploadButton accept="audio/mpeg,audio/mp4,audio/wav,.mp3,.m4a,.wav" disabled={uploading} onFiles={(f) => void uploadBgm(f)}>
                음악 올리기
              </UploadButton>
            </div>
            {musicTasks.slice(-3).reverse().filter((t) => t.status !== "success").map((t) => (
              <p key={t.id} className="mt-2 text-[12px]">
                <Badge tone={taskTone(t.status)}>{TASK_LABEL[t.status] ?? t.status}</Badge> {t.error ?? "Kie Suno 가 연주곡을 만드는 중입니다 (보통 1~3분, 곡 2개)."}
              </p>
            ))}
            {tracks.length > 0 && (
              <ul className="mt-3 space-y-2" data-bgm-tracks>
                {[...tracks].reverse().map((tr) => (
                  <li key={tr.id} className={cn("flex flex-wrap items-center gap-2 rounded border p-2", rs.bgmKey === tr.key ? "border-brand bg-brand-soft" : "border-line")}>
                    <span className="min-w-[110px] text-[12.5px] font-medium">
                      {tr.name}
                      {tr.durationSec ? <span className="ml-1 text-fg-subtle">{Math.round(tr.durationSec)}초</span> : null}
                    </span>
                    {ctl.urls[tr.key] ? <audio src={ctl.urls[tr.key]} controls preload="none" className="h-8 max-w-[280px] flex-1" /> : <span className="text-[12px] text-fg-subtle">미리 듣기 준비 중</span>}
                    {rs.bgmKey === tr.key ? (
                      <Badge tone="brand">사용 중</Badge>
                    ) : (
                      <Button size="sm" variant="secondary" disabled={Boolean(ctl.busy)} onClick={() => void ctl.run("음악 고르기", () => studioApi.generate(p.id, "use-bgm", { trackId: tr.id }))} data-use-bgm>
                        이 음악 쓰기
                      </Button>
                    )}
                    <IconButton icon={Trash2} label="음악 지우기" onClick={() => window.confirm(`'${tr.name}'을 지울까요?`) && void ctl.run("음악 지우기", () => studioApi.generate(p.id, "delete-bgm", { trackId: tr.id }))} />
                  </li>
                ))}
              </ul>
            )}
          </div>
          <CostConfirm
            open={musicAsk}
            title="AI 배경음악 만들기"
            items={[{ label: "Kie Suno V6 연주곡 (가사 없음, 보통 곡 2개)", count: 1, credits: null }]}
            notes={["버튼 1번 = Kie 요청 1번 (자동으로 다시 보내지 않습니다).", "실제 쓴 크레딧은 Kie 가 알려 주는 대로 끝난 뒤 남깁니다.", "만든 음악 파일은 이 프로젝트에 보관됩니다."]}
            onCancel={() => setMusicAsk(false)}
            onConfirm={() => void makeMusic()}
            busy={ctl.busy === "음악 만들기"}
          />
          {p.renders.length > 0 && (
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="danger"
                icon={Trash2}
                disabled={!p.renders.some((r) => r.status !== "running") || Boolean(ctl.busy)}
                onClick={() => window.confirm(`렌더링 영상 ${p.renders.filter((r) => r.status !== "running").length}개를 모두 지울까요? (파일도 지웁니다. 클립·타임라인은 그대로라 다시 렌더링할 수 있습니다)`) && void ctl.run("렌더링 지우기", () => studioApi.generate(p.id, "delete-render", { all: true }))}
                data-renders-delete-all
              >
                렌더링 영상 모두 지우기
              </Button>
            </div>
          )}
          {p.renders.length > 0 && (
            <ul className="space-y-3" data-renders>
              {[...p.renders].reverse().map((r) => (
                <li key={r.id} className="rounded-control border border-line p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="font-semibold">버전 {r.version}</span>
                    <Badge tone={r.status === "success" ? "success" : r.status === "fail" ? "danger" : "info"}>{r.status === "success" ? "완료" : r.status === "fail" ? "실패" : "병합 중"}</Badge>
                    {r.totalSec != null && <span className="text-fg-muted">총 {r.totalSec}초</span>}
                    <span className="text-fg-subtle">{formatRelative(r.createdAt)}</span>
                    {r.status !== "running" && (
                      <Button size="sm" variant="ghost" icon={Trash2} className={r.key && ctl.urls[r.key] ? "" : "ml-auto"} disabled={Boolean(ctl.busy)} onClick={() => window.confirm(`버전 ${r.version} 렌더링 영상을 지울까요? (파일도 지웁니다)`) && void ctl.run("렌더링 지우기", () => studioApi.generate(p.id, "delete-render", { renderId: r.id }))} data-render-delete>
                        지우기
                      </Button>
                    )}
                    {r.key && ctl.urls[r.key] && (
                      <a href={ctl.urls[r.key]} download={`${rs.title || p.title}_v${r.version}.mp4`} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-brand hover:underline" data-render-download>
                        <Download className="size-4" /> MP4 다운로드
                      </a>
                    )}
                  </div>
                  {r.error && <p className="text-[12px] text-danger">{r.error} — 클립은 그대로 있습니다. 고친 뒤 [다시 렌더링]을 눌러 주세요.</p>}
                  {r.key && ctl.urls[r.key] && <video src={ctl.urls[r.key]} controls playsInline className={cn("max-h-[480px] rounded bg-black", p.settings.aspect === "9:16" ? "aspect-[9/16]" : "aspect-video w-full")} />}
                </li>
              ))}
            </ul>
          )}
        </div>
      </SectionCard>
    </>
  );
}
