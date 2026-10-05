/**
 * 생성 품질 규칙 — 화면·서버 공용. docs/QUALITY_MODES.md
 * v0.9.40: 정밀 생성(AI 4회)은 2단계 생성으로 바뀌었다 (docs/TWO_STAGE_CONTENT_GENERATION.md).
 * 영상·클립(대본·제목·Hook 이 있는 기능)은 ① 제목·Hook·CTA 후보 → ② 고른 제목마다 대본 3편.
 */
import type { OutputSection } from "./types";

export const TOP_TITLE_COUNT = 5;

/** 대본 뼈대 체크 (검토 단계가 판정) */
export type SkeletonCheck = "hook" | "openLoop" | "answer";
export const SKELETON_CHECKS: { key: SkeletonCheck; label: string; description: string }[] = [
  { key: "hook", label: "3초 Hook", description: "첫 3~5초에 질문·반전·손해 경고" },
  { key: "openLoop", label: "오픈 루프", description: "중간에 '끝까지 보면 알 수 있는' 궁금증 하나" },
  { key: "answer", label: "끝에 답", description: "열어 둔 궁금증의 답을 마지막에" },
];

/** 정밀 생성 결과 메타 (ContextSummary.quality 에 저장, DB 변경 없음 — contents.context jsonb) */
export interface PreciseQuality {
  mode: "precise";
  angles: { name: string; why: string }[];
  /** 추천 제목 TOP 5 (제목 문자열로 저장 → 추가 만들기로 목록이 바뀌어도 맞춰 찾는다) */
  titleTop: { title: string; reason: string }[];
  /** 대본별: 앵글 · 뼈대 체크 · 검토 메모. key = scriptMetaKey(대본) */
  scripts: { key: string; angle: string; checks: Record<SkeletonCheck, boolean>; review: string }[];
}

/** 2단계 생성 기능: 대본·제목·Hook 이 모두 있는 영상·클립 */
export function supportsPrecise(outputs: OutputSection[]): boolean {
  const keys = new Set(outputs.map((o) => o.key));
  return keys.has("script") && keys.has("titles") && keys.has("hooks");
}

/** 대본 ↔ 메타 연결 키 (공백·기호 무시, 앞 80자) */
export const scriptMetaKey = (text: string) => text.replace(/[\s\p{P}\p{S}]/gu, "").slice(0, 80);
