"use client";

import { useState } from "react";
import Link from "next/link";
import { BookmarkPlus } from "lucide-react";
import type { ScriptFormat, ScriptFormatType } from "@/lib/types";
import { api } from "@/lib/api-client";
import { SCRIPT_FORMAT_LIMITS, SCRIPT_FORMAT_TYPES, formatViews } from "@/lib/script-format";
import { Button, Combobox, FormField, Input, Modal, Notice, SegmentedControl, type ButtonSize, type ButtonVariant } from "@/components/ui";

/** videoId 가 있으면(YouTube) '썸네일 문구도 함께 담기'를 고를 수 있다 */
type TitleItem = { title: string; views: number | null; videoId?: string };

/**
 * [대본 포맷에 담기] — 트렌드 찾기(YouTube·NAVER)·영상 검색에서 마음에 든 제목·키워드를
 * 대본 포맷의 참고 대본 '제목칸에만' 담는다 (대본은 비움 → 생성할 때 제목 패턴으로 쓴다). docs/SCRIPT_FORMATS.md
 * 기존 포맷에 담거나, 새 포맷(이름·유형)을 만들어 담는다.
 */
export function SaveTitlesToFormat({
  titles,
  source,
  buttonLabel = "대본 포맷에 담기",
  size = "sm",
  variant = "secondary",
  disabled,
  iconOnly,
  captions,
}: {
  titles: TitleItem[];
  /** 인스타그램 (v0.9.54): 있으면 캡션은 '캡션'에, 제목은 '제목 패턴'에 담는다 */
  captions?: string[];
  /** 안내용 (예: YouTube 트렌드) */
  source: string;
  buttonLabel?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
  disabled?: boolean;
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [formats, setFormats] = useState<ScriptFormat[] | null>(null);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [formatId, setFormatId] = useState("");
  const [name, setName] = useState("");
  const [contentType, setContentType] = useState<ScriptFormatType>("product");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  // 썸네일 문구 (AI 가 썸네일 이미지를 읽음, 최대 10개)
  const withVideo = titles.filter((t) => t.videoId);
  const [withThumb, setWithThumb] = useState(true);

  const list = titles.filter((t) => t.title.trim());

  async function show() {
    setOpen(true);
    setError(null);
    setDone(null);
    if (formats) return;
    try {
      const rows = await api.scriptFormats.list();
      setFormats(rows);
      if (!rows.length) setMode("new");
      else setFormatId((id) => id || rows[0].id);
    } catch (e) {
      setFormats([]);
      setMode("new");
      setError(e instanceof Error ? e.message : "대본 포맷을 불러오지 못했습니다.");
    }
  }

  const captionMode = Boolean(captions);
  async function save() {
    setSaving(true);
    setError(null);
    try {
      if (captionMode) {
        const titlesOnly = list.map((t) => t.title);
        const r = await api.scriptFormats.addCaptions(
          mode === "existing" ? { formatId, captions: captions ?? [], titles: titlesOnly } : { newFormat: { name: name.trim(), contentType }, captions: captions ?? [], titles: titlesOnly },
        );
        setFormats((prev) => (prev ? [r.format, ...prev.filter((f) => f.id !== r.format.id)] : [r.format]));
        setFormatId(r.format.id);
        setMode("existing");
        setName("");
        setDone(`'${r.format.name}'에 캡션 ${r.captions}개 · 제목 패턴 ${r.titles}개를 담았습니다 (이미 있는 것은 제외).`);
        return;
      }
      let all: TitleItem[] = list.map(({ title, views }) => ({ title, views }));
      let thumbNote = "";
      if (withThumb && withVideo.length) {
        try {
          const { texts } = await api.trends.thumbnailText(withVideo.slice(0, 10).map((t) => t.videoId!));
          const thumbs = withVideo.map((t) => (texts[t.videoId!] ? { title: texts[t.videoId!], views: t.views } : null)).filter((x): x is TitleItem => Boolean(x));
          all = [...all, ...thumbs];
          thumbNote = ` · 썸네일 문구 ${thumbs.length}개`;
        } catch (e) {
          thumbNote = ` · 썸네일 문구는 읽지 못했습니다 (${e instanceof Error ? e.message : "오류"})`;
        }
      }
      const r = await api.scriptFormats.addTitles(
        mode === "existing" ? { formatId, titles: all } : { newFormat: { name: name.trim(), contentType }, titles: all },
      );
      setFormats((prev) => (prev ? [r.format, ...prev.filter((f) => f.id !== r.format.id)] : [r.format]));
      setFormatId(r.format.id);
      setMode("existing");
      setName("");
      setDone(
        `'${r.format.name}'에 제목 ${r.added}개를 담았습니다${thumbNote}${r.duplicated ? ` · 이미 있는 제목 ${r.duplicated}개 제외` : ""}${r.overLimit ? ` · 한도(제목만 ${SCRIPT_FORMAT_LIMITS.titleOnly}개)로 ${r.overLimit}개 제외` : ""}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "담지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const options = (formats ?? []).map((f) => ({
    value: f.id,
    label: `${f.isDefault ? "★ " : ""}${f.name}`,
    description: `${SCRIPT_FORMAT_TYPES.find((t) => t.value === f.contentType)?.label ?? ""} · 제목 ${f.examples.filter((e) => !e.text.trim()).length}/${SCRIPT_FORMAT_LIMITS.titleOnly} · 대본 ${f.examples.filter((e) => e.text.trim()).length}/${SCRIPT_FORMAT_LIMITS.examples}`,
  }));
  const canSave = list.length > 0 && (mode === "existing" ? Boolean(formatId) : Boolean(name.trim()));

  return (
    <>
      <Button
        size={size}
        variant={variant}
        icon={BookmarkPlus}
        disabled={disabled || !list.length}
        onClick={() => void show()}
        title={captionMode ? `${buttonLabel} — 캡션은 '캡션'에, 제목은 '제목 패턴'에` : `${buttonLabel} — 제목칸에만 담습니다 (대본은 비워 둡니다)`}
        aria-label={iconOnly ? buttonLabel : undefined}
        data-save-format
      >
        {iconOnly ? null : buttonLabel}
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="대본 포맷에 담기"
        description={
          captionMode
            ? `${source}의 캡션 ${captions?.length ?? 0}개는 대본 포맷의 '캡션'에, 제목(캡션 첫 문장) ${list.length}개는 '제목 패턴'에 담습니다. 생성할 때 설명글·캡션과 제목의 참고로 씁니다.`
            : `${source}의 제목 ${list.length}개를 대본 포맷의 '제목칸'에만 담습니다. 대본은 비워 두고, 생성할 때 제목 패턴으로 참고합니다.`
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              닫기
            </Button>
            <Button variant="primary" icon={BookmarkPlus} loading={saving} disabled={!canSave} onClick={() => void save()}>
              {mode === "existing" ? "이 포맷에 담기" : "새 포맷 만들고 담기"}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <ul className="max-h-40 space-y-1 overflow-y-auto rounded-control bg-subtle px-3 py-2 text-[13px] text-fg-muted">
            {list.map((t, i) => (
              <li key={i} className="flex gap-2">
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                {t.views != null && <span className="tabular shrink-0 text-xs text-fg-subtle">{formatViews(t.views)}</span>}
              </li>
            ))}
          </ul>
          {withVideo.length > 0 && !captionMode && (
            <label className="flex cursor-pointer items-start gap-2 rounded-control border border-line px-3 py-2 text-[13px] text-fg" data-with-thumb>
              <input type="checkbox" checked={withThumb} onChange={(e) => setWithThumb(e.target.checked)} className="mt-0.5 size-4 accent-[var(--color-brand)]" />
              <span>
                썸네일 문구도 함께 담기
                <span className="block text-xs text-fg-subtle">
                  AI 가 썸네일 이미지의 큰 글자를 읽어 제목처럼 담습니다 (최대 10개 · AI {Math.ceil(Math.min(10, withVideo.length) / 8)}회, YouTube API 0회). 영상 대본(Hook·CTA)은 YouTube 가 남의 영상 자막을 주지 않아 담지 않습니다.
                </span>
              </span>
            </label>
          )}
          <SegmentedControl
            size="sm"
            options={[
              { value: "existing", label: "기존 포맷에 담기" },
              { value: "new", label: "새 포맷 만들기" },
            ]}
            value={mode}
            onChange={setMode}
          />
          {mode === "existing" ? (
            <FormField label="대본 포맷" htmlFor="save-format-id">
              <Combobox
                id="save-format-id"
                value={formatId}
                options={options}
                placeholder={formats ? (options.length ? "포맷을 고르세요" : "아직 대본 포맷이 없습니다") : "불러오는 중…"}
                searchPlaceholder="포맷 이름으로 검색"
                emptyText="대본 포맷이 없습니다. [새 포맷 만들기]를 누르세요."
                onChange={setFormatId}
              />
            </FormField>
          ) : (
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
              <FormField label="포맷 이름" htmlFor="save-format-name">
                <Input id="save-format-name" placeholder="예: 후회형 제품 쇼츠" value={name} maxLength={SCRIPT_FORMAT_LIMITS.nameChars} onChange={(e) => setName(e.target.value)} />
              </FormField>
              <FormField label="유형">
                <SegmentedControl size="sm" options={SCRIPT_FORMAT_TYPES.map((t) => ({ value: t.value, label: t.label }))} value={contentType} onChange={setContentType} />
              </FormField>
            </div>
          )}
          {error && <Notice tone="warning">{error}</Notice>}
          {done && (
            <Notice tone="info">
              {done}{" "}
              <Link href="/ai-learning?tab=formats" className="font-medium text-brand hover:underline">
                대본 포맷 보기 →
              </Link>
            </Notice>
          )}
        </div>
      </Modal>
    </>
  );
}
