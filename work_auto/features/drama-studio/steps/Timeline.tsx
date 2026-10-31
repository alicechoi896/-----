"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Clapperboard, Download, GripVertical, Music, Trash2, Wand2 } from "lucide-react";
import { Badge, Button, EmptyState, IconButton, Input, Notice, SectionCard, Select, Textarea } from "@/components/ui";
import type { TimelineItem } from "@/lib/drama-studio/types";
import { cn, formatRelative } from "@/lib/utils";
import { autoSubtitle } from "@/lib/drama-studio/steps";
import { studioApi } from "../api";
import { UploadButton } from "../ui";
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
      <SectionCard title={`타임라인 · ${tl.length}개 · 약 ${total.toFixed(1)}초`} icon={Clapperboard} description="승인한 클립만 넣을 수 있습니다. 줄을 끌어 원하는 자리로 옮기거나(끄는 동안 바로 자리가 바뀜) 화살표로 순서를 바꾸고, 앞·뒤를 초 단위로 다듬습니다. 순서를 바꾼 뒤 [다시 렌더링]을 눌러야 최종 영상에 반영됩니다.">
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
                    <span className="min-w-28 font-medium text-fg">{c?.sceneIds.length ? c.sceneIds.map((id) => `#${sceneNo(id)}`).join("·") : c?.fileName ?? "클립"}</span>
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
                        placeholder={(c ? autoSubtitle(p, c.sceneIds) : "") || "자막 (한 줄에 하나씩, 비우면 장면 대사)"}
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
                  <UploadButton accept="audio/mpeg,audio/mp4,audio/wav,.mp3,.m4a,.wav" disabled={uploading} onFiles={(f) => void uploadBgm(f)}>
                    음악 올리기
                  </UploadButton>
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
                <span className="text-[12px] font-medium text-fg-muted">음악 볼륨 {Math.round(rs.bgmVolume * 100)}%</span>
                <input type="range" min={0} max={1} step={0.05} value={rs.bgmVolume} onChange={(e) => ctl.edit("renderSettings", { ...rs, bgmVolume: Number(e.target.value) })} className="block w-40 accent-[var(--color-brand)]" />
              </label>
            )}
            <Button variant="primary" icon={Clapperboard} className="ml-auto" disabled={!tl.length || running || Boolean(ctl.busy)} loading={running} onClick={() => void ctl.run("병합 시작", () => studioApi.render(p.id))} data-render>
              {running ? "병합 중…" : lastOk ? "다시 렌더링" : "최종 영상 만들기"}
            </Button>
          </div>
          {p.renders.length > 0 && (
            <ul className="space-y-3" data-renders>
              {[...p.renders].reverse().map((r) => (
                <li key={r.id} className="rounded-control border border-line p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-[13px]">
                    <span className="font-semibold">버전 {r.version}</span>
                    <Badge tone={r.status === "success" ? "success" : r.status === "fail" ? "danger" : "info"}>{r.status === "success" ? "완료" : r.status === "fail" ? "실패" : "병합 중"}</Badge>
                    {r.totalSec != null && <span className="text-fg-muted">총 {r.totalSec}초</span>}
                    <span className="text-fg-subtle">{formatRelative(r.createdAt)}</span>
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
