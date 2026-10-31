"use client";

import { useRef, useState, type ReactNode } from "react";
import { Upload } from "lucide-react";
import { Button, Input, Modal, Notice, Textarea } from "@/components/ui";
import { CREDIT_USD } from "@/lib/drama-studio/models";
import { cn } from "@/lib/utils";

/** 라벨 + 한 줄/여러 줄 입력 */
export function TextField({ label, value, onChange, rows = 0, placeholder, className, disabled }: { label: string; value: string; onChange: (v: string) => void; rows?: number; placeholder?: string; className?: string; disabled?: boolean }) {
  return (
    <label className={cn("block space-y-1", className)}>
      <span className="text-[12px] font-medium text-fg-muted">{label}</span>
      {rows ? (
        <Textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} placeholder={placeholder} disabled={disabled} />
      ) : (
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} disabled={disabled} className="h-9" />
      )}
    </label>
  );
}

export interface CostItem {
  label: string;
  count: number;
  /** 최소 예상 크레딧 합 (null = 가격 확인 안 됨) */
  credits: number | null;
}

/** 비용이 드는 Kie 작업 확인 창: 작업 수·최소 예상 크레딧을 보여 주고 [만들기]를 눌러야 실행 */
export function CostConfirm({ open, title, items, notes = [], onCancel, onConfirm, busy }: { open: boolean; title: string; items: CostItem[]; notes?: string[]; onCancel: () => void; onConfirm: () => void; busy?: boolean }) {
  const count = items.reduce((n, i) => n + i.count, 0);
  const known = items.every((i) => i.credits !== null);
  const credits = items.reduce((n, i) => n + (i.credits ?? 0), 0);
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description="Kie AI 유료 작업입니다. 확인한 뒤에만 요청을 보냅니다 (자동 재시도 없음)."
      footer={
        <>
          <Button variant="secondary" onClick={onCancel}>
            취소
          </Button>
          <Button variant="primary" loading={busy} onClick={onConfirm} data-cost-confirm>
            {count}개 만들기
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-[13px]">
        <ul className="divide-y divide-line rounded-control border border-line">
          {items.map((i) => (
            <li key={i.label} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-fg">{i.label}</span>
              <span className="tabular text-fg-muted">
                {i.count}개 · {i.credits === null ? "가격 확인 안 됨" : `최소 약 ${i.credits.toLocaleString()} 크레딧`}
              </span>
            </li>
          ))}
        </ul>
        <p className="font-semibold text-fg">
          총 {count}개 작업 · {known ? `최소 예상 약 ${credits.toLocaleString()} 크레딧 (≈ $${(credits * CREDIT_USD).toFixed(2)})` : `확인된 부분만 최소 약 ${credits.toLocaleString()} 크레딧`}
        </p>
        <p className="text-[12px] text-fg-subtle">kie.ai 에 공개된 &lsquo;최소 단가&rsquo; 기준 예상치입니다. 해상도·소리·참고 이미지에 따라 더 들 수 있고, 실제 사용량은 작업이 끝난 뒤 따로 표시합니다.</p>
        {notes.map((n) => (
          <Notice key={n} tone="warning">
            {n}
          </Notice>
        ))}
      </div>
    </Modal>
  );
}

/** 파일 고르기 버튼 (여러 개 가능) */
export function UploadButton({ accept, multiple, onFiles, children, size = "sm", disabled, variant = "secondary" }: { accept: string; multiple?: boolean; onFiles: (files: File[]) => void; children: ReactNode; size?: "sm" | "md"; disabled?: boolean; variant?: "secondary" | "ghost" | "subtle" }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button size={size} variant={variant} icon={Upload} disabled={disabled} onClick={() => ref.current?.click()}>
        {children}
      </Button>
      <input
        ref={ref}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (files.length) onFiles(files);
        }}
      />
    </>
  );
}

/** 상태 배지 색 */
export const taskTone = (s: string): "info" | "success" | "danger" | "neutral" => (s === "success" ? "success" : s === "fail" ? "danger" : s === "queued" ? "neutral" : "info");
export const TASK_LABEL: Record<string, string> = { queued: "생성 대기", requesting: "요청 중", generating: "생성 중", success: "완료", fail: "실패" };

/**
 * 프롬프트 고치기 창 (v0.9.91) — 실제로 보낼 프롬프트를 채워서 보여 주고, 고쳐서 저장하거나 바로 다시 만든다.
 * value = 직접 고친 프롬프트 (비어 있으면 auto = 자동 프롬프트)
 */
export function PromptModal({ title, value, auto, note, onClose, onSave, onRegenerate, regenerateLabel = "이 프롬프트로 다시 만들기", busy }: { title: string; value: string; auto: string; note?: string; onClose: () => void; onSave: (text: string) => void; onRegenerate: (text: string) => void; regenerateLabel?: string; busy?: boolean }) {
  const [text, setText] = useState(value.trim() || auto);
  const custom = text.trim() !== auto.trim();
  return (
    <Modal
      open
      onClose={onClose}
      title={title}
      description="영어로 쓰는 것이 가장 정확합니다. 고친 프롬프트는 이 장면에 저장돼 다음에 다시 만들 때도 씁니다."
      footer={
        <>
          <Button variant="ghost" onClick={() => setText(auto)} disabled={!custom}>
            자동 프롬프트로 되돌리기
          </Button>
          <Button variant="secondary" onClick={() => onSave(custom ? text : "")}>
            저장만
          </Button>
          <Button variant="primary" loading={busy} disabled={!text.trim()} onClick={() => onRegenerate(text)} data-prompt-regenerate>
            {regenerateLabel}
          </Button>
        </>
      }
    >
      <Textarea rows={16} value={text} onChange={(e) => setText(e.target.value)} className="font-mono text-[12px]" data-prompt-text />
      <p className="mt-1.5 text-[11.5px] text-fg-subtle">{custom ? "직접 고친 프롬프트" : "자동 프롬프트 (시나리오·인물에서 만든 것)"} · {text.length.toLocaleString()}자{note ? ` · ${note}` : ""}</p>
    </Modal>
  );
}
