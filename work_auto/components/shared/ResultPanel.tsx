"use client";

import { useState } from "react";
import Link from "next/link";
import { BookmarkPlus, Brain, CalendarPlus, Check, ListPlus, Pencil, RefreshCw, ThumbsDown, ThumbsUp, Undo2 } from "lucide-react";
import { APPENDABLE_KEYS, candidateKey } from "@/lib/generators/append";
import type { OutputSection } from "@/lib/generators/types";
import type { GeneratedContent, GeneratedValue } from "@/lib/types";
import { api } from "@/lib/api-client";
import { Badge, Tag } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { CopyButton } from "@/components/ui/CopyButton";
import { Input, Textarea } from "@/components/ui/Input";
import { SaveButton } from "@/components/ui/SaveButton";
import { cardClass } from "@/components/ui/SectionCard";
import type { ProcessedPhoto } from "@/lib/photo-process";
import { cn } from "@/lib/utils";
import { BodyWithPhotos } from "./BodyWithPhotos";
import { UploadStatusBadge, useUploadStatus } from "./UploadStatusBadge";

/**
 * 생성 결과 패널 — 모든 생성형 기능이 같이 쓴다.
 * - outputs(Generator Config)의 format 에 따라 섹션을 렌더링한다 (text / longtext / list / tags)
 * - 섹션별 복사, 전체 복사
 * - 피드백(좋아요 / 별로예요 + 사유 + 수정본) → Feedback Data
 * - 좋은 결과로 저장 → 다음 생성의 few-shot 예시 (Content History)
 * - 이번 생성에 쓰인 학습 데이터(ContextSummary) 표시
 */
