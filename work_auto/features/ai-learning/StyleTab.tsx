"use client";

import { useState } from "react";
import { Plus, Star, Trash2 } from "lucide-react";
import type { UserStyle, UserStyleInput } from "@/lib/types";
import { api } from "@/lib/api-client";
import { CHANNELS } from "@/lib/registry";
import { useAsync } from "@/lib/hooks/useAsync";
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  FormField,
  IconButton,
  Input,
  LoadingState,
  SectionCard,
  Select,
  Tag,
  Textarea,
  cardClass,
} from "@/components/ui";

const CHANNEL_OPTIONS = [
  { value: "all", label: "모든 채널" },
  ...CHANNELS.filter((c) => c.showOnHome && c.id !== "tools").map((c) => ({ value: c.id, label: c.name })),
];
const channelLabel = (id: string) => CHANNEL_OPTIONS.find((o) => o.value === id)?.label ?? id;
const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean);

/** Style Memory: 채널별 기본 스타일 1개가 생성 시 자동 적용된다 */
export function StyleTab() {
  const { data, loading, error, reload, setData } = useAsync(() => api.styles.list(), []);
  const [creating, setCreating] = useState(false);

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
      <div className="flex items-center justify-between">
        <p className="text-[13px] text-fg-subtle">채널마다 기본 스타일(★) 1개가 해당 채널의 모든 생성에 자동으로 적용됩니다.</p>
        <Button variant="primary" size="sm" icon={Plus} onClick={() => setCreating((v) => !v)}>
          스타일 추가
        </Button>
      </div>

      {creating && (
        <StyleForm
          onCancel={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            reload();
          }}
        />
      )}

      {!data?.length ? (
        <SectionCard>
          <EmptyState title="등록된 스타일이 없습니다" description="자주 쓰는 말투와 규칙을 등록하면 결과가 일정해집니다." />
        </SectionCard>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.map((s) => (
            <article key={s.id} className={`${cardClass} flex flex-col p-5`}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-fg">{s.name}</h3>
                    {s.isDefault && (
                      <Badge tone="brand">
                        <Star className="size-3" />
                        기본
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-fg-subtle">{channelLabel(s.channelId)}</p>
                </div>
                <IconButton icon={Trash2} label="삭제" size="sm" onClick={() => remove(s)} className="hover:text-danger" />
              </div>
              <p className="mt-3 text-[13px] font-medium text-fg-muted">{s.tone}</p>
              <p className="mt-1 text-[13px] text-fg-subtle">{s.description}</p>
              <ul className="mt-3 flex-1 space-y-1 text-[13px] text-fg-muted">
                {s.rules.map((r) => (
                  <li key={r}>· {r}</li>
                ))}
              </ul>
              {s.bannedPhrases.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {s.bannedPhrases.map((b) => (
                    <Tag key={b} className="text-danger line-through">
                      {b}
                    </Tag>
                  ))}
                </div>
              )}
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

function StyleForm({ onCancel, onCreated }: { onCancel: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", channelId: "all", tone: "", description: "", rules: "", examples: "", banned: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const input: UserStyleInput = {
        name: form.name,
        channelId: form.channelId as UserStyleInput["channelId"],
        tone: form.tone,
        description: form.description,
        rules: lines(form.rules),
        examplePhrases: lines(form.examples),
        bannedPhrases: form.banned.split(",").map((s) => s.trim()).filter(Boolean),
        isDefault: true,
      };
      await api.styles.create(input);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      title="새 스타일"
      description="저장하면 선택한 채널의 기본 스타일로 지정됩니다."
      footer={
        <div className="flex items-center justify-end gap-2">
          {error && <span className="mr-auto text-xs text-danger">{error}</span>}
          <Button size="sm" variant="ghost" onClick={onCancel}>
            취소
          </Button>
          <Button size="sm" variant="primary" loading={saving} disabled={!form.name.trim()} onClick={save}>
            저장
          </Button>
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="스타일 이름" htmlFor="style-name" required>
          <Input id="style-name" placeholder="예: 친근한 리뷰어" value={form.name} onChange={set("name")} />
        </FormField>
        <FormField label="적용 채널" htmlFor="style-channel">
          <Select id="style-channel" options={CHANNEL_OPTIONS} value={form.channelId} onChange={set("channelId")} />
        </FormField>
        <FormField label="톤" htmlFor="style-tone">
          <Input id="style-tone" placeholder="예: 친근하고 빠른 말투, 존댓말" value={form.tone} onChange={set("tone")} />
        </FormField>
        <FormField label="설명" htmlFor="style-desc">
          <Input id="style-desc" placeholder="예: 첫 문장에서 불편을 짚는다" value={form.description} onChange={set("description")} />
        </FormField>
        <FormField label="규칙" htmlFor="style-rules" hint="한 줄에 하나씩">
          <Textarea id="style-rules" rows={3} value={form.rules} onChange={set("rules")} />
        </FormField>
        <FormField label="자주 쓰는 표현" htmlFor="style-examples" hint="한 줄에 하나씩">
          <Textarea id="style-examples" rows={3} value={form.examples} onChange={set("examples")} />
        </FormField>
        <FormField label="금지 표현" htmlFor="style-banned" hint="쉼표로 구분" className="md:col-span-2">
          <Input id="style-banned" placeholder="예: 무조건 사세요, 역대급" value={form.banned} onChange={set("banned")} />
        </FormField>
      </div>
    </SectionCard>
  );
}
