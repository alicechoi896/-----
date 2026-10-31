"use client";

import { useState } from "react";
import { Download, ImagePlus, Lock, Sparkles, Trash2, UserSquare2 } from "lucide-react";
import { Badge, Button, EmptyState, IconButton, Notice, SectionCard, Select, Textarea } from "@/components/ui";
import { IMAGE_MODELS, estimateImageCredits, imageModel } from "@/lib/drama-studio/models";
import { SHEET_KINDS, sheetPrompt } from "@/lib/drama-studio/prompts";
import type { DramaCharacter, DramaImage, SheetKind } from "@/lib/drama-studio/types";
import { cn } from "@/lib/utils";
import { newRequestId, studioApi } from "../api";
import { CostConfirm, TASK_LABEL, UploadButton, taskTone } from "../ui";
import type { ProjectCtl } from "../useProject";

type Job = { charId: string; sheetKind: SheetKind; prompt?: string };

/** 이미지 1장 카드 (캐릭터 시트·스토리보드 공용) */
export function ImageCard({ img, url, label, onApprove, onRemove, approveLabel = "기준 고정", className }: { img: DramaImage; url?: string; label?: string; onApprove: () => void; onRemove?: () => void; approveLabel?: string; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-control border bg-canvas", img.approved ? "border-success ring-1 ring-success" : "border-line", className)} data-image={img.id}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url ? <img src={url} alt={label ?? ""} className="aspect-[3/4] w-full bg-subtle object-cover" loading="lazy" /> : <div className="flex aspect-[3/4] items-center justify-center bg-subtle text-[11px] text-fg-subtle">미리보기 없음</div>}
      <div className="flex items-center gap-1 px-1.5 py-1">
        <span className="truncate text-[10.5px] text-fg-subtle">
          v{img.version} · {img.source === "upload" ? "업로드" : img.modelId}
        </span>
        <span className="ml-auto flex">
          <IconButton icon={Lock} label={img.approved ? "고정 풀기" : approveLabel} onClick={onApprove} className={img.approved ? "text-success" : ""} />
          {url && (
            <a href={url} download target="_blank" rel="noreferrer" className="inline-flex size-7 items-center justify-center rounded text-fg-subtle hover:text-fg" aria-label="다운로드">
              <Download className="size-3.5" />
            </a>
          )}
          {onRemove && <IconButton icon={Trash2} label="목록에서 빼기" onClick={onRemove} />}
        </span>
      </div>
    </div>
  );
}

