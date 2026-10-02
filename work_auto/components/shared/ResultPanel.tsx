"use client";

import { useState } from "react";
import { BookmarkPlus, Brain, ThumbsDown, ThumbsUp } from "lucide-react";
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
  const allText = outputs.map((o) => `■ ${o.label}\n${toText(content.output[o.key])}`).join("\n\n");

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
        </div>
        <div className="flex items-center gap-2">
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
        <OutputBlock key={section.key} section={section} value={content.output[section.key]} photos={photos} />
      ))}

      <FeedbackBar content={content} headlineKey={headlineKey ?? outputs[0]?.key} onChange={onChange} />
    </div>
  );
}

function toText(value: GeneratedValue | undefined): string {
  if (!value) return "";
  return Array.isArray(value) ? value.join("\n") : value;
}

function OutputBlock({ section, value, photos }: { section: OutputSection; value: GeneratedValue | undefined; photos: ProcessedPhoto[] }) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return (
    <section className={cardClass}>
      <header className="flex items-center justify-between border-b border-line px-5 py-2.5">
        <h3 className="text-[13.5px] font-semibold text-fg">
          {section.label}
          {section.description && <span className="ml-2 text-xs font-normal text-fg-subtle">{section.description}</span>}
        </h3>
        <CopyButton value={section.format === "tags" ? list.join(" ") : toText(value)} />
      </header>
      <div className="px-5 py-4">
        {list.length === 0 ? (
          <p className="text-sm text-fg-subtle">결과 없음</p>
        ) : section.format === "tags" ? (
          <div className="flex flex-wrap gap-1.5">
            {list.map((t) => (
              <Tag key={t}>{t}</Tag>
            ))}
          </div>
        ) : section.format === "list" ? (
          <ol className="space-y-2">
            {list.map((item, i) => (
              <li key={i} className="group flex items-start gap-3 text-sm leading-relaxed text-fg">
                <span className="tabular mt-px w-5 shrink-0 text-right text-xs font-semibold text-fg-subtle">{i + 1}</span>
                <span className="flex-1">{item}</span>
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
    { label: "좋은 예시", value: c.exemplars.length ? `${c.exemplars.length}건` : null },
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
