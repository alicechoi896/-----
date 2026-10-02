import type { ConnectionStatus, FeatureStatus } from "@/lib/types";
import { Badge, type BadgeTone } from "./Badge";

type StatusKey = FeatureStatus | ConnectionStatus;

const STATUS_MAP: Record<StatusKey, { label: string; tone: BadgeTone }> = {
  // 기능 상태
  live: { label: "운영", tone: "success" },
  mock: { label: "Mock", tone: "info" },
  planned: { label: "준비 중", tone: "neutral" },
  // 연결 상태
  connected: { label: "연결됨", tone: "success" },
  disconnected: { label: "미연결", tone: "neutral" },
  error: { label: "오류", tone: "danger" },
};

/**
 * 상태 표시 배지. 상태 → 색/문구 매핑을 이 파일 한 곳에서 관리한다.
 * 색만으로 구분하지 않도록 항상 점과 텍스트를 함께 표시한다.
 */
export function StatusBadge({ status, label }: { status: StatusKey; label?: string }) {
  const s = STATUS_MAP[status];
  return (
    <Badge tone={s.tone} dot>
      {label ?? s.label}
    </Badge>
  );
}
