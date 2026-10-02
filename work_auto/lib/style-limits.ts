/**
 * 나의 스타일: 항목별 저장 한도, 파일 일괄 추가 종류, 문자열 정리 규칙.
 * 화면(StyleTab)과 서버(memory 서비스, 파일 파싱)가 같은 규칙을 쓴다. (docs/STYLE_CONTEXT.md)
 *
 * 저장 한도와 "생성할 때 AI 에 보내는 개수"는 다르다.
 * 많이 저장해 두면 생성할 때마다 일부(10개)를 무작위로 골라 보낸다 (lib/server/ai/style-context.ts).
 * 규칙·금지 표현은 매번 전부 보내므로 저장 한도를 작게 둔다.
 */
export const STYLE_LIMITS = {
  rules: { max: 50, len: 500 },
  bannedPhrases: { max: 100, len: 100 },
  examplePhrases: { max: 200, len: 500 },
  hooks: { max: 200, len: 500 },
  ctas: { max: 200, len: 500 },
  titlePatterns: { max: 200, len: 500 },
} as const;

/** 파일 일괄 추가로 넣을 수 있는 항목. CSV 의 type 값과 같다 */
export const STYLE_IMPORT_KINDS = ["hook", "cta", "title_pattern", "rule", "example_phrase", "banned_phrase"] as const;
export type StyleImportKind = (typeof STYLE_IMPORT_KINDS)[number];

export const STYLE_IMPORT_LABEL: Record<StyleImportKind, string> = {
  hook: "Hook",
  cta: "CTA",
  title_pattern: "제목 패턴",
  rule: "규칙",
  example_phrase: "자주 쓰는 표현",
  banned_phrase: "금지 표현",
};

/** 파일 종류 → UserStyle 필드 */
export const STYLE_IMPORT_FIELD = {
  hook: "hooks",
  cta: "ctas",
  title_pattern: "titlePatterns",
  rule: "rules",
  example_phrase: "examplePhrases",
  banned_phrase: "bannedPhrases",
} as const satisfies Record<StyleImportKind, keyof typeof STYLE_LIMITS>;

/** 파일 업로드 한도 */
export const STYLE_IMPORT_MAX_BYTES = 1024 * 1024;
export const STYLE_IMPORT_MAX_ITEMS = 1000;
export const STYLE_IMPORT_MAX_LEN = 500;

/** null byte·제어 문자(탭·줄바꿈 제외)·BOM 제거, 줄바꿈과 연속 공백은 한 칸으로, 앞뒤 공백 제거 */
export function cleanStyleText(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 중복 비교용 키: 대소문자·공백 차이는 같은 항목으로 본다 */
export function styleItemKey(s: string): string {
  return cleanStyleText(s).toLowerCase();
}
