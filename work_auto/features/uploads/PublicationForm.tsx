"use client";

import { useState } from "react";
import { FilePlus2, ListChecks, Save } from "lucide-react";
import type { ContentPublicationInput, ContentPublicationView, GeneratedContent, Product, PublicationStatus } from "@/lib/types";
import { api } from "@/lib/api-client";
import { useAsync } from "@/lib/hooks/useAsync";
import { findFeature } from "@/lib/registry";
import { PUBLICATION_STATUSES, PUBLISH_PLATFORMS, platformForChannel } from "@/lib/publish-platforms";
import { Button, Combobox, FormField, Input, Modal, Notice, SegmentedControl, Select, Textarea } from "@/components/ui";
import { formatRelative } from "@/lib/utils";

/** ISO → <input type="datetime-local"> 값 (내 PC 시간대) */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : null);

type Mode = "content" | "manual";

interface FormState {
  contentId: string;
  productId: string;
  platform: string;
  accountName: string;
  title: string;
  contentType: string;
  status: PublicationStatus;
  scheduledAt: string;
  publishedAt: string;
  platformUrl: string;
  assigneeId: string;
  note: string;
}

function initialState(editing: ContentPublicationView | null, presetContent: GeneratedContent | null, defaultDate?: string): FormState {
  if (editing) {
    return {
      contentId: editing.contentId ?? "",
      productId: editing.productId ?? "",
      platform: editing.platform,
      accountName: editing.accountName,
      title: editing.title,
      contentType: editing.contentType,
      status: editing.status,
      scheduledAt: toLocalInput(editing.scheduledAt),
      publishedAt: toLocalInput(editing.publishedAt),
      platformUrl: editing.platformUrl ?? "",
      assigneeId: editing.assigneeId ?? "",
      note: editing.note ?? "",
    };
  }
  const base: FormState = {
    contentId: "",
    productId: "",
    platform: "youtube",
    accountName: "",
    title: "",
    contentType: "",
    status: "published",
    scheduledAt: "",
    publishedAt: toLocalInput(defaultDate ?? new Date().toISOString()),
    platformUrl: "",
    assigneeId: "",
    note: "",
  };
  return presetContent ? { ...base, ...fromContent(presetContent) } : base;
}

/** 기존 콘텐츠를 고르면 제품·제목·원고 유형·채널을 채운다 */
function fromContent(c: GeneratedContent): Partial<FormState> {
  return {
    contentId: c.id,
    productId: c.productId ?? "",
    title: c.headline,
    contentType: findFeature(c.featureId)?.title ?? "",
    platform: platformForChannel(c.channelId),
  };
}

/**
 * 업로드 등록·수정 창.
 * [기존 콘텐츠 선택]: 내가 만든 콘텐츠를 검색해 고르면 제품·제목·원고 유형·플랫폼을 채운다
 * [직접 등록]: 생성 시스템 밖에서 만든 콘텐츠
 */
