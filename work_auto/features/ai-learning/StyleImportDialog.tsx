"use client";

import { useMemo, useRef, useState } from "react";
import { Download, FileUp } from "lucide-react";
import type { StyleImportPreview } from "@/lib/types";
import { api } from "@/lib/api-client";
import {
  STYLE_IMPORT_FIELD,
  STYLE_IMPORT_KINDS,
  STYLE_IMPORT_LABEL,
  STYLE_IMPORT_MAX_BYTES,
  STYLE_LIMITS,
  styleItemKey,
  type StyleImportKind,
} from "@/lib/style-limits";
import { Button, Modal, Notice } from "@/components/ui";
import { cn } from "@/lib/utils";

/** 나의 스타일 6개 목록 (UserStyle 필드 이름) */
export type StyleLists = Record<(typeof STYLE_IMPORT_FIELD)[StyleImportKind], string[]>;

export interface StyleImportResult {
  lists: StyleLists;
  input: number;
  added: number;
  duplicates: number;
  overLimit: number;
}


const CSV_SAMPLE = [
  "type,text",
  'hook,"이거 아직도 모르세요?"',
  'cta,"자세한 정보는 아래에서 확인하세요"',
  'title_pattern,"[제품] 사기 전에 꼭 알아야 하는 [숫자]가지"',
  'rule,"첫 문장에서 결론을 먼저 말한다"',
  'example_phrase,"제가 써보니까요"',
  'banned_phrase,"무조건 사세요"',
].join("\r\n");

/** 미리보기 결과를 지금 폼의 목록과 합친다: 기존과 같은 항목(대소문자·공백 무시)은 빼고, 저장 한도를 넘는 것은 뺀다 */
function merge(current: StyleLists, preview: StyleImportPreview) {
  const lists = { ...current } as StyleLists;
  const perKind = {} as Record<StyleImportKind, number>;
  let added = 0;
  let duplicates = preview.duplicateInFile;
  let overLimit = 0;
  for (const kind of STYLE_IMPORT_KINDS) {
    const field = STYLE_IMPORT_FIELD[kind];
    const limit = STYLE_LIMITS[field];
    const next = [...current[field]];
    const seen = new Set(next.map(styleItemKey));
    let count = 0;
    for (const item of preview.items[kind]) {
      const key = styleItemKey(item);
      if (seen.has(key)) {
        duplicates++;
        continue;
      }
      if (next.length >= limit.max || item.length > limit.len) {
        overLimit++;
        continue;
      }
      seen.add(key);
      next.push(item);
      count++;
    }
    lists[field] = next;
    perKind[kind] = count;
    added += count;
  }
  return { lists, perKind, added, duplicates, overLimit };
}

/**
 * [파일로 일괄 추가]
 * 1) .txt(한 줄 = 항목 1개, 추가할 항목 선택) 또는 .csv(type,text)를 고른다
 * 2) 서버가 메모리에서 읽고 미리보기만 돌려준다 (파일은 어디에도 저장하지 않는다)
 * 3) 확인하면 폼 목록에 합친다 → 수정 중인 스타일은 바로 저장
 */