/** 05 캐릭터 시트: 인물마다 정면·측면·전신·표정·의상(+추가) 이미지 → 기준 이미지 고정 → 스토리보드·영상에서 재사용 */
export function SheetsStep({ ctl }: { ctl: ProjectCtl }) {
  const p = ctl.project!;
  const [modelId, setModelId] = useState("nano-banana-edit");
  const [kinds, setKinds] = useState<SheetKind[]>(["front", "full"]);
  const [confirm, setConfirm] = useState<Job[] | null>(null);
  const [prompts, setPrompts] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const m = imageModel(modelId)!;
  const tasks = p.tasks.filter((t) => t.kind === "image" && t.target.type === "sheet");
  const setSheet = (charId: string, list: DramaImage[]) => ctl.edit("sheets", { ...p.sheets, [charId]: list });
  const toggle = (c: DramaCharacter, img: DramaImage) => {
    const list = p.sheets[c.id] ?? [];
    // 종류마다 기준 1장
    setSheet(c.id, list.map((i) => (i.id === img.id ? { ...i, approved: !i.approved } : i.kind === img.kind && !img.approved ? { ...i, approved: false } : i)));
  };
  const jobsFor = (charIds: string[]) => charIds.flatMap((charId) => kinds.map((k) => ({ charId, sheetKind: k, prompt: prompts[`${charId}:${k}`] })));
  async function submit(jobs: Job[]) {
    const r = await ctl.run("이미지 요청", () => studioApi.images(p.id, { jobs: jobs.map((j) => ({ target: { type: "sheet", charId: j.charId, sheetKind: j.sheetKind }, prompt: j.prompt })), modelId, clientRequestId: newRequestId() }));
    if (r) setConfirm(null);
  }
  async function upload(c: DramaCharacter, kind: SheetKind, files: File[]) {
    setUploading(true);
    try {
      await ctl.flush();
      for (const f of files) ctl.apply(await ctl.enqueue(() => studioApi.upload(p.id, f, "image", { type: "sheet", charId: c.id, sheetKind: kind })));
    } catch (e) {
      ctl.setError(e instanceof Error ? e.message : "올리지 못했습니다.");
    } finally {
      setUploading(false);
    }
  }
  if (!p.characters.length) return <SectionCard><EmptyState icon={UserSquare2} title="등장인물이 없습니다" description="04 등장인물 단계에서 인물을 먼저 만들어 주세요." className="py-14" /></SectionCard>;
  return (
    <div className="space-y-5">
      <SectionCard title="이미지 만들기 설정" icon={Sparkles}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1">
            <span className="text-[12px] font-medium text-fg-muted">이미지 모델</span>
            <Select value={modelId} options={IMAGE_MODELS.map((x) => ({ value: x.id, label: x.label }))} onChange={(e) => setModelId(e.target.value)} className="w-64" aria-label="이미지 모델" />
          </label>
          <div className="space-y-1">
            <span className="text-[12px] font-medium text-fg-muted">만들 종류</span>
            <div className="flex flex-wrap gap-1.5">
              {SHEET_KINDS.map((k) => (
                <button key={k.kind} type="button" onClick={() => setKinds((ks) => (ks.includes(k.kind) ? ks.filter((x) => x !== k.kind) : [...ks, k.kind]))} className={cn("rounded-full border px-2.5 py-1 text-[12px]", kinds.includes(k.kind) ? "border-brand bg-brand-soft text-brand" : "border-line text-fg-muted")}>
                  {k.label}
                </button>
              ))}
            </div>
          </div>
          <Button variant="primary" icon={Sparkles} disabled={!kinds.length || Boolean(ctl.busy)} onClick={() => setConfirm(jobsFor(p.characters.map((c) => c.id)))} data-gen-sheets-all>
            모든 인물 만들기
          </Button>
        </div>
        <p className="mt-2 text-[12px] text-fg-subtle">{m.note}. 얼굴을 맞추기 위해, 기준 이미지(🔒 고정)가 있으면 그 이미지를 참고로 넣고, 아직 없으면 [정면]을 먼저 만든 뒤 그 정면을 참고로 나머지(측면·전신·표정…)를 만듭니다 (자동 2단계, 장수·비용 그대로). 마음에 드는 정면을 고정하면 이후 모든 이미지가 그 얼굴을 따릅니다.</p>
      </SectionCard>

      {p.characters.map((c) => {
        const list = (p.sheets[c.id] ?? []).filter((i) => !i.removed);
        const running = tasks.filter((t) => t.target.type === "sheet" && t.target.charId === c.id && (t.status === "generating" || t.status === "requesting" || (t.status === "queued" && t.dependsOn)));
        const failed = tasks.filter((t) => t.target.type === "sheet" && t.target.charId === c.id && t.status === "fail").slice(-3);
        return (
          <SectionCard
            key={c.id}
            title={`${c.name || "(이름 없음)"} · ${c.role}`}
            description={c.appearanceEn || c.appearance}
            actions={
              <span className="flex items-center gap-1.5">
                {list.some((i) => i.approved) ? <Badge tone="success">기준 {list.filter((i) => i.approved).length}장 고정</Badge> : <Badge tone="warning">기준 이미지 없음</Badge>}
                <Button size="sm" variant="secondary" icon={Sparkles} disabled={!kinds.length || Boolean(ctl.busy)} onClick={() => setConfirm(jobsFor([c.id]))}>
                  이 인물 만들기
                </Button>
              </span>
            }
            data-sheet={c.id}
          >
            {running.length > 0 && <p className="mb-2 text-[12px] text-brand">만드는 중 {running.length}장… (10초마다 확인){running.some((t) => t.dependsOn) ? ` — 정면을 먼저 만든 뒤 그 얼굴로 나머지 ${running.filter((t) => t.dependsOn).length}장을 만듭니다` : ""}</p>}
            {failed.map((t) => (
              <Notice key={t.id} tone="warning" className="mb-2">
                {SHEET_KINDS.find((k) => t.target.type === "sheet" && k.kind === t.target.sheetKind)?.label} 실패: {t.error}
              </Notice>
            ))}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {SHEET_KINDS.map((k) => {
                const imgs = list.filter((i) => (i.kind ?? "extra") === k.kind);
                const pk = `${c.id}:${k.kind}`;
                return (
                  <div key={k.kind} className="space-y-2 rounded-control border border-line p-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-fg">{k.label}</span>
                      <span className="text-[11px] text-fg-subtle">{k.aspect}</span>
                      <span className="ml-auto">
                        <UploadButton accept="image/png,image/jpeg,image/webp" multiple disabled={uploading} onFiles={(f) => void upload(c, k.kind, f)} variant="ghost">
                          올리기
                        </UploadButton>
                      </span>
                    </div>
                    {imgs.length ? (
                      <div className="grid grid-cols-3 gap-1.5">
                        {imgs.map((img) => (
                          <ImageCard key={img.id} img={img} url={ctl.urls[img.key]} label={`${c.name} ${k.label}`} onApprove={() => toggle(c, img)} onRemove={() => setSheet(c.id, (p.sheets[c.id] ?? []).map((i) => (i.id === img.id ? { ...i, removed: true, approved: false } : i)))} />
                        ))}
                      </div>
                    ) : (
                      <p className="flex items-center gap-1.5 text-[12px] text-fg-subtle">
                        <ImagePlus className="size-3.5" /> 아직 없음
                      </p>
                    )}
                    <details>
                      <summary className="cursor-pointer text-[11.5px] text-fg-subtle">프롬프트 보기·고치기</summary>
                      <Textarea rows={5} className="mt-1 font-mono text-[11px]" value={prompts[pk] ?? sheetPrompt(c, k.kind, list.some((i) => i.approved))} onChange={(e) => setPrompts((x) => ({ ...x, [pk]: e.target.value }))} />
                      <Button size="sm" variant="ghost" icon={Sparkles} className="mt-1" disabled={Boolean(ctl.busy)} onClick={() => setConfirm([{ charId: c.id, sheetKind: k.kind, prompt: prompts[pk] }])}>
                        이 프롬프트로 1장 만들기
                      </Button>
                    </details>
                  </div>
                );
              })}
            </div>
          </SectionCard>
        );
      })}

      {tasks.length > 0 && (
        <SectionCard title="이미지 작업" flush>
          <ul className="divide-y divide-line text-[12.5px]" data-sheet-tasks>
            {[...tasks].reverse().slice(0, 30).map((t) => (
              <li key={t.id} className="flex items-center gap-2 px-4 py-2">
                <Badge tone={taskTone(t.status)}>{TASK_LABEL[t.status]}</Badge>
                <span className="text-fg">{t.target.type === "sheet" ? `${p.characters.find((c) => t.target.type === "sheet" && c.id === t.target.charId)?.name ?? "?"} · ${SHEET_KINDS.find((k) => t.target.type === "sheet" && k.kind === t.target.sheetKind)?.label}` : ""}</span>
                <span className="text-fg-subtle">{t.modelId}</span>
                <span className="ml-auto text-fg-subtle">{t.credits != null ? `실제 ${t.credits} 크레딧` : t.estimatedCredits != null ? `예상 최소 ${t.estimatedCredits}` : ""}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      <CostConfirm
        open={Boolean(confirm)}
        title="캐릭터 이미지 만들기"
        items={confirm ? [{ label: `${m.label} 이미지`, count: confirm.length, credits: estimateImageCredits(modelId, confirm.length) }] : []}
        onCancel={() => setConfirm(null)}
        onConfirm={() => confirm && void submit(confirm)}
        busy={ctl.busy === "이미지 요청"}
      />
    </div>
  );
}
