"use client";

import { useState } from "react";
import { ArrowRightLeft } from "lucide-react";
import type { ScriptFormat, UserStyle } from "@/lib/types";
import { api } from "@/lib/api-client";
import { SCRIPT_FORMAT_TYPES } from "@/lib/script-format";
import { STYLE_LIMITS } from "@/lib/style-limits";
import { Button, Combobox, FormField, Modal, Notice } from "@/components/ui";

/**
 * 나의 스타일 → [대본 포맷으로 복사] (v0.9.37, docs/SCRIPT_FORMATS.md)
 * 스타일의 Hook·CTA·제목 패턴·원하는 유형을 고른 대본 포맷에 '더한다' (같은 문장은 한 번만, 한도 안에서).
 * 사용자가 누를 때만, 스타일의 값은 지우지 않는다. 생성은 포맷에 있는 것을 먼저 쓴다.
 */
export function CopyToFormatButton({ style }: { style: UserStyle }) {
  const [open, setOpen] = useState(false);
  const [formats, setFormats] = useState<ScriptFormat[] | null>(null);
  const [formatId, setFormatId] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const count = style.hooks.length + style.ctas.length + (style.titlePatterns?.length ?? 0);
  if (!count) return null;

  async function show() {
    setOpen(true);
    setDone(null);
    setError(null);
    if (!formats) {
      const rows = await api.scriptFormats.list().catch(() => [] as ScriptFormat[]);
      setFormats(rows);
      setFormatId(style.productFormatId ?? rows[0]?.id ?? "");
    }
  }

  async function copy() {
    const f = formats?.find((x) => x.id === formatId);
    if (!f) return;
    setSaving(true);
    setError(null);
    try {
      const merge = (cur: string[] = [], add: string[] = [], max: number) => [...cur, ...add.filter((x) => !cur.includes(x))].slice(0, max);
      const types = { ...(f.preferredTypes ?? {}) };
      for (const k of ["hooks", "ctas", "titlePatterns"] as const) {
        const add = style.preferredTypes?.[k] ?? [];
        if (add.length) types[k] = [...new Set([...(types[k] ?? []), ...add])];
      }
      const next = await api.scriptFormats.update(f.id, {
        name: f.name,
        contentType: f.contentType,
        channelIds: f.channelIds,
        examples: f.examples,
        guideline: f.guideline,
        isDefault: f.isDefault,
        badExamples: f.badExamples ?? [],
        hooks: merge(f.hooks, style.hooks, STYLE_LIMITS.hooks.max),
        ctas: merge(f.ctas, style.ctas, STYLE_LIMITS.ctas.max),
        titlePatterns: merge(f.titlePatterns, style.titlePatterns ?? [], STYLE_LIMITS.titlePatterns.max),
        preferredTypes: types,
      });
      setFormats((prev) => prev?.map((x) => (x.id === next.id ? next : x)) ?? null);
      setDone(`'${next.name}'에 복사했습니다: Hook ${next.hooks?.length ?? 0} · CTA ${next.ctas?.length ?? 0} · 제목 패턴 ${next.titlePatterns?.length ?? 0} (스타일의 값은 그대로 남아 있습니다)`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "복사하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  const options = (formats ?? []).map((f) => ({
    value: f.id,
    label: `${f.isDefault ? "★ " : ""}${f.name}`,
    description: `${SCRIPT_FORMAT_TYPES.find((t) => t.value === f.contentType)?.label ?? ""} · ${f.channelIds.length ? f.channelIds.join(", ") : "모든 채널"}`,
  }));

  return (
    <>
      <Button size="sm" variant="ghost" icon={ArrowRightLeft} onClick={() => void show()} title="Hook·CTA·제목 패턴을 대본 포맷으로 복사합니다 (스타일 값은 그대로)" data-copy-to-format>
        대본 포맷으로 복사
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Hook·CTA·제목 패턴을 대본 포맷으로 복사"
        description={`'${style.name}'의 Hook ${style.hooks.length} · CTA ${style.ctas.length} · 제목 패턴 ${style.titlePatterns?.length ?? 0}개와 원하는 유형을 고른 포맷에 더합니다. 같은 문장은 한 번만 넣고, 스타일의 값은 지우지 않습니다.`}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              닫기
            </Button>
            <Button variant="primary" icon={ArrowRightLeft} loading={saving} disabled={!formatId} onClick={() => void copy()}>
              이 포맷으로 복사
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <FormField label="대본 포맷" htmlFor="copy-format">
            <Combobox
              id="copy-format"
              value={formatId}
              options={options}
              placeholder={formats ? (options.length ? "포맷을 고르세요" : "대본 포맷이 없습니다 — 대본 포맷 탭에서 먼저 만드세요") : "불러오는 중…"}
              searchPlaceholder="포맷 이름으로 검색"
              onChange={setFormatId}
            />
          </FormField>
          <p className="text-xs text-fg-subtle">생성할 때는 포맷에 있는 Hook·CTA·제목 패턴을 먼저 쓰고, 포맷에 없는 항목만 스타일 것을 씁니다.</p>
          {error && <Notice tone="warning">{error}</Notice>}
          {done && <Notice tone="info">{done}</Notice>}
        </div>
      </Modal>
    </>
  );
}
