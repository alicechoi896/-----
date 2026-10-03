"use client";

import { useRef, useState, type ReactNode } from "react";
import { Download, FileText, FileUp, Pencil, Plus, Sparkles, Star, Trash2, Wand2, X } from "lucide-react";
import type { ChannelId, UserStyle, UserStyleInput } from "@/lib/types";
import { api } from "@/lib/api-client";
import { CHANNELS } from "@/lib/registry";
import { useAsync } from "@/lib/hooks/useAsync";
import {
  Badge,
  Button,
  Checkbox,
  EmptyState,
  ErrorState,
  FormField,
  IconButton,
  Input,
  LoadingState,
  Notice,
  SectionCard,
  Select,
  Tag,
  Textarea,
  cardClass,
} from "@/components/ui";
import { STYLE_LIMITS, styleItemKey } from "@/lib/style-limits";
import { PREFERRED_TYPE_RATIO, STYLE_TYPES, findStyleType, type PreferredTypes, type StyleTypeKind } from "@/lib/style-types";
import { countStyleItems, downloadCsv, styleCsvFileName, styleToCsv } from "@/lib/style-csv";
import { cn } from "@/lib/utils";
import { StyleImportDialog, type StyleImportResult, type StyleLists } from "./StyleImportDialog";

const STYLE_CHANNELS = CHANNELS.filter((c) => c.showOnHome && c.id !== "tools").map((c) => ({ id: c.id as ChannelId, name: c.name }));
const channelName = (id: string) => STYLE_CHANNELS.find((c) => c.id === id)?.name ?? id;
const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);
/** 금지 표현: 한 줄에 하나 (예전처럼 쉼표로 구분해도 된다) */
const bannedList = (s: string) => s.split(/[\n,]/).map((l) => l.trim()).filter(Boolean);

/** 참고 자료로 읽을 수 있는 파일 (브라우저에서 텍스트만 읽고 서버에 파일을 올리지 않는다) */
const TEXT_FILE_ACCEPT = ".txt,.md,.srt,.vtt,.csv,text/plain";
const MAX_FILE_BYTES = 2 * 1024 * 1024;

const EMPTY: UserStyleInput = {
  name: "",
  channelIds: [],
  tone: "",
  description: "",
  rules: [],
  examplePhrases: [],
  bannedPhrases: [],
  hooks: [],
  ctas: [],
  titlePatterns: [],
  preferredTypes: {},
  isDefault: false,
};

type Editing = { mode: "create"; draft?: UserStyleInput; reference?: string } | { mode: "edit"; style: UserStyle };

/**
 * Style Memory.
 * - 스타일은 여러 개 만들고, 적용 채널을 여러 개 고를 수 있다 (안 고르면 모든 채널).
 * - 생성 화면의 "스타일" 에서 골라 쓰고, 비워 두면 그 채널의 기본 스타일(★)이 자동 적용된다.
 * - Hook(초반 3초)·CTA(마지막 행동 유도) 문장을 모아 두면 생성할 때 응용한다.
 */
