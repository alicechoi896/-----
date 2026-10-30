"use client";

import { useRef, type ReactNode } from "react";
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
