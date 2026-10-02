"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "./Button";

/**
 * 체크한 항목 삭제 버튼. 선택이 없으면 숨는다.
 * 확인 창을 띄운 뒤 onDelete 를 부른다.
 */
export function BulkDeleteButton({
  count,
  noun,
  warning,
  onDelete,
  onClear,
}: {
  count: number;
  /** 예: "콘텐츠" */
  noun: string;
  /** 확인 창에 덧붙일 말 (함께 지워지는 것 등) */
  warning?: string;
  onDelete: () => Promise<void>;
  onClear: () => void;
}) {
  const [busy, setBusy] = useState(false);
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-fg-muted">{count}개 선택</span>
      <Button size="sm" variant="ghost" onClick={onClear}>
        선택 해제
      </Button>
      <Button
        size="sm"
        variant="danger"
        icon={Trash2}
        loading={busy}
        onClick={async () => {
          if (!window.confirm(`선택한 ${noun} ${count}개를 삭제할까요? 되돌릴 수 없습니다.${warning ? `\n${warning}` : ""}`)) return;
          setBusy(true);
          try {
            await onDelete();
          } finally {
            setBusy(false);
          }
        }}
      >
        삭제
      </Button>
    </div>
  );
}
