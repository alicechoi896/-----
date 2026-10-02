import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind 클래스 병합 (조건부 클래스 + 충돌 해결) */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const numberFormatter = new Intl.NumberFormat("ko-KR");

/** 1234567 → "1,234,567" */
export function formatNumber(value: number): string {
  return numberFormatter.format(Math.round(value));
}

/** 1234567 → "123.5만", 9876 → "9,876" (한국식 축약) */
export function formatCompact(value: number): string {
  if (value >= 100_000_000) return `${trimZero(value / 100_000_000)}억`;
  if (value >= 10_000) return `${trimZero(value / 10_000)}만`;
  return formatNumber(value);
}

function trimZero(n: number): string {
  return n.toFixed(1).replace(/\.0$/, "");
}

/** ISO → "2026.10.01" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

/** ISO → "3일 전" 등 상대 시간 (기준 시각을 넘기면 SSR/CSR 결과가 같아진다) */
export function formatRelative(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "-";
  const diff = Math.max(0, now - new Date(iso).getTime());
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hour = Math.floor(min / 60);
  if (hour < 24) return `${hour}시간 전`;
  const day = Math.floor(hour / 24);
  if (day < 30) return `${day}일 전`;
  return formatDate(iso);
}

/** 초 → "12:05" / "1:02:03" */
export function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** 서버/클라이언트 공용 ID 생성 */
export function createId(prefix: string): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${random}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** 결정적 의사난수 (Mock 데이터가 새로고침마다 바뀌지 않도록 문자열 해시 기반) */
export function seededNumber(seed: string, min: number, max: number): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const unit = ((h >>> 0) % 10_000) / 10_000;
  return Math.floor(min + unit * (max - min + 1));
}