export function StyleImportDialog({
  open,
  onClose,
  current,
  saveLabel,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  current: StyleLists;
  /** 확인 버튼 동작 설명: "저장" (기존 스타일) / "추가" (새 스타일, 저장은 따로) */
  saveLabel: "저장" | "추가";
  onConfirm: (result: StyleImportResult) => Promise<void> | void;
}) {
  const [target, setTarget] = useState<StyleImportKind>("hook");
  const [preview, setPreview] = useState<StyleImportPreview | null>(null);
  const [fileName, setFileName] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const merged = useMemo(() => (preview ? merge(current, preview) : null), [current, preview]);

  function reset() {
    setPreview(null);
    setFileName("");
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function close() {
    reset();
    onClose();
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    reset();
    if (!/\.(txt|csv)$/i.test(file.name)) return setError(".txt 또는 .csv 파일만 올릴 수 있습니다.");
    if (file.size > STYLE_IMPORT_MAX_BYTES) return setError("1MB 이하 파일만 올릴 수 있습니다.");
    setFileName(file.name);
    setLoading(true);
    try {
      setPreview(await api.styles.importPreview(file, /\.txt$/i.test(file.name) ? target : undefined));
    } catch (e) {
      setError(e instanceof Error ? e.message : "파일을 읽지 못했습니다.");
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function confirm() {
    if (!merged || !preview) return;
    setSaving(true);
    try {
      await onConfirm({ lists: merged.lists, input: preview.found, added: merged.added, duplicates: merged.duplicates, overLimit: merged.overLimit });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했습니다.");
    } finally {
      setSaving(false);
    }
  }

  function downloadSample() {
    // 엑셀에서 한글이 깨지지 않도록 UTF-8 BOM 을 붙인다
    const url = URL.createObjectURL(new Blob(["﻿" + CSV_SAMPLE], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "style-sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="파일로 일괄 추가"
      description="TXT 는 한 줄에 항목 하나, CSV 는 type,text 형식입니다. 파일은 저장하지 않고 글자만 읽습니다 (1MB, 1,000개, 항목당 500자까지)."
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={close}>
            취소
          </Button>
          <Button size="sm" variant="primary" loading={saving} disabled={!merged || merged.added === 0} onClick={() => void confirm()}>
            {merged ? `${merged.added}개 ${saveLabel}` : saveLabel}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="text-[13px] font-medium text-fg">TXT 파일을 넣을 항목</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {STYLE_IMPORT_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                aria-pressed={target === k}
                onClick={() => {
                  setTarget(k);
                  if (preview?.fileType === "txt") reset();
                }}
                className={cn(
                  "h-8 rounded-control border px-2.5 text-[13px] transition-colors",
                  target === k ? "border-brand bg-brand-soft font-medium text-brand" : "border-line-strong text-fg-muted hover:border-brand-line hover:text-brand",
                )}
              >
                {STYLE_IMPORT_LABEL[k]}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs text-fg-subtle">CSV 는 type 열로 종류를 정하므로 이 선택과 상관없이 여러 종류를 한 번에 넣습니다.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".txt,.csv,text/plain,text/csv" hidden onChange={(e) => void pick(e.target.files?.[0])} />
          <Button size="sm" variant="secondary" icon={FileUp} loading={loading} onClick={() => fileRef.current?.click()}>
            파일 고르기 (.txt / .csv)
          </Button>
          <Button size="sm" variant="ghost" icon={Download} onClick={downloadSample}>
            CSV 형식 예시 받기
          </Button>
          {fileName && <span className="truncate text-xs text-fg-subtle">{fileName}</span>}
        </div>

        {error && <Notice tone="warning">{error}</Notice>}

        {preview && merged && (
          <div className="space-y-3 rounded-card border border-line bg-subtle/40 p-4">
            <p className="text-[13px] font-semibold text-fg">파일에서 {preview.found.toLocaleString("ko-KR")}개 항목을 찾았습니다.</p>
            <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] text-fg-muted">
              {STYLE_IMPORT_KINDS.filter((k) => preview.items[k].length).map((k) => (
                <li key={k} className="flex justify-between">
                  <span>{STYLE_IMPORT_LABEL[k]}</span>
                  <span className="tabular">
                    {merged.perKind[k]}개 추가{preview.items[k].length !== merged.perKind[k] ? ` / ${preview.items[k].length}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            <div className="space-y-0.5 text-xs text-fg-subtle">
              <p>중복 제외 {merged.duplicates}개 (파일 안 {preview.duplicateInFile}개 + 이미 있는 항목 {merged.duplicates - preview.duplicateInFile}개)</p>
              {merged.overLimit > 0 && <p className="text-warning">저장 한도를 넘어 제외 {merged.overLimit}개 (Hook·CTA·제목 패턴·자주 쓰는 표현 200개, 규칙 50개, 금지 표현 100개·100자)</p>}
              {preview.truncated && <p className="text-warning">1,000개를 넘어 뒷부분은 읽지 않았습니다.</p>}
              {preview.decodedAsCp949 && <p>UTF-8 이 아니어서 한국어 윈도우 인코딩으로 읽었습니다. 글자가 깨졌다면 &lsquo;CSV UTF-8&rsquo; 로 다시 저장해 주세요.</p>}
            </div>
            {preview.errorCount > 0 && (
              <div className="rounded-control border border-warning/40 bg-canvas p-3">
                <p className="text-xs font-medium text-fg">저장하지 않는 행 {preview.errorCount}개</p>
                <ul className="mt-1 max-h-28 space-y-0.5 overflow-y-auto text-xs text-fg-subtle">
                  {preview.errors.map((e, i) => (
                    <li key={i}>
                      {e.line}행: {e.reason}
                    </li>
                  ))}
                  {preview.errorCount > preview.errors.length && <li>… 외 {preview.errorCount - preview.errors.length}행</li>}
                </ul>
              </div>
            )}
            {saveLabel === "추가" && <p className="text-xs text-fg-subtle">새 스타일은 아래 [저장]을 눌러야 반영됩니다.</p>}
          </div>
        )}
      </div>
    </Modal>
  );
}
