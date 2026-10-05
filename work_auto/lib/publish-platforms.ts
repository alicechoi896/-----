import type { ChannelId, PublicationStatus } from "@/lib/types";

/**
 * 업로드 플랫폼 목록. DB 에는 제한(check)을 두지 않고 여기서만 관리한다.
 * Instagram·Threads·TikTok 등은 이 목록에 한 줄 추가하면 된다.
 */
export interface PublishPlatform {
  id: string;
  label: string;
  /** 캘린더 점 색 (tailwind 클래스) */
  dot: string;
  /** 생성 콘텐츠의 채널과 연결 (기존 콘텐츠를 고르면 플랫폼을 자동으로 고른다) */
  channelId?: ChannelId;
}

export const PUBLISH_PLATFORMS: PublishPlatform[] = [
  { id: "youtube", label: "YouTube", dot: "bg-red-500", channelId: "youtube" },
  { id: "naver-clip", label: "NAVER 클립", dot: "bg-blue-500", channelId: "naver-clip" },
  { id: "naver-blog", label: "NAVER 블로그", dot: "bg-green-600", channelId: "naver-blog" },
  { id: "other", label: "기타", dot: "bg-slate-400" },
];

export const platformLabel = (id: string) => PUBLISH_PLATFORMS.find((p) => p.id === id)?.label ?? id;
export const platformDot = (id: string) => PUBLISH_PLATFORMS.find((p) => p.id === id)?.dot ?? "bg-slate-400";
export const platformForChannel = (channelId: string) => PUBLISH_PLATFORMS.find((p) => p.channelId === channelId)?.id ?? "other";

export const PUBLICATION_STATUSES: { value: PublicationStatus; label: string; tone: "neutral" | "info" | "success" | "danger" }[] = [
  { value: "draft", label: "준비 중", tone: "neutral" },
  { value: "scheduled", label: "예약", tone: "info" },
  { value: "published", label: "업로드 완료", tone: "success" },
  { value: "failed", label: "실패", tone: "danger" },
];

export const statusLabel = (s: string) => PUBLICATION_STATUSES.find((x) => x.value === s)?.label ?? s;
export const statusTone = (s: string) => PUBLICATION_STATUSES.find((x) => x.value === s)?.tone ?? "neutral";

/** 캘린더에 놓을 날짜: 실제 업로드일 → 예약일 → 등록일 */
export function publicationDate(p: { publishedAt: string | null; scheduledAt: string | null; createdAt: string }): string {
  return p.publishedAt ?? p.scheduledAt ?? p.createdAt;
}

/** 한국 시간 기준 YYYY-MM-DD */
export function dayKey(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 3600_000);
  return d.toISOString().slice(0, 10);
}