export function StyleTab({ initialReference, initialChannel }: { initialReference?: string; initialChannel?: string }) {
  const { data, loading, error, reload, setData } = useAsync(() => api.styles.list(), []);
  const profiles = useAsync(() => api.profiles.list(), []);
  const profileName = (id?: string | null) => (id ? (profiles.data?.find((p) => p.id === id)?.name ?? null) : null);
  const [editing, setEditing] = useState<Editing | null>(() =>
    initialReference
      ? {
          mode: "create",
          reference: initialReference,
          draft: { ...EMPTY, channelIds: STYLE_CHANNELS.some((c) => c.id === initialChannel) ? [initialChannel as ChannelId] : [] },
        }
      : null,
  );

  async function setDefault(style: UserStyle) {
    await api.styles.setDefault(style.id);
    reload();
  }

  async function remove(style: UserStyle) {
    if (!window.confirm(`'${style.name}' 스타일을 삭제할까요?`)) return;
    await api.styles.remove(style.id);
    setData((prev) => prev?.filter((s) => s.id !== style.id) ?? null);
  }

  if (loading) return <LoadingState variant="skeleton" rows={3} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-fg-subtle">
          생성 화면의 <b className="font-medium text-fg-muted">스타일</b> 에서 골라 씁니다. 고르지 않으면 채널마다 기본 스타일(★) 1개가 자동 적용됩니다.
          Hook·CTA·제목 패턴·자주 쓰는 표현은 많으면 생성할 때마다 10개씩 골라 참고합니다.
        </p>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => setEditing(editing ? null : { mode: "create" })}>
          스타일 추가
        </Button>
      </div>

      {editing && (
        <StyleForm
          key={editing.mode === "edit" ? editing.style.id : "new"}
          editing={editing}
          onCancel={() => setEditing(null)}
          onUpdated={(updated) => setData((prev) => prev?.map((x) => (x.id === updated.id ? updated : x)) ?? null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}

      {!data?.length ? (
        <SectionCard>
          <EmptyState title="등록된 스타일이 없습니다" description="자주 쓰는 말투·규칙·Hook·CTA 를 등록하면 결과가 일정해집니다. 참고 글을 넣으면 AI 가 초안을 만들어 줍니다." />
        </SectionCard>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((s) => (
            <article key={s.id} className={cn(cardClass, "flex flex-col p-5", s.isDefault && "ring-1 ring-brand-line")}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-semibold text-fg">{s.name}</h3>
                    {s.isDefault && (
                      <Badge tone="brand">
                        <Star className="size-3" />
                        기본
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {profileName(s.profileId) && <Badge tone="info">프로필 · {profileName(s.profileId)}</Badge>}
                    {s.channelIds.length === 0 ? (
                      <Badge tone="neutral">모든 채널</Badge>
                    ) : (
                      s.channelIds.map((c) => (
                        <Badge key={c} tone="neutral">
                          {channelName(c)}
                        </Badge>
                      ))
                    )}
                  </div>
                </div>
                <div className="flex shrink-0">
                  <IconButton icon={Download} label="CSV 다운로드" size="sm" onClick={() => downloadCsv(styleToCsv(s), styleCsvFileName(s.name))} />
                  <IconButton icon={Pencil} label="수정" size="sm" onClick={() => setEditing({ mode: "edit", style: s })} />
                  <IconButton icon={Trash2} label="삭제" size="sm" onClick={() => remove(s)} className="hover:text-danger" />
                </div>
              </div>
              {s.tone && <p className="mt-3 text-[13px] font-medium text-fg-muted">{s.tone}</p>}
              {s.description && <p className="mt-1 text-[13px] text-fg-subtle">{s.description}</p>}
              <ul className="mt-3 space-y-1 text-[13px] text-fg-muted">
                {s.rules.slice(0, 4).map((r) => (
                  <li key={r}>· {r}</li>
                ))}
                {s.rules.length > 4 && <li className="text-fg-subtle">외 {s.rules.length - 4}개 규칙</li>}
              </ul>
              <PhraseSummary label="Hook (초반 3초)" items={s.hooks} />
              <PhraseSummary label="CTA (마지막 행동)" items={s.ctas} />
              <PhraseSummary label="제목 패턴" items={s.titlePatterns ?? []} />
              <PreferredTypesSummary types={s.preferredTypes} />
              {s.bannedPhrases.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {s.bannedPhrases.slice(0, 12).map((b) => (
                    <Tag key={b} className="text-danger line-through">
                      {b}
                    </Tag>
                  ))}
                  {s.bannedPhrases.length > 12 && <span className="self-center text-xs text-fg-subtle">외 {s.bannedPhrases.length - 12}개</span>}
                </div>
              )}
              <div className="flex-1" />
              {!s.isDefault && (
                <Button size="sm" className="mt-4 self-start" icon={Star} onClick={() => setDefault(s)}>
                  기본 스타일로 지정
                </Button>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

/** 카드: 원하는 유형 요약 */
function PreferredTypesSummary({ types }: { types?: PreferredTypes }) {
  const rows = (["hooks", "ctas", "titlePatterns"] as StyleTypeKind[])
    .map((k) => ({ k, labels: (types?.[k] ?? []).map((id) => findStyleType(k, id)?.label).filter(Boolean) }))
    .filter((r) => r.labels.length);
  if (!rows.length) return null;
  const name: Record<StyleTypeKind, string> = { hooks: "Hook", ctas: "CTA", titlePatterns: "제목" };
  return (
    <p className="text-xs text-fg-subtle">
      원하는 유형 · {rows.map((r) => `${name[r.k]}: ${r.labels.join(", ")}`).join(" / ")}
    </p>
  );
}

function PhraseSummary({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div className="mt-3">
      <p className="text-[11.5px] font-medium text-fg-subtle">
        {label} · {items.length}개
      </p>
      <p className="mt-0.5 line-clamp-2 text-[13px] text-fg-muted">&ldquo;{items[0]}&rdquo;{items.length > 1 ? ` 외 ${items.length - 1}개` : ""}</p>
    </div>
  );
}

/* ───────── 추가 · 수정 폼 ───────── */

function toForm(s: UserStyleInput) {
  return {
    name: s.name,
    channelIds: s.channelIds,
    tone: s.tone,
    description: s.description,
    rules: s.rules.join("\n"),
    examples: s.examplePhrases.join("\n"),
    banned: s.bannedPhrases.join("\n"),
    hooks: s.hooks,
    ctas: s.ctas,
    titlePatterns: s.titlePatterns ?? [],
    preferredTypes: s.preferredTypes ?? {},
    profileId: s.profileId ?? "",
    isDefault: s.isDefault,
  };
}

type StyleFormState = ReturnType<typeof toForm>;

const items = (list: string[]) => list.map((x) => x.trim()).filter(Boolean);

function toInput(form: StyleFormState): UserStyleInput {
  return {
    name: form.name,
    channelIds: form.channelIds,
    tone: form.tone,
    description: form.description,
    rules: lines(form.rules),
    examplePhrases: lines(form.examples),
    bannedPhrases: bannedList(form.banned),
    hooks: items(form.hooks),
    ctas: items(form.ctas),
    titlePatterns: items(form.titlePatterns),
    preferredTypes: form.preferredTypes,
    profileId: form.profileId || null,
    isDefault: form.isDefault,
  };
}

/** 폼 → 파일 일괄 추가에서 비교할 6개 목록 */
function toLists(form: StyleFormState): StyleLists {
  const i = toInput(form);
  return { hooks: i.hooks, ctas: i.ctas, titlePatterns: i.titlePatterns, rules: i.rules, examplePhrases: i.examplePhrases, bannedPhrases: i.bannedPhrases };
}

function StyleForm({
  editing,
  onCancel,
  onSaved,
  onUpdated,
}: {
  editing: Editing;
  onCancel: () => void;
  onSaved: () => void;
  /** 폼을 닫지 않고 목록의 카드만 바꾼다 (파일 일괄 추가 후. 목록을 다시 불러오면 폼이 처음 값으로 돌아간다) */
  onUpdated: (style: UserStyle) => void;
}) {
  const initial = editing.mode === "edit" ? editing.style : (editing.draft ?? EMPTY);
  const [form, setForm] = useState(() => toForm(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importNote, setImportNote] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(editing.mode === "create" && Boolean(editing.reference));
  const profiles = useAsync(() => api.profiles.list(), []);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  function toggleType(kind: StyleTypeKind, id: string) {
    const cur = form.preferredTypes[kind] ?? [];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    set("preferredTypes", { ...form.preferredTypes, [kind]: next });
  }
  /** 고른 유형으로 만든 예시를 목록 위에 더한다 (빈 줄 정리, 중복·한도 제외) */
  function addExamples(kind: StyleTypeKind, fresh: string[]): number {
    const cur = items(form[kind]);
    const seen = new Set(cur.map(styleItemKey));
    const room = Math.max(0, STYLE_LIMITS[kind].max - cur.length);
    const add = fresh.filter((x) => !seen.has(styleItemKey(x))).slice(0, room);
    set(kind, [...add, ...cur]);
    return add.length;
  }
  const typePicker = (kind: StyleTypeKind) => (
    <TypePicker
      kind={kind}
      selected={form.preferredTypes[kind] ?? []}
      onToggle={(id) => toggleType(kind, id)}
      tone={form.tone}
      existing={items(form[kind])}
      onExamples={(list) => addExamples(kind, list)}
    />
  );

  function toggleChannel(id: ChannelId) {
    set("channelIds", form.channelIds.includes(id) ? form.channelIds.filter((c) => c !== id) : [...form.channelIds, id]);
  }

  /** 파일 일괄 추가 확인: 폼에 합치고, 수정 중인 스타일이면 바로 저장한다 (새 스타일은 이름을 정하고 [저장]) */
  async function applyImport(result: StyleImportResult) {
    const next: StyleFormState = {
      ...form,
      hooks: result.lists.hooks,
      ctas: result.lists.ctas,
      titlePatterns: result.lists.titlePatterns,
      rules: result.lists.rules.join("\n"),
      examples: result.lists.examplePhrases.join("\n"),
      banned: result.lists.bannedPhrases.join("\n"),
    };
    if (editing.mode === "edit") {
      onUpdated(await api.styles.update(editing.style.id, toInput(next))); // 실패하면 창에 오류를 보여 주고 폼은 그대로 둔다
    }
    setForm(next);
    setImportNote(
      `${result.input}개 입력 · ${result.added}개 추가 · ${result.duplicates}개 중복 제외${result.overLimit ? ` · ${result.overLimit}개 한도 초과 제외` : ""}` +
        (editing.mode === "edit" ? " — 저장했습니다." : " — 아래 [저장]을 눌러야 반영됩니다."),
    );
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const input = toInput(form);
      if (editing.mode === "edit") await api.styles.update(editing.style.id, input);
      else await api.styles.create(input);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      title={editing.mode === "edit" ? `스타일 수정: ${editing.style.name}` : "새 스타일"}
      description="적용 채널을 고르지 않으면 모든 채널에서 쓸 수 있습니다."
      actions={
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={FileUp} onClick={() => setImportOpen(true)}>
            파일로 일괄 추가
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={Download}
            disabled={countStyleItems(toLists(form)) === 0}
            onClick={() => downloadCsv(styleToCsv(toLists(form)), styleCsvFileName(form.name))}
          >
            CSV 다운로드
          </Button>
          {editing.mode === "create" && (
            <Button size="sm" variant={aiOpen ? "subtle" : "secondary"} icon={Sparkles} onClick={() => setAiOpen((v) => !v)}>
              참고 자료로 AI 초안 만들기
            </Button>
          )}
        </div>
      }
      footer={
        <div className="flex flex-wrap items-center justify-end gap-3">
          {error && <span className="mr-auto text-xs text-danger">{error}</span>}
          <label className="mr-auto flex items-center gap-2 text-[13px] text-fg-muted">
            <Checkbox checked={form.isDefault} onChange={(v) => set("isDefault", v)} label="기본 스타일로 지정" />
            기본 스타일로 지정 <span className="text-xs text-fg-subtle">(적용 채널이 겹치는 다른 기본 스타일은 해제됩니다)</span>
          </label>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            취소
          </Button>
          <Button size="sm" variant="primary" loading={saving} disabled={!form.name.trim()} onClick={save}>
            저장
          </Button>
        </div>
      }
    >
      <StyleImportDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        current={toLists(form)}
        saveLabel={editing.mode === "edit" ? "저장" : "추가"}
        onConfirm={applyImport}
      />
      {importNote && (
        <Notice tone="info" className="mb-4">
          파일 일괄 추가: {importNote}
        </Notice>
      )}

      {aiOpen && editing.mode === "create" && (
        <ReferenceExtractor
          initialText={editing.reference}
          channelIds={form.channelIds}
          onDraft={(d) =>
            setForm((f) => ({
              ...toForm({ ...d, channelIds: f.channelIds.length ? f.channelIds : d.channelIds, isDefault: f.isDefault, profileId: f.profileId || null }),
            }))
          }
        />
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="스타일 이름" htmlFor="style-name" required>
          <Input id="style-name" placeholder="예: 친근한 리뷰어" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </FormField>
        <FormField label="적용 채널 (여러 개 선택)" hint={form.channelIds.length === 0 ? "선택하지 않으면 모든 채널" : undefined}>
          <div className="flex flex-wrap gap-1.5">
            {STYLE_CHANNELS.map((c) => {
              const on = form.channelIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleChannel(c.id)}
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
        <FormField
          label="적용 콘텐츠 프로필"
          htmlFor="style-profile"
          optional
          hint="이 스타일로 생성하면 이 프로필의 관심분야를 함께 씁니다. 비우면 기본 프로필"
          className="md:col-span-2"
        >
          <Select
            id="style-profile"
            value={form.profileId}
            options={(profiles.data ?? []).map((p) => ({ value: p.id, label: `${p.name}${p.isDefault ? " (기본)" : ""}` }))}
            placeholder="기본 프로필 따라가기"
            onChange={(e) => set("profileId", e.target.value)}
          />
        </FormField>
        <FormField label="톤" htmlFor="style-tone">
          <Input id="style-tone" placeholder="예: 친근하고 빠른 말투, 존댓말" value={form.tone} onChange={(e) => set("tone", e.target.value)} />
        </FormField>
        <FormField label="설명" htmlFor="style-desc">
          <Input id="style-desc" placeholder="예: 첫 문장에서 불편을 짚는다" value={form.description} onChange={(e) => set("description", e.target.value)} />
        </FormField>
        <PhraseListField
          label="Hook (초반 3초)"
          hint="영상·글의 첫 문장 패턴. 생성할 때 주제에 맞게 응용합니다."
          placeholder="예: 아직도 이렇게 하세요?"
          items={form.hooks}
          max={STYLE_LIMITS.hooks.max}
          onChange={(v) => set("hooks", v)}
          extra={typePicker("hooks")}
        />
        <PhraseListField
          label="CTA (마지막 행동 유도)"
          hint="구독·댓글·저장·링크 확인 등 마무리 문장"
          placeholder="예: 더 자세한 정보는 고정 댓글에 있어요"
          items={form.ctas}
          max={STYLE_LIMITS.ctas.max}
          onChange={(v) => set("ctas", v)}
          extra={typePicker("ctas")}
        />
        <PhraseListField
          label="제목 패턴"
          hint="최종 제목이 아니라 설득 구조 참고용입니다. 생성할 때 AI 가 주제·제품에 맞는 새 제목 후보 약 10개로 바꿔 씁니다. 바뀌는 부분은 [제품] [숫자] [대상] 처럼 적으세요."
          placeholder="예: [제품] 사기 전에 꼭 알아야 하는 [숫자]가지"
          items={form.titlePatterns}
          max={STYLE_LIMITS.titlePatterns.max}
          onChange={(v) => set("titlePatterns", v)}
          extra={typePicker("titlePatterns")}
          className="md:col-span-2"
        />
        <FormField label="규칙" htmlFor="style-rules" hint="한 줄에 하나씩 · 생성할 때 항상 전부 지킵니다">
          <Textarea id="style-rules" rows={4} value={form.rules} onChange={(e) => set("rules", e.target.value)} />
        </FormField>
        <FormField label="자주 쓰는 표현" htmlFor="style-examples" hint="한 줄에 하나씩 · 말투 참고용">
          <Textarea id="style-examples" rows={4} value={form.examples} onChange={(e) => set("examples", e.target.value)} />
        </FormField>
        <FormField label="금지 표현" htmlFor="style-banned" hint="한 줄에 하나씩 (쉼표로 구분해도 됩니다) · 생성할 때 항상 전부 피합니다" className="md:col-span-2">
          <Textarea id="style-banned" rows={2} placeholder={"예: 무조건 사세요\n역대급"} value={form.banned} onChange={(e) => set("banned", e.target.value)} />
        </FormField>
      </div>
    </SectionCard>
  );
}

/**
 * 원하는 유형 (여러 개 선택). 저장하면 생성할 때 후보의 약 70% 를 이 유형으로, 나머지는 AI 가 다른 유형도 섞어 추천한다.
 * [고른 유형으로 예시 만들기]: AI 가 예시 10개를 목록 위에 채운다 (저장은 [저장]).
 */
function TypePicker({
  kind,
  selected,
  onToggle,
  tone,
  existing,
  onExamples,
}: {
  kind: StyleTypeKind;
  selected: string[];
  onToggle: (id: string) => void;
  tone: string;
  existing: string[];
  onExamples: (items: string[]) => number;
}) {
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const pct = Math.round(PREFERRED_TYPE_RATIO * 100);

  async function makeExamples() {
    setLoading(true);
    setNote(null);
    try {
      const { items } = await api.styles.typeExamples({ kind, types: selected, tone, existing });
      const n = onExamples(items);
      setNote(n ? { tone: "ok", text: `예시 ${n}개를 위에 추가했습니다. 고친 뒤 [저장]하세요.` } : { tone: "error", text: "새로 넣을 예시가 없습니다 (중복이거나 한도 초과)." });
    } catch (e) {
      setNote({ tone: "error", text: e instanceof Error ? e.message : "예시를 만들지 못했습니다." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-2 rounded-control border border-line bg-subtle/60 px-3 py-2.5">
      <p className="text-xs text-fg-muted">
        원하는 유형 <span className="text-fg-subtle">(여러 개 선택 · 생성할 때 후보의 약 {pct}%를 이 유형으로, 나머지는 AI 가 다른 유형도 추천)</span>
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {STYLE_TYPES[kind].map((t) => {
          const on = selected.includes(t.id);
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={on}
              title={`${t.hint}\n예: ${t.examples.join(" / ")}`}
              onClick={() => onToggle(t.id)}
              className={cn(
                "h-7 rounded-full border px-2.5 text-xs transition-colors",
                on ? "border-brand bg-brand-soft font-medium text-brand" : "border-line-strong bg-canvas text-fg-muted hover:border-brand-line hover:text-brand",
              )}
            >
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" icon={Wand2} loading={loading} disabled={!selected.length} onClick={() => void makeExamples()}>
          고른 유형으로 예시 10개 만들기
        </Button>
        {note && <span className={cn("text-xs", note.tone === "ok" ? "text-brand" : "text-danger")}>{note.text}</span>}
      </div>
    </div>
  );
}

/** 문장 목록 입력: [+ 추가] 로 한 줄씩 늘리고, 줄마다 삭제할 수 있다 */
/** 처음에 보여 주는 줄 수. 파일로 많이 넣으면 접어 둔다 */
const VISIBLE_ROWS = 8;

function PhraseListField({
  label,
  hint,
  placeholder,
  items,
  max,
  onChange,
  extra,
  className,
}: {
  label: string;
  hint: string;
  placeholder: string;
  items: string[];
  max: number;
  onChange: (items: string[]) => void;
  /** 목록 위에 붙는 도구 (원하는 유형) */
  extra?: ReactNode;
  className?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const rows = items.length ? items : [""];
  const visible = expanded ? rows : rows.slice(0, VISIBLE_ROWS);
  return (
    <FormField label={`${label} · ${items.filter((i) => i.trim()).length}개`} hint={hint} className={className}>
      <div className="space-y-1.5">
        {extra}
        {visible.map((value, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="tabular w-5 shrink-0 text-right text-xs text-fg-subtle">{i + 1}</span>
            <Input
              value={value}
              maxLength={500}
              placeholder={placeholder}
              onChange={(e) => onChange(rows.map((r, j) => (j === i ? e.target.value : r)))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (value.trim()) onChange([...rows, ""]);
                }
              }}
            />
            <IconButton icon={X} label="이 줄 삭제" size="sm" onClick={() => onChange(rows.filter((_, j) => j !== i))} />
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            icon={Plus}
            disabled={rows.length >= max}
            onClick={() => {
              setExpanded(true);
              onChange([...rows, ""]);
            }}
          >
            추가
          </Button>
          {rows.length > VISIBLE_ROWS && (
            <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "접기" : `나머지 ${rows.length - VISIBLE_ROWS}개 보기`}
            </Button>
          )}
        </div>
      </div>
    </FormField>
  );
}

/**
 * 참고 자료 → AI 스타일 초안.
 * 텍스트 붙여넣기 또는 텍스트 파일(.txt .md .srt .vtt)을 브라우저에서 읽는다. 파일과 원문은 서버에 저장하지 않는다.
 */
function ReferenceExtractor({
  initialText,
  channelIds,
  onDraft,
}: {
  initialText?: string;
  channelIds: ChannelId[];
  onDraft: (draft: UserStyleInput) => void;
}) {
  const [text, setText] = useState(initialText ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function readFiles(files: FileList | null) {
    if (!files?.length) return;
    setError(null);
    const parts: string[] = [];
    for (const file of Array.from(files).slice(0, 5)) {
      if (file.size > MAX_FILE_BYTES) {
        setError(`${file.name}: 2MB 이하 텍스트 파일만 읽을 수 있습니다.`);
        continue;
      }
      const raw = await file.text();
      // 자막 파일은 번호·시간 줄을 빼고 대사만 남긴다
      const cleaned = /\.(srt|vtt)$/i.test(file.name)
        ? raw
            .split("\n")
            .filter((l) => l.trim() && !/^\d+$/.test(l.trim()) && !l.includes("-->") && !/^WEBVTT/.test(l))
            .join("\n")
        : raw;
      parts.push(cleaned.trim());
    }
    setText((t) => [t.trim(), ...parts].filter(Boolean).join("\n\n---\n\n"));
    if (fileRef.current) fileRef.current.value = "";
  }

  async function extract() {
    setLoading(true);
    setError(null);
    try {
      const { provider, ...draft } = await api.styles.extract(text, channelIds);
      void provider;
      onDraft(draft);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "초안을 만들지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mb-5 space-y-3 rounded-card border border-brand-line bg-brand-soft/30 p-4">
      <div>
        <p className="text-[13px] font-semibold text-fg">참고 자료로 AI 초안 만들기</p>
        <p className="mt-0.5 text-xs leading-relaxed text-fg-subtle">
          닮고 싶은 블로그 글, 영상 대본·자막, 영상 제목·설명을 붙여 넣으세요. AI 가 말투·구조·Hook·CTA 를 뽑아 아래 칸을 채웁니다. 자료와 파일은 저장하지 않습니다 (최대 12,000자 사용).
        </p>
      </div>
      <Textarea rows={6} value={text} placeholder="여기에 참고 글이나 대본을 붙여 넣으세요" onChange={(e) => setText(e.target.value)} />
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileRef} type="file" accept={TEXT_FILE_ACCEPT} multiple hidden onChange={(e) => void readFiles(e.target.files)} />
        <Button size="sm" icon={FileText} onClick={() => fileRef.current?.click()}>
          텍스트·자막 파일 불러오기
        </Button>
        <span className="tabular text-xs text-fg-subtle">{text.length.toLocaleString("ko-KR")}자</span>
        <Button size="sm" variant="primary" icon={Sparkles} className="ml-auto" loading={loading} disabled={text.trim().length < 50} onClick={() => void extract()}>
          {done ? "다시 만들기" : "스타일 초안 만들기"}
        </Button>
      </div>
      {error && <Notice tone="warning">{error}</Notice>}
      {done && !error && <p className="text-xs text-success">아래 칸에 초안을 채웠습니다. 확인하고 고친 뒤 저장하세요.</p>}
    </div>
  );
}
