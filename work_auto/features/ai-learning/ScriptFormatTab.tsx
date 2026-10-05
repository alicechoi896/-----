"use client";

import { useRef, useState } from "react";
import { FileText, FileUp, Pencil, Plus, Sparkles, Star, Trash2, X } from "lucide-react";
import type { ChannelId, ScriptExample, ScriptFormat, ScriptFormatInput, ScriptFormatType } from "@/lib/types";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import { SCRIPT_FORMAT_LIMITS, SCRIPT_FORMAT_TYPES, formatViews, parseScriptFile, scriptKey } from "@/lib/script-format";
import { Badge, Button, Checkbox, EmptyState, ErrorState, FormField, IconButton, Input, LoadingState, Notice, SectionCard, SegmentedControl, Textarea, cardClass } from "@/components/ui";
import { cn } from "@/lib/utils";

const FORMAT_CHANNELS: { id: ChannelId; name: string }[] = [
  { id: "youtube", name: "YouTube" },
  { id: "naver-clip", name: "NAVER 클립" },
];
const typeLabel = (t: ScriptFormatType) => SCRIPT_FORMAT_TYPES.find((x) => x.value === t)?.label ?? t;

type Editing = { mode: "create"; contentType: ScriptFormatType } | { mode: "edit"; format: ScriptFormat };

/**
 * 대본 포맷 (docs/SCRIPT_FORMATS.md) — 영상 대본의 "구조".
 * 참고 대본(메모장 파일·직접 입력) → [AI 로 포맷 만들기] → 가이드라인을 고쳐 저장.
 * 유형(제품 홍보·정보성)마다 기본 포맷(★)이 생성 화면에 자동 적용된다. 말투·표현은 '나의 스타일'.
 */