export function PublicationForm({
  open,
  onClose,
  editing,
  presetContentId,
  defaultDate,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing: ContentPublicationView | null;
  presetContentId?: string;
  /** 캘린더에서 날짜를 고른 뒤 등록하면 그날로 */
  defaultDate?: string;
  onSaved: (p: ContentPublicationView) => void;
}) {
  const contents = useAsync(() => api.contents.list(), []);
  const products = useAsync(() => api.products.list(), []);
  const assignees = useAsync(() => api.publications.assignees(), []);
  const preset = (contents.data ?? []).find((c) => c.id === presetContentId) ?? null;
  const [mode, setMode] = useState<Mode>(editing ? (editing.contentId ? "content" : "manual") : "content");
  const [form, setForm] = useState<FormState>(() => initialState(editing, null, defaultDate));
  const [presetApplied, setPresetApplied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  // 생성 결과 화면에서 [업로드 등록]으로 들어오면 그 콘텐츠를 미리 고른다 (목록을 읽은 뒤 한 번)
  if (!editing && preset && !presetApplied) {
    setPresetApplied(true);
    setForm((f) => ({ ...f, ...fromContent(preset) }));
  }

  const contentOptions = (contents.data ?? []).map((c: GeneratedContent) => ({
    value: c.id,
    label: c.headline,
    description: `${findFeature(c.featureId)?.title ?? c.featureId} · ${c.context.product?.name ?? "제품 없음"} · ${formatRelative(c.createdAt)}`,
  }));
  const productOptions = (products.data ?? []).map((p: Product) => ({ value: p.id, label: p.name, description: [p.brand, p.category].filter(Boolean).join(" · ") }));
  const isAdminPicker = (assignees.data?.length ?? 0) > 1;

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const input: Partial<ContentPublicationInput> = {
        contentId: mode === "content" ? form.contentId || null : null,
        productId: form.productId || null,
        platform: form.platform,
        accountName: form.accountName,
        title: form.title,
        contentType: form.contentType,
        status: form.status,
        scheduledAt: fromLocalInput(form.scheduledAt),
        publishedAt: fromLocalInput(form.publishedAt),
        platformUrl: form.platformUrl || null,
        assigneeId: form.assigneeId || null,
        note: form.note || null,
      };
      const saved = editing ? await api.publications.update(editing.id, input) : await api.publications.create(input);
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const canSave = Boolean(form.title.trim() && form.platform && (mode === "manual" || form.contentId));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? "업로드 수정" : "업로드 등록"}
      description="실제로 어느 날, 어느 채널에, 어떤 콘텐츠를 올렸는지 기록합니다. 팀원 모두가 캘린더에서 볼 수 있습니다."
      className="max-w-2xl"
      footer={
        <div className="flex items-center justify-end gap-2">
          {error && <span className="mr-auto text-xs text-danger">{error}</span>}
          <Button size="sm" variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button size="sm" variant="primary" icon={Save} loading={saving} disabled={!canSave} onClick={() => void save()}>
            저장
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <SegmentedControl
          className="w-full [&>button]:flex-1"
          value={mode}
          onChange={(v) => {
            setMode(v as Mode);
            if (v === "manual") set("contentId", "");
          }}
          options={[
            { value: "content", label: "기존 콘텐츠 선택", icon: ListChecks },
            { value: "manual", label: "직접 등록", icon: FilePlus2 },
          ]}
        />

        {mode === "content" && (
          <FormField label="콘텐츠" required hint="내가 만든 콘텐츠에서 검색합니다. 고르면 제품·제목·원고 유형·플랫폼을 채웁니다.">
            <Combobox
              value={form.contentId}
              options={contentOptions}
              placeholder={contents.loading ? "불러오는 중…" : "콘텐츠 검색"}
              searchPlaceholder="제목·기능·제품으로 검색"
              emptyText={contentOptions.length ? "검색 결과가 없습니다" : "아직 만든 콘텐츠가 없습니다. '직접 등록'을 이용해 주세요."}
              onChange={(id) => {
                const c = (contents.data ?? []).find((x) => x.id === id);
                setForm((f) => (c ? { ...f, ...fromContent(c) } : { ...f, contentId: "" }));
              }}
            />
          </FormField>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <FormField label="플랫폼" required>
            <Select value={form.platform} options={PUBLISH_PLATFORMS.map((p) => ({ value: p.id, label: p.label }))} onChange={(e) => set("platform", e.target.value)} />
          </FormField>
          <FormField label="채널 / 계정" optional>
            <Input value={form.accountName} maxLength={60} placeholder="예: 지니 리뷰 채널" onChange={(e) => set("accountName", e.target.value)} />
          </FormField>
          <FormField label="콘텐츠 제목" required className="md:col-span-2">
            <Input value={form.title} maxLength={200} placeholder="예: 에어팟5 살 생각이라면 이 기능부터" onChange={(e) => set("title", e.target.value)} />
          </FormField>
          <FormField label="제품" optional>
            <Combobox
              value={form.productId}
              options={productOptions}
              placeholder="제품 연결 안 함"
              searchPlaceholder="제품 이름·브랜드로 검색"
              emptyText={productOptions.length ? "검색 결과가 없습니다" : "저장된 제품이 없습니다"}
              onChange={(v) => set("productId", v)}
            />
          </FormField>
          <FormField label="원고 유형" optional>
            <Input value={form.contentType} maxLength={60} placeholder="예: 제품 홍보 영상" onChange={(e) => set("contentType", e.target.value)} />
          </FormField>
          <FormField label="상태" className="md:col-span-2">
            <SegmentedControl value={form.status} onChange={(v) => set("status", v as PublicationStatus)} options={PUBLICATION_STATUSES.map((s) => ({ value: s.value, label: s.label }))} />
          </FormField>
          <FormField label="예약일" optional={form.status !== "scheduled"} required={form.status === "scheduled"}>
            <Input type="datetime-local" value={form.scheduledAt} onChange={(e) => set("scheduledAt", e.target.value)} />
          </FormField>
          <FormField label="실제 업로드일" optional hint={form.status === "published" ? "비우면 지금 시각으로 저장합니다" : undefined}>
            <Input type="datetime-local" value={form.publishedAt} onChange={(e) => set("publishedAt", e.target.value)} />
          </FormField>
          <FormField label="업로드 URL" optional className="md:col-span-2">
            <Input type="url" value={form.platformUrl} placeholder="https://" onChange={(e) => set("platformUrl", e.target.value)} />
          </FormField>
          <FormField label="담당자" hint={isAdminPicker ? "관리자는 승인된 직원 중에서 고릅니다" : "직원이 등록하면 담당자는 본인입니다"}>
            <Select
              value={form.assigneeId || assignees.data?.[0]?.id || ""}
              disabled={!isAdminPicker}
              options={(assignees.data ?? []).map((a) => ({ value: a.id, label: a.name }))}
              onChange={(e) => set("assigneeId", e.target.value)}
            />
          </FormField>
          <FormField label="메모" optional>
            <Textarea rows={2} value={form.note} maxLength={1000} onChange={(e) => set("note", e.target.value)} />
          </FormField>
        </div>
        {editing && !editing.canEdit && <Notice tone="warning">등록한 사람·담당자·관리자만 수정할 수 있습니다.</Notice>}
      </div>
    </Modal>
  );
}
