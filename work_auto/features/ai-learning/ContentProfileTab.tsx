"use client";

import { useState } from "react";
import { Compass, Pencil, Plus, Sparkles, Star, Trash2, X } from "lucide-react";
import { YOUTUBE_COUNTRIES, categoryLabel, countryLabel } from "@/lib/domain/youtube";
import { CONTENT_FIELDS, normalizeContentField, recommendedYoutubeCategory } from "@/lib/domain/content-fields";

/** 콘텐츠 분야 → YouTube 추천 카테고리 이름 (기타 = 전체) */
const youtubeCategoryText = (main: string) => {
  const id = recommendedYoutubeCategory(main);
  return id ? categoryLabel(id) : "전체 카테고리";
};
import type { ContentProfile, ContentProfileInput } from "@/lib/types";
import { EXAMPLE_PROFILE } from "@/lib/types/profile";
import { api } from "@/lib/api-client";
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
  SectionCard,
  SegmentedControl,
  Select,
  Tag,
  cardClass,
} from "@/components/ui";
import { cn } from "@/lib/utils";

export const PERIOD_OPTIONS = [
  { value: "7", label: "7일" },
  { value: "14", label: "14일" },
  { value: "21", label: "21일" },
  { value: "30", label: "30일" },
  { value: "90", label: "3개월" },
];
export const periodLabel = (days: number) => PERIOD_OPTIONS.find((p) => p.value === String(days))?.label ?? `${days}일`;

const EMPTY: ContentProfileInput = {
  name: "",
  description: "",
  mainCategory: "",
  subCategories: [],
  seedKeywords: [],
  excludeKeywords: [],
  defaultTrendPeriod: 21,
  country: "KR",
  isDefault: false,
  isActive: true,
};

type Editing = { mode: "create"; initial?: ContentProfileInput } | { mode: "edit"; profile: ContentProfile };

/**
 * 콘텐츠 프로필 = "무엇을 다룰 것인가".
 * 기본 프로필 1개가 트렌드 화면(조사 범위)과 콘텐츠 생성(Context)에 자동 적용된다.
 * "나의 스타일"(어떻게 표현할 것인가)과는 별개다.
 */