export function ScriptFormatTab() {
  const { data, loading, error, reload } = useAsync(() => api.scriptFormats.list(), []);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    try {
      await fn();
      reload();
    } finally {
      setBusy(null);
    }
  }

  if (loading && !data) return <LoadingState />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const formats = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-[13px] leading-relaxed text-fg-muted">
          대본 포맷은 영상 대본의 <b className="text-fg">구조</b>입니다. 잘된 대본을 넣으면 AI 가 공통 구조(Hook → 핵심 정보 → CTA, 줄 수·리듬)를 뽑고,
          영상·클립을 만들 때 유형별 <b className="text-fg">기본 포맷(★)</b>이 자동으로 적용됩니다. 말투·표현은 &lsquo;나의 스타일&rsquo;에서 관리합니다.
        </p>
        {!editing && (
          <Button icon={Plus} onClick={() => setEditing({ mode: "create", contentType: "product" })}>
            포맷 추가
          </Button>
        )}
      </div>

      {editing && (
        <ScriptFormatForm
          key={editing.mode === "edit" ? editing.format.id : `new-${editing.contentType}`}
          editing={editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}

      {SCRIPT_FORMAT_TYPES.map((t) => {
        const list = formats.filter((f) => f.contentType === t.value);
        return (
          <section key={t.value} className="space-y-2.5">
            <h3 className="flex items-center gap-2 text-[14px] font-semibold text-fg">
              {t.label}
              <span className="text-xs font-normal text-fg-subtle">{t.description}</span>
            </h3>
            {list.length === 0 ? (
              <div className={cn(cardClass, "px-5 py-6")}>
                <EmptyState
                  icon={FileText}
                  title={`${t.label} 포맷이 없습니다`}
                  description="참고 대본을 넣으면 AI 가 포맷을 만들어 줍니다. 포맷이 없으면 기본 대본 구조로 생성합니다."
                  action={
                    !editing && (
                      <Button size="sm" variant="secondary" icon={Plus} onClick={() => setEditing({ mode: "create", contentType: t.value })}>
                        {t.label} 포맷 만들기
                      </Button>
                    )
                  }
                />
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {list.map((f) => (
                  <article key={f.id} className={cn(cardClass, "flex flex-col px-5 py-4", f.isDefault && "border-brand-line")}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-1.5">
                          <span className="truncate text-[15px] font-semibold text-fg">{f.name}</span>
                          {f.isDefault && (
                            <Badge tone="brand">
                              <Star className="size-3" /> 기본
                            </Badge>
                          )}
                        </p>
                        <p className="mt-1 text-xs text-fg-subtle">
                          {f.channelIds.length ? f.channelIds.map((c) => FORMAT_CHANNELS.find((x) => x.id === c)?.name ?? c).join(" · ") : "YouTube · NAVER 클립"} · 참고 대본 {f.examples.length}개
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-0.5">
                        {!f.isDefault && (
                          <IconButton icon={Star} label="기본 포맷으로" size="sm" disabled={busy === f.id} onClick={() => void run(f.id, () => api.scriptFormats.setDefault(f.id))} />
                        )}
                        <IconButton icon={Pencil} label="수정" size="sm" disabled={Boolean(editing)} onClick={() => setEditing({ mode: "edit", format: f })} />
                        <IconButton
                          icon={Trash2}
                          label="삭제"
                          size="sm"
                          disabled={busy === f.id}
                          onClick={() => {
                            if (confirm(`'${f.name}' 포맷을 삭제할까요?`)) void run(f.id, () => api.scriptFormats.remove(f.id));
                          }}
                        />
                      </div>
                    </div>
                    <pre className="mt-3 line-clamp-6 flex-1 font-sans text-[12.5px] leading-relaxed whitespace-pre-wrap text-fg-muted">
                      {f.guideline || "(가이드라인 없음 — 참고 대본의 구조를 따릅니다)"}
                    </pre>
                  </article>
                ))}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* ───────── 추가 · 수정 폼 ───────── */

const VISIBLE_EXAMPLES = 3;

function ScriptFormatForm({ editing, onCancel, onSaved }: { editing: Editing; onCancel: () => void; onSaved: () => void }) {
  const initial: ScriptFormatInput =
    editing.mode === "edit"
      ? { name: editing.format.name, contentType: editing.format.contentType, channelIds: editing.format.channelIds, examples: editing.format.examples, guideline: editing.format.guideline, isDefault: editing.format.isDefault }
      : { name: "", contentType: editing.contentType, channelIds: [], examples: [], guideline: "", isDefault: false };
  const [form, setForm] = useState<ScriptFormatInput>(initial);
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<{ tone: "info" | "warning"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof ScriptFormatInput>(k: K, v: ScriptFormatInput[K]) => setForm((f) => ({ ...f, [k]: v }));
  const setExample = (i: number, patch: Partial<ScriptExample>) => set("examples", form.examples.map((e, j) => (j === i ? { ...e, ...patch } : e)));
  // 저장할 참고 (제목만 담은 것 포함) / AI 구조 분석에 쓸 대본
  const filled = form.examples.filter((e) => e.text.trim() || e.title.trim());
  const withText = filled.filter((e) => e.text.trim());
  const titleOnly = filled.length - withText.length;

  /** 메모장 파일(여러 개) → 대본으로 나눠 목록 위에 더한다. 파일은 브라우저에서만 읽는다 */
  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    setNote(null);
    let found = 0;
    let dup = 0;
    const seen = new Set(form.examples.map((e) => scriptKey(e.text)));
    const added: ScriptExample[] = [];
    for (const file of Array.from(files)) {
      if (file.size > SCRIPT_FORMAT_LIMITS.fileBytes) {
        setNote({ tone: "warning", text: `${file.name}: 1MB 가 넘어 건너뛰었습니다.` });
        continue;
      }
      if (!/\.(txt|md|srt|vtt)$/i.test(file.name) && !file.type.startsWith("text/")) {
        setNote({ tone: "warning", text: `${file.name}: 텍스트 파일(.txt)만 읽을 수 있습니다.` });
        continue;
      }
      for (const ex of parseScriptFile(await file.text())) {
        found++;
        const key = scriptKey(ex.text);
        if (seen.has(key)) {
          dup++;
          continue;
        }
        seen.add(key);
        added.push(ex);
      }
    }
    const room = Math.max(0, SCRIPT_FORMAT_LIMITS.examples - form.examples.length);
    const kept = added.slice(0, room);
    set("examples", [...kept, ...form.examples]);
    setNote({
      tone: kept.length ? "info" : "warning",
      text: `대본 ${found}개를 찾아 ${kept.length}개를 추가했습니다${dup ? ` · 중복 ${dup}개 제외` : ""}${added.length > kept.length ? ` · ${SCRIPT_FORMAT_LIMITS.examples}개 한도로 ${added.length - kept.length}개 제외` : ""}. 제목·조회수·본문을 확인해 주세요.`,
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  async function analyze() {
    setAnalyzing(true);
    setError(null);
    try {
      const r = await api.scriptFormats.analyze(withText, form.contentType);
      setForm((f) => ({ ...f, guideline: r.guideline, name: f.name.trim() ? f.name : r.name }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "포맷을 만들지 못했습니다.");
    } finally {
      setAnalyzing(false);
    }
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const input = { ...form, examples: filled };
      if (editing.mode === "edit") await api.scriptFormats.update(editing.format.id, input);
      else await api.scriptFormats.create(input);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const rows = expanded ? form.examples : form.examples.slice(0, VISIBLE_EXAMPLES);

  return (
    <SectionCard
      title={editing.mode === "edit" ? `대본 포맷 수정: ${editing.format.name}` : "새 대본 포맷"}
      description="① 참고 대본을 넣고 → ② AI 로 포맷을 만든 뒤 → ③ 가이드라인을 고쳐 저장합니다."
      footer={
        <div className="flex flex-wrap items-center justify-end gap-3">
          {error && <span className="mr-auto text-xs text-danger">{error}</span>}
          <label className="mr-auto flex items-center gap-2 text-[13px] text-fg-muted">
            <Checkbox checked={form.isDefault} onChange={(v) => set("isDefault", v)} label="기본 포맷으로 지정" />
            {typeLabel(form.contentType)} 기본 포맷으로 지정 <span className="text-xs text-fg-subtle">(생성 화면에서 고르지 않으면 자동 적용)</span>
          </label>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            취소
          </Button>
          <Button size="sm" variant="primary" loading={saving} disabled={!form.name.trim() || (!form.guideline.trim() && !filled.length)} onClick={save}>
            저장
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-3">
        <FormField label="포맷 이름" htmlFor="sf-name" required>
          <Input id="sf-name" maxLength={SCRIPT_FORMAT_LIMITS.nameChars} placeholder="예: 후회형 제품 쇼츠" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </FormField>
        <FormField label="유형">
          <SegmentedControl options={SCRIPT_FORMAT_TYPES.map((t) => ({ value: t.value, label: t.label }))} value={form.contentType} onChange={(v) => set("contentType", v)} />
        </FormField>
        <FormField label="적용 채널" hint={form.channelIds.length === 0 ? "선택하지 않으면 YouTube·NAVER 클립 모두" : undefined}>
          <div className="flex flex-wrap gap-1.5">
            {FORMAT_CHANNELS.map((c) => {
              const on = form.channelIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => set("channelIds", on ? form.channelIds.filter((x) => x !== c.id) : [...form.channelIds, c.id])}
                  className={cn(
                    "h-9 rounded-control border px-3 text-[13px] transition-colors",
                    on ? "border-brand bg-brand-soft font-medium text-brand" : "border-line-strong text-fg-muted hover:border-brand-line hover:text-brand",
                  )}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
        </FormField>
      </div>

      {/* ① 참고 대본 */}
      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13.5px] font-semibold text-fg">
            ① 참고 대본 · {filled.length}개{titleOnly > 0 && <span className="text-xs font-normal text-fg-muted"> (제목만 {titleOnly}개)</span>}{" "}
            <span className="text-xs font-normal text-fg-subtle">(최대 {SCRIPT_FORMAT_LIMITS.examples}개 · 잘된 영상의 대본일수록 좋습니다)</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <input ref={fileRef} type="file" accept=".txt,.md,.srt,.vtt,text/plain" multiple hidden onChange={(e) => void importFiles(e.target.files)} />
            <Button size="sm" variant="secondary" icon={FileUp} disabled={form.examples.length >= SCRIPT_FORMAT_LIMITS.examples} onClick={() => fileRef.current?.click()}>
              메모장 파일 불러오기 (.txt)
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={Plus}
              disabled={form.examples.length >= SCRIPT_FORMAT_LIMITS.examples}
              onClick={() => {
                set("examples", [{ title: "", views: null, text: "" }, ...form.examples]);
                setExpanded(true);
              }}
            >
              직접 입력
            </Button>
          </div>
        </div>
        <p className="mt-1 text-xs text-fg-subtle">
          한 파일에 여러 대본이 있어도 됩니다. 구분선(---), 빈 줄 두 줄, &lsquo;제목 :&rsquo;·&lsquo;1.8만회&rsquo; 같은 줄을 기준으로 나누고 제목·조회수를 따로 읽습니다. 파일은 서버에 올리지 않습니다.
        </p>
        {note && (
          <Notice tone={note.tone} className="mt-2">
            {note.text}
          </Notice>
        )}
        <div className="mt-3 space-y-2.5">
          {rows.map((ex, i) => (
            <div key={i} className="rounded-control border border-line bg-subtle/50 p-3">
              <div className="flex items-center gap-2">
                <span className="tabular w-5 shrink-0 text-right text-xs text-fg-subtle">{i + 1}</span>
                <Input className="h-9 flex-1" placeholder="영상 제목 (선택)" value={ex.title} maxLength={SCRIPT_FORMAT_LIMITS.titleChars} onChange={(e) => setExample(i, { title: e.target.value })} />
                <Input
                  className="h-9 w-28"
                  inputMode="numeric"
                  placeholder="조회수"
                  title={ex.views != null ? formatViews(ex.views) : "조회수 (선택) — 높은 대본을 먼저 참고합니다"}
                  value={ex.views ?? ""}
                  onChange={(e) => setExample(i, { views: e.target.value.replace(/\D/g, "") ? Number(e.target.value.replace(/\D/g, "")) : null })}
                />
                <IconButton icon={X} label="이 대본 빼기" size="sm" onClick={() => set("examples", form.examples.filter((_, j) => j !== i))} />
              </div>
              <Textarea
                className="mt-2"
                rows={4}
                placeholder={ex.title.trim() && !ex.text.trim() ? "제목만 담겨 있습니다 (제목 패턴으로 씁니다). 대본을 붙여 넣으면 구조 분석에도 씁니다." : "대본을 붙여 넣으세요.\n예: 무선청소기\n아무거나 사면 후회합니다…"}
                maxLength={SCRIPT_FORMAT_LIMITS.exampleChars}
                value={ex.text}
                onChange={(e) => setExample(i, { text: e.target.value })}
              />
            </div>
          ))}
          {form.examples.length > VISIBLE_EXAMPLES && (
            <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "접기" : `나머지 ${form.examples.length - VISIBLE_EXAMPLES}개 보기`}
            </Button>
          )}
          {form.examples.length === 0 && (
            <p className="rounded-control border border-dashed border-line-strong px-4 py-6 text-center text-[13px] text-fg-subtle">
              메모장 파일을 불러오거나 [직접 입력]으로 대본을 넣으세요. 대본 없이 아래 가이드라인만 적어도 됩니다.
            </p>
          )}
        </div>
      </div>

      {/* ②·③ 가이드라인 */}
      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13.5px] font-semibold text-fg">② ③ 포맷 가이드라인</p>
          <Button size="sm" variant="secondary" icon={Sparkles} loading={analyzing} disabled={!withText.length} onClick={() => void analyze()}>
            {form.guideline ? "AI 로 포맷 다시 만들기" : "AI 로 포맷 만들기"}
          </Button>
        </div>
        <p className="mt-1 text-xs text-fg-subtle">
          생성할 때 이 가이드라인을 항상 전부 보내고, 조회수가 높은 참고 대본 2개를 구조 참고로 함께 보냅니다. 직접 고쳐도 됩니다.
        </p>
        <Textarea
          data-guideline
          className="mt-2 text-[13.5px] leading-relaxed"
          rows={12}
          maxLength={SCRIPT_FORMAT_LIMITS.guidelineChars}
          placeholder={"[구조]\n1) Hook (1~2줄): [제품] + 후회·손해를 짚는 한마디\n2) 핵심 정보 (3~5줄): 숫자가 들어간 스펙 2~3개\n3) CTA (1~2줄): 아래 제품 보기 안내\n[리듬] 한 줄 5~20자, 전체 8~14줄, 15~30초\n[피할 것] 제품 정보에 없는 할인·배송 약속"}
          value={form.guideline}
          onChange={(e) => set("guideline", e.target.value)}
        />
      </div>
    </SectionCard>
  );
}