export function ResultPanel({
  content,
  outputs,
  headlineKey,
  onChange,
  photos = [],
}: {
  content: GeneratedContent;
  outputs: OutputSection[];
  /** 이번 생성에 쓴 사진 (브라우저 메모리). 있으면 본문의 [사진n] 자리에 보여준다 */
  photos?: ProcessedPhoto[];
  /** "별로예요" 수정본을 받을 출력 key (Generator Config 의 headlineKey) */
  headlineKey?: string;
  onChange?: (content: GeneratedContent) => void;
}) {
  const allText = outputs.map((o) => `■ ${o.label}\n${toText(content.context.userEdits?.[o.key]?.value ?? content.output[o.key])}`).join("\n\n");

  // 업로드 상태 (업로드 관리 기록에서 계산)
  const uploads = useUploadStatus([content.id]);
  // 항목별 [다시 만들기]·[추가 만들기]: 한 번에 하나씩 (AI 1회)
  const [regenerating, setRegenerating] = useState<string | null>(null);
  const [regenError, setRegenError] = useState<{ key: string; message: string } | null>(null);
  // 방금 [추가 만들기]로 더해진 후보 (강조 표시용)
  const [added, setAdded] = useState<{ key: string; items: Set<string> } | null>(null);
  const shownList = (c: GeneratedContent, key: string) => {
    const v = c.context.userEdits?.[key]?.value ?? c.output[key];
    return Array.isArray(v) ? v : v ? [v] : [];
  };

  /** 직접 수정 저장 (원본과 같으면 수정 기록이 지워진다) */
  async function saveEdit(key: string, value: string | string[]) {
    onChange?.(await api.contents.annotate(content.id, { edit: { key, value } }));
  }
  /** 후보 선택 토글 (제목·Hook·CTA) */
  async function togglePick(key: string, item: string) {
    const current = content.context.picks?.[key]?.values ?? [];
    const values = current.includes(item) ? current.filter((v) => v !== item) : [...current, item];
    // 체크는 바로 보여 주고(낙관적 반영), 저장에 실패하면 되돌린다
    const picks = { ...(content.context.picks ?? {}) };
    if (values.length) picks[key] = { values, at: new Date().toISOString() };
    else delete picks[key];
    onChange?.({ ...content, context: { ...content.context, picks } });
    try {
      onChange?.(await api.contents.annotate(content.id, { pick: { key, values } }));
    } catch {
      onChange?.(content);
    }
  }

  async function regenerate(key: string) {
    setRegenerating(key);
    setRegenError(null);
    setAdded(null);
    try {
      const before = new Set(shownList(content, key).map(candidateKey));
      const next = await api.contents.regenerate(content.id, key);
      if (APPENDABLE_KEYS.has(key)) setAdded({ key, items: new Set(shownList(next, key).filter((x) => !before.has(candidateKey(x)))) });
      onChange?.(next);
    } catch (e) {
      setRegenError({ key, message: e instanceof Error ? e.message : "다시 만들지 못했습니다." });
    } finally {
      setRegenerating(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className={cn(cardClass, "flex flex-wrap items-center justify-between gap-3 px-5 py-3.5")}>
        <div className="flex flex-wrap items-center gap-2 text-xs text-fg-subtle">
          <Badge tone="success" dot>
            생성 완료
          </Badge>
          <span>프롬프트 {content.promptId} v{content.promptVersion}</span>
          <span>·</span>
          <span>
            {content.provider} / {content.model}
          </span>
          {uploads && <UploadStatusBadge state={uploads[content.id]} />}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/uploads?contentId=${content.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-control border border-line px-3 text-[13px] text-fg-muted hover:border-brand-line hover:text-brand"
            title="이 콘텐츠를 실제로 올렸다면 업로드 관리에 기록합니다"
          >
            <CalendarPlus className="size-3.5" />
            업로드 등록
          </Link>
          <CopyButton value={allText} label="전체 복사" />
          <SaveButton
            size="sm"
            variant="secondary"
            icon={BookmarkPlus}
            label="좋은 결과로 저장"
            savedLabel="좋은 결과로 저장됨"
            saved={content.isExemplar}
            onSave={async () => onChange?.(await api.contents.setExemplar(content.id, true))}
          />
        </div>
      </div>

      <ContextSummaryBox content={content} />

      {outputs.map((section) => (
        <OutputBlock
          key={section.key}
          section={section}
          value={content.context.userEdits?.[section.key]?.value ?? content.output[section.key] ?? content.output[LEGACY_KEY[section.key] ?? ""]}
          edit={content.context.userEdits?.[section.key] ?? null}
          original={content.output[section.key]}
          picks={PICKABLE.has(section.key) ? (content.context.picks?.[section.key]?.values ?? []) : undefined}
          onTogglePick={onChange && PICKABLE.has(section.key) ? (item) => void togglePick(section.key, item) : undefined}
          onSaveEdit={onChange ? (v) => saveEdit(section.key, v) : undefined}
          photos={photos}
          // 소제목은 본문을 다시 만들 때 함께 바뀐다
          onRegenerate={onChange && section.key !== "headings" ? () => void regenerate(section.key) : undefined}
          regenerating={regenerating === section.key || (regenerating === "body" && section.key === "headings")}
          busy={Boolean(regenerating)}
          error={regenError?.key === section.key ? regenError.message : null}
          added={added?.key === section.key ? added.items : undefined}
        />
      ))}

      <FeedbackBar content={content} headlineKey={headlineKey ?? outputs[0]?.key} onChange={onChange} />
    </div>
  );
}

/** 체크해서 "실제로 쓴 것"을 고를 수 있는 후보 (학습 힌트) */
const PICKABLE = new Set(["titles", "hooks", "ctas"]);

/** v0.9.13 에서 바뀐 출력 키: 예전 결과는 옛 키로 저장되어 있다 */
const LEGACY_KEY: Record<string, string> = { hooks: "hook", titles: "title", tags: "hashtags", ctas: "cta" };

function toText(value: GeneratedValue | undefined): string {
  if (!value) return "";
  return Array.isArray(value) ? value.join("\n") : value;
}

function OutputBlock({
  section,
  value,
  edit,
  original,
  picks,
  onTogglePick,
  onSaveEdit,
  photos,
  onRegenerate,
  regenerating,
  busy,
  error,
  added,
}: {
  section: OutputSection;
  value: GeneratedValue | undefined;
  /** 직접 수정 기록 (있으면 value 가 수정본) */
  edit: { ratio: number } | null;
  original: GeneratedValue | undefined;
  picks?: string[];
  onTogglePick?: (item: string) => void;
  onSaveEdit?: (value: string | string[]) => Promise<void>;
  photos: ProcessedPhoto[];
  onRegenerate?: () => void;
  regenerating?: boolean;
  busy?: boolean;
  error?: string | null;
  /** 방금 [추가 만들기]로 더해진 후보 */
  added?: Set<string>;
}) {
  const appendable = APPENDABLE_KEYS.has(section.key);
  const list = Array.isArray(value) ? value : value ? [value] : [];
  const isList = section.format === "list" || section.format === "tags";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  function startEdit() {
    setDraft(toText(value));
    setEditError(null);
    setEditing(true);
  }
  async function save(next: string | string[]) {
    if (!onSaveEdit) return;
    setSaving(true);
    setEditError(null);
    try {
      await onSaveEdit(next);
      setEditing(false);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }
  const draftValue = () => (isList ? draft.split("\n").map((l) => l.trim()).filter(Boolean) : draft);

  return (
    <section className={cardClass}>
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line px-5 py-2.5">
        <h3 className="min-w-0 text-[13.5px] font-semibold text-fg">
          {section.label}
          {section.description && <span className="ml-2 text-xs font-normal text-fg-subtle">{section.description}</span>}
          {edit && <span className="ml-2 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-medium text-brand">직접 수정함 · {Math.round(edit.ratio * 100)}% 바뀜</span>}
        </h3>
        <div className="flex shrink-0 items-center gap-1 whitespace-nowrap">
          {onSaveEdit && !editing && (
            <Button size="sm" variant="ghost" icon={Pencil} disabled={busy} onClick={startEdit} title="직접 고치면 학습에 반영됩니다 (원본은 남습니다)">
              직접 수정
            </Button>
          )}
          {onRegenerate && (
            <Button
              size="sm"
              variant="ghost"
              icon={appendable ? ListPlus : RefreshCw}
              loading={regenerating}
              disabled={busy && !regenerating}
              onClick={onRegenerate}
              title={
                appendable
                  ? `지금 후보는 그대로 두고 새 후보 ${section.count ?? 10}개를 위에 추가합니다`
                  : section.key === "body"
                    ? "본문을 다른 내용으로 다시 만듭니다 (소제목도 본문에 맞게 바뀝니다)"
                    : "이 항목만 다른 것으로 다시 만듭니다"
              }
            >
              {appendable ? "추가 만들기" : "다시 만들기"}
            </Button>
          )}
          <CopyButton value={section.format === "tags" ? list.join(" ") : toText(value)} />
        </div>
      </header>
      {error && <p className="border-b border-line bg-danger/5 px-5 py-2 text-xs text-danger">{error}</p>}
      {added && added.size > 0 && !editing && (
        <p className="border-b border-line bg-brand-soft/60 px-5 py-1.5 text-[11.5px] text-brand">
          새 후보 {added.size}개를 위에 추가했습니다 · 모두 {list.length}개
        </p>
      )}
      {onTogglePick && list.length > 0 && !editing && (
        <p className="border-b border-line bg-subtle/50 px-5 py-1.5 text-[11.5px] text-fg-subtle">실제로 쓴 것을 체크하면 다음 생성 학습에 힌트가 됩니다.</p>
      )}
      <div className={cn("px-5 py-4", regenerating && "opacity-50")}>
        {editing ? (
          <div className="space-y-2">
            <Textarea
              rows={section.format === "longtext" ? 14 : isList ? Math.min(14, Math.max(4, list.length + 1)) : 3}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            {isList && <p className="text-xs text-fg-subtle">한 줄에 하나씩</p>}
            {editError && <p className="text-xs text-danger">{editError}</p>}
            <div className="flex flex-wrap items-center justify-end gap-2">
              {edit && (
                <Button size="sm" variant="ghost" icon={Undo2} disabled={saving} onClick={() => void save(isList ? (Array.isArray(original) ? original : [String(original ?? "")]) : toText(original))}>
                  원본으로 되돌리기
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>
                취소
              </Button>
              <Button size="sm" variant="primary" icon={Check} loading={saving} onClick={() => void save(draftValue())}>
                수정 저장
              </Button>
            </div>
          </div>
        ) : list.length === 0 ? (
          <p className="text-sm text-fg-subtle">결과 없음</p>
        ) : section.format === "tags" ? (
          <div className="flex flex-wrap gap-1.5">
            {list.map((t) => (
              <Tag key={t} className={cn(added?.has(t) && "border-brand-line bg-brand-soft text-brand")}>
                {t}
              </Tag>
            ))}
          </div>
        ) : section.format === "list" ? (
          <ol className="space-y-2">
            {list.map((item, i) => (
              <li key={i} className={cn("group flex items-start gap-3 text-sm leading-relaxed text-fg", picks?.includes(item) && "font-medium text-brand")}>
                {onTogglePick ? (
                  <input
                    type="checkbox"
                    checked={Boolean(picks?.includes(item))}
                    onChange={() => onTogglePick(item)}
                    aria-label={`'${item}' 사용함`}
                    className="mt-1 size-4 shrink-0 accent-[var(--color-brand)]"
                  />
                ) : null}
                <span className="tabular mt-px w-5 shrink-0 text-right text-xs font-semibold text-fg-subtle">{i + 1}</span>
                <span className="flex-1">
                  {added?.has(item) && <span className="mr-1.5 rounded bg-brand-soft px-1.5 py-px text-[10.5px] font-semibold text-brand">새로</span>}
                  {item}
                </span>
                <CopyButton value={item} iconOnly className="opacity-0 group-hover:opacity-100 focus:opacity-100" />
              </li>
            ))}
          </ol>
        ) : section.format === "longtext" && photos.length > 0 && section.key === "body" ? (
          <BodyWithPhotos text={list[0]} photos={photos} />
        ) : section.format === "longtext" ? (
          <div className="max-h-[420px] overflow-y-auto rounded-control bg-subtle px-4 py-3 text-sm leading-7 whitespace-pre-wrap text-fg">
            {list[0]}
          </div>
        ) : (
          <p className="text-[15px] leading-relaxed font-medium text-fg">{list[0]}</p>
        )}
      </div>
    </section>
  );
}

function ContextSummaryBox({ content }: { content: GeneratedContent }) {
  const c = content.context;
  const items: { label: string; value: string | null }[] = [
    { label: "콘텐츠 프로필", value: c.profile?.name ?? null },
    { label: "제품", value: c.product ? `${c.product.name} (분석 v${c.product.analysisVersion})` : null },
    { label: "스타일", value: c.style?.name ?? null },
    { label: "좋은 예시", value: c.goodExampleIds?.length ? `${c.goodExampleIds.length}건 (요약)` : c.exemplars.length ? `${c.exemplars.length}건` : null },
    { label: "학습 프로필", value: c.learningProfile ? `v${c.learningProfile.version} · 경향 ${c.learningProfile.insightCount}개` : null },
    { label: "피드백", value: c.avoidNotes.length ? `${c.avoidNotes.length}건 반영` : null },
    { label: "성과", value: c.performanceHints.length ? `${c.performanceHints.length}건` : null },
    { label: "트렌드", value: c.trend?.title ?? null },
  ];
  return (
    <div className="rounded-card border border-line bg-subtle/70 px-5 py-3.5">
      <p className="flex items-center gap-1.5 text-[13px] font-semibold text-fg">
        <Brain className="size-4 text-fg-subtle" />
        이번 생성에 사용된 학습 데이터
      </p>
      <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 text-[13px]">
        {items.map((it) => (
          <div key={it.label} className="flex gap-1.5">
            <dt className="text-fg-subtle">{it.label}</dt>
            <dd className={it.value ? "font-medium text-fg" : "text-fg-subtle"}>{it.value ?? "없음"}</dd>
          </div>
        ))}
      </dl>
      {c.styleSamples && <StyleSamples s={c.styleSamples} />}
      {c.notes.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs text-warning">
          {c.notes.map((n) => (
            <li key={n}>· {n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 스타일에서 이번에 참고한 표본 (Hook·CTA·제목 패턴·자주 쓰는 표현은 많으면 10개씩 무작위) */
function StyleSamples({ s }: { s: NonNullable<GeneratedContent["context"]["styleSamples"]> }) {
  const [open, setOpen] = useState(false);
  const rows: [string, string[], number][] = [
    ["제목 패턴", s.titlePatterns, s.totals.titlePatterns],
    ["Hook", s.hooks, s.totals.hooks],
    ["CTA", s.ctas, s.totals.ctas],
    ["자주 쓰는 표현", s.examplePhrases, s.totals.examplePhrases],
  ];
  const summary = rows.filter(([, list]) => list.length).map(([label, list, total]) => `${label} ${list.length}${total > list.length ? `/${total}` : ""}`);
  if (!summary.length && !s.rulesCount && !s.bannedCount) return null;
  return (
    <div className="mt-2 text-xs text-fg-subtle">
      <button type="button" className="underline-offset-2 hover:text-fg hover:underline" onClick={() => setOpen((v) => !v)}>
        스타일 참고 ({s.medium === "blog" ? "블로그용으로 재해석" : "영상용"}): {[...summary, s.rulesCount ? `규칙 ${s.rulesCount}` : "", s.bannedCount ? `금지 표현 ${s.bannedCount}` : ""].filter(Boolean).join(" · ")} {open ? "▲" : "▼"}
      </button>
      {open && (
        <dl className="mt-1.5 space-y-1">
          {rows
            .filter(([, list]) => list.length)
            .map(([label, list]) => (
              <div key={label}>
                <dt className="font-medium text-fg-muted">{label}</dt>
                <dd>{list.join(" / ")}</dd>
              </div>
            ))}
        </dl>
      )}
    </div>
  );
}

function FeedbackBar({
  content,
  headlineKey,
  onChange,
}: {
  content: GeneratedContent;
  headlineKey?: string;
  onChange?: (content: GeneratedContent) => void;
}) {
  const [rating, setRating] = useState(content.rating);
  const [showForm, setShowForm] = useState(false);
  const [reason, setReason] = useState("");
  const [edited, setEdited] = useState("");
  const [sending, setSending] = useState(false);

  async function send(r: "up" | "down", extra?: { reason?: string; edited?: string }) {
    setSending(true);
    try {
      await api.feedback.add({
        contentId: content.id,
        rating: r,
        reason: extra?.reason,
        editedOutput: extra?.edited && headlineKey ? { [headlineKey]: extra.edited } : undefined,
      });
      setRating(r);
      setShowForm(false);
      onChange?.({ ...content, rating: r });
    } finally {
      setSending(false);
    }
  }

  return (
    <div className={cn(cardClass, "px-5 py-4")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[13.5px] font-semibold text-fg">이 결과가 어땠나요?</p>
          <p className="mt-0.5 text-xs text-fg-subtle">피드백은 같은 기능의 다음 생성에 반영됩니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            icon={ThumbsUp}
            variant={rating === "up" ? "subtle" : "secondary"}
            disabled={sending || rating !== null}
            onClick={() => send("up")}
          >
            좋아요
          </Button>
          <Button
            size="sm"
            icon={ThumbsDown}
            variant={rating === "down" ? "subtle" : "secondary"}
            disabled={sending || rating !== null}
            onClick={() => setShowForm((v) => !v)}
          >
            별로예요
          </Button>
        </div>
      </div>
      {showForm && rating === null && (
        <div className="mt-4 grid gap-3 border-t border-line pt-4">
          <Textarea rows={2} placeholder="어떤 점이 아쉬웠나요? (예: 제목이 너무 평범함)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Input placeholder="직접 고친 제목이 있다면 적어주세요 (선택)" value={edited} onChange={(e) => setEdited(e.target.value)} />
          <div className="flex justify-end">
            <Button size="sm" variant="primary" loading={sending} onClick={() => send("down", { reason, edited })}>
              피드백 보내기
            </Button>
          </div>
        </div>
      )}
      {rating && <p className="mt-3 text-xs text-success">피드백이 저장되었습니다. AI 학습 관리 &gt; 피드백에서 확인할 수 있습니다.</p>}
    </div>
  );
}