export function ContentProfileTab() {
  const { data, loading, error, reload } = useAsync(() => api.profiles.list(), []);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);

  async function createExample() {
    setBusy(true);
    try {
      await api.profiles.createExample();
      reload();
    } finally {
      setBusy(false);
    }
  }

  async function setDefault(p: ContentProfile) {
    await api.profiles.setDefault(p.id);
    reload();
  }

  async function remove(p: ContentProfile) {
    if (!window.confirm(`'${p.name}' 프로필을 삭제할까요? 이 프로필에 연결된 스타일은 연결만 풀립니다.`)) return;
    await api.profiles.remove(p.id);
    reload();
  }

  if (loading) return <LoadingState variant="skeleton" rows={3} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  const profiles = data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-fg-subtle">콘텐츠 프로필은 트렌드 분석과 AI 콘텐츠 생성 시 기본 관심분야로 사용됩니다.</p>
        {profiles.length > 0 && (
          <Button size="sm" icon={Plus} onClick={() => setEditing(editing ? null : { mode: "create" })}>
            프로필 추가
          </Button>
        )}
      </div>

      {editing && (
        <ProfileForm
          key={editing.mode === "edit" ? editing.profile.id : "new"}
          editing={editing}
          onCancel={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}

      {profiles.length === 0 && !editing ? (
        <SectionCard>
          <EmptyState
            icon={Compass}
            title="아직 콘텐츠 프로필이 없습니다"
            description="무엇에 관한 콘텐츠를 만드는지(카테고리·관심 키워드)를 한 번 저장해 두면, 트렌드 화면과 콘텐츠 생성에 자동으로 적용됩니다."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" icon={Plus} onClick={() => setEditing({ mode: "create" })}>
                  프로필 만들기
                </Button>
                <Button icon={Sparkles} loading={busy} onClick={() => void createExample()}>
                  예시로 시작 ({EXAMPLE_PROFILE.name})
                </Button>
              </div>
            }
          />
        </SectionCard>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {profiles.map((p) => (
            <ProfileCard
              key={p.id}
              profile={p}
              onEdit={() => setEditing({ mode: "edit", profile: p })}
              onDefault={() => void setDefault(p)}
              onRemove={() => void remove(p)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileCard({
  profile: p,
  onEdit,
  onDefault,
  onRemove,
}: {
  profile: ContentProfile;
  onEdit: () => void;
  onDefault: () => void;
  onRemove: () => void;
}) {
  return (
    <article className={cn(cardClass, "flex flex-col p-5", p.isDefault && "ring-1 ring-brand-line", !p.isActive && "opacity-70")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px] font-semibold text-fg">{p.name}</h3>
            {p.isDefault && (
              <Badge tone="brand">
                <Star className="size-3" />
                기본
              </Badge>
            )}
            <Badge tone={p.isActive ? "success" : "neutral"} dot>
              {p.isActive ? "사용 중" : "사용 안 함"}
            </Badge>
          </div>
          {p.description && <p className="mt-1 text-[13px] text-fg-subtle">{p.description}</p>}
          {p.audience && <p className="mt-1 text-[13px] text-fg-muted">타깃 시청자 · {p.audience}</p>}
        </div>
        <IconButton icon={Trash2} label="삭제" size="sm" onClick={onRemove} className="hover:text-danger" />
      </div>

      <dl className="mt-4 space-y-2.5 text-[13px]">
        <Row label="콘텐츠 분야">
          <span className="font-medium text-fg">{normalizeContentField(p.mainCategory)}</span>
          <span className="ml-1.5 text-xs text-fg-subtle">→ YouTube {youtubeCategoryText(p.mainCategory)}</span>
        </Row>
        <Row label="세부 대표 키워드">
          <Chips items={p.subCategories} />
        </Row>
        <Row label="기본 키워드">
          <Chips items={p.seedKeywords.map((k) => `#${k}`)} />
        </Row>
        {p.excludeKeywords.length > 0 && (
          <Row label="제외 키워드">
            <Chips items={p.excludeKeywords} danger />
          </Row>
        )}
        <Row label="기본 분석기간">
          <span className="text-fg-muted">
            최근 {periodLabel(p.defaultTrendPeriod)} · {countryLabel(p.country)}
          </span>
        </Row>
      </dl>

      <div className="flex-1" />
      <div className="mt-5 flex flex-wrap gap-2">
        <Button size="sm" icon={Pencil} onClick={onEdit}>
          수정
        </Button>
        {!p.isDefault && (
          <Button size="sm" variant="subtle" icon={Star} onClick={onDefault}>
            기본 프로필로 설정
          </Button>
        )}
      </div>
    </article>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[96px_1fr] items-start gap-2">
      <dt className="pt-0.5 text-fg-subtle">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}

function Chips({ items, danger }: { items: string[]; danger?: boolean }) {
  if (!items.length) return <span className="text-fg-subtle">-</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((t) => (
        <Tag key={t} className={danger ? "text-danger line-through" : undefined}>
          {t}
        </Tag>
      ))}
    </div>
  );
}

/* ───────── 추가 · 수정 ───────── */

function ProfileForm({ editing, onCancel, onSaved }: { editing: Editing; onCancel: () => void; onSaved: () => void }) {
  const initial = editing.mode === "edit" ? editing.profile : (editing.initial ?? EMPTY);
  const [form, setForm] = useState<ContentProfileInput>(() => ({
    name: initial.name,
    description: initial.description,
    audience: initial.audience ?? "",
    mainCategory: initial.mainCategory,
    subCategories: initial.subCategories,
    seedKeywords: initial.seedKeywords,
    excludeKeywords: initial.excludeKeywords,
    defaultTrendPeriod: initial.defaultTrendPeriod,
    country: initial.country,
    isDefault: initial.isDefault,
    isActive: initial.isActive,
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof ContentProfileInput>(k: K, v: ContentProfileInput[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      if (editing.mode === "edit") await api.profiles.update(editing.profile.id, form);
      else await api.profiles.create(form);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      title={editing.mode === "edit" ? `프로필 수정: ${editing.profile.name}` : "새 콘텐츠 프로필"}
      description="무엇에 관한 콘텐츠를 만드는지 적어 주세요. 말투·표현은 '나의 스타일'에서 따로 관리합니다."
      footer={
        <div className="flex flex-wrap items-center justify-end gap-3">
          {error && <span className="mr-auto text-xs text-danger">{error}</span>}
          <label className="flex items-center gap-2 text-[13px] text-fg-muted">
            <Checkbox checked={form.isActive} onChange={(v) => set("isActive", v)} label="사용 중" />
            사용 중
          </label>
          <label className="mr-auto flex items-center gap-2 text-[13px] text-fg-muted">
            <Checkbox checked={form.isDefault} onChange={(v) => set("isDefault", v)} label="기본 프로필" />
            기본 프로필 (트렌드·생성에 자동 적용)
          </label>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            취소
          </Button>
          <Button size="sm" variant="primary" loading={saving} disabled={!form.name.trim() || !form.mainCategory.trim()} onClick={() => void save()}>
            저장
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="프로필 이름" htmlFor="pf-name" required>
          <Input id="pf-name" placeholder="예: 가전 콘텐츠" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </FormField>
        <FormField
          label="콘텐츠 분야"
          htmlFor="pf-main"
          required
          hint={<span data-category-preview>YouTube 트렌드 추천 카테고리: <b className="font-medium text-fg-muted">{youtubeCategoryText(form.mainCategory)}</b> (트렌드 화면에서 바꿀 수 있습니다)</span>}
        >
          <Select
            id="pf-main"
            value={form.mainCategory ? normalizeContentField(form.mainCategory) : ""}
            options={CONTENT_FIELDS.map((c) => ({ value: c, label: c }))}
            placeholder="분야 선택"
            onChange={(e) => set("mainCategory", e.target.value)}
          />
        </FormField>
        <FormField label="설명" htmlFor="pf-desc" className="md:col-span-2">
          <Input id="pf-desc" placeholder="예: 주방·생활·계절 가전 추천과 살림 노하우" value={form.description} onChange={(e) => set("description", e.target.value)} />
        </FormField>
        <FormField label="타깃 시청자" htmlFor="pf-audience" optional hint="누구에게 말하는지 한 줄로. 모든 생성에 넣어 Hook·장면이 그 사람 상황에 맞게 바뀝니다." className="md:col-span-2">
          <Input id="pf-audience" maxLength={200} placeholder="예: 30대 자취 직장인, 퇴근 후 청소가 귀찮음" value={form.audience ?? ""} onChange={(e) => set("audience", e.target.value)} />
        </FormField>
        <ChipInput
          label="세부 대표 키워드"
          placeholder="예: 주방가전 (Enter 로 추가)"
          hint="분야 안에서 주로 다루는 세부 주제입니다. 트렌드를 찾을 때 검색 범위로 씁니다."
          items={form.subCategories}
          onChange={(v) => set("subCategories", v)}
        />
        <ChipInput
          label="기본 관심 키워드"
          placeholder="예: 가성비가전 (Enter 로 추가)"
          hint="검색어를 비워 두면 이 키워드로 트렌드를 넓게 찾고, 생성할 때 키워드 후보로 참고합니다."
          items={form.seedKeywords}
          onChange={(v) => set("seedKeywords", v)}
        />
        <ChipInput
          label="제외 키워드"
          placeholder="예: 중고가전 (Enter 로 추가)"
          hint="트렌드 결과에서 빼고, 생성할 때도 다루지 않습니다."
          items={form.excludeKeywords}
          onChange={(v) => set("excludeKeywords", v)}
        />
        <div className="grid grid-cols-[1fr_140px] gap-3">
          <FormField label="기본 분석기간">
            <SegmentedControl
              size="sm"
              className="flex-wrap"
              options={PERIOD_OPTIONS}
              value={String(form.defaultTrendPeriod)}
              onChange={(v) => set("defaultTrendPeriod", Number(v))}
            />
          </FormField>
          <FormField label="기본 국가" htmlFor="pf-country">
            <Select
              id="pf-country"
              value={form.country}
              options={YOUTUBE_COUNTRIES.map((c) => ({ value: c.code, label: c.label }))}
              onChange={(e) => set("country", e.target.value)}
            />
          </FormField>
        </div>
      </div>
    </SectionCard>
  );
}

/** 칩 입력: Enter 또는 쉼표로 추가, × 로 삭제 */
function ChipInput({
  label,
  placeholder,
  hint,
  items,
  onChange,
}: {
  label: string;
  placeholder: string;
  hint?: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [text, setText] = useState("");
  function add(raw: string) {
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) onChange([...new Set([...items, ...parts])]);
    setText("");
  }
  return (
    <FormField label={`${label} · ${items.length}개`} hint={hint}>
      <div className="space-y-2">
        <Input
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add(text);
            }
          }}
          onBlur={() => text.trim() && add(text)}
        />
        {items.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {items.map((t) => (
              <span key={t} className="inline-flex h-6 items-center gap-1 rounded-md border border-line bg-subtle pr-1 pl-2 text-xs text-fg-muted">
                {t}
                <button type="button" aria-label={`${t} 삭제`} onClick={() => onChange(items.filter((x) => x !== t))} className="rounded p-0.5 hover:bg-muted hover:text-fg">
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </FormField>
  );
}
