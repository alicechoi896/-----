"use client";

import { useEffect, useMemo, useState } from "react";
import type { ContentUploadState } from "@/lib/types";
import { api } from "@/lib/api-client";
import { Badge } from "@/components/ui";

/**
 * 생성 콘텐츠의 업로드 상태 (업로드 기록에서 계산한 값).
 * 미업로드 · 예약 · 업로드 완료. 업로드 관리 권한이 없거나 조회에 실패하면 아무것도 보여 주지 않는다.
 */
export function useUploadStatus(contentIds: string[]): Record<string, ContentUploadState> | null {
  const key = useMemo(() => [...new Set(contentIds)].sort().join(","), [contentIds]);
  const [state, setState] = useState<{ key: string; value: Record<string, ContentUploadState> } | null>(null);
  useEffect(() => {
    if (!key) return;
    let active = true;
    api.publications
      .status(key.split(","))
      .then((value) => active && setState({ key, value }))
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [key]);
  return state && state.key === key ? state.value : null;
}

const LABEL: Record<ContentUploadState, { text: string; tone: "neutral" | "info" | "success" }> = {
  none: { text: "미업로드", tone: "neutral" },
  scheduled: { text: "예약", tone: "info" },
  published: { text: "업로드 완료", tone: "success" },
};

export function UploadStatusBadge({ state }: { state: ContentUploadState | undefined | null }) {
  const s = LABEL[state ?? "none"];
  return <Badge tone={s.tone}>{s.text}</Badge>;
}
