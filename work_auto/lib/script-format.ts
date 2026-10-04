/**
 * 대본 포맷 — 화면·서버가 같이 쓰는 규칙 (docs/SCRIPT_FORMATS.md)
 * - 메모장(.txt)에 여러 대본을 붙여 둔 파일을 대본 단위로 나눈다 (브라우저에서 읽고 서버로 파일을 올리지 않는다)
 */
import type { ScriptExample, ScriptFormatType } from "@/lib/types/script-format";

export const SCRIPT_FORMAT_LIMITS = {
  /** 포맷 하나에 넣는 참고 대본 수 */
  examples: 30,
  exampleChars: 2000,
  titleChars: 200,
  guidelineChars: 3000,
  nameChars: 40,
  /** 불러올 파일 크기 */
  fileBytes: 1_000_000,
  /** AI 로 포맷을 뽑을 때 보내는 대본 글자 수 합계 */
  analyzeChars: 12_000,
  /** 생성할 때 함께 보내는 예시 대본 수·글자 수 */
  promptExamples: 2,
  promptExampleChars: 500,
} as const;

export const SCRIPT_FORMAT_TYPES: { value: ScriptFormatType; label: string; description: string }[] = [
  { value: "product", label: "제품 홍보", description: "제품 홍보 영상·제품 홍보 클립에 적용" },
  { value: "info", label: "정보성", description: "정보성 영상·정보성 클립에 적용" },
];

/** 생성 기능 → 대본 포맷 유형 (영상·클립만. 블로그는 대본이 없다) */
export function scriptFormatTypeOf(featureId: string): ScriptFormatType | null {
  if (featureId === "yt-product-video" || featureId === "clip-product-content") return "product";
  if (featureId === "yt-info-video" || featureId === "clip-info-content") return "info";
  return null;
}

/** "4.2만회", "1만", "5.4천회", "12,000회" → 숫자 */
export function parseViews(s: string): number | null {
  const m = s.replace(/\s/g, "").match(/^([\d.,]+)(천|만)?회?$/);
  if (!m || (!m[2] && !s.includes("회"))) return null;
  const n = Number(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * (m[2] === "만" ? 10_000 : m[2] === "천" ? 1_000 : 1));
}

const SEPARATOR = /^\s*[-=_─━~*]{3,}\s*$/;
const TITLE = /^\s*(?:[^\p{L}\p{N}\s]\s*)*제목\s*(?:,\s*썸넬)?\s*[:：]?\s*(.*)$/u;
const SKIP = [/^\s*(?:[^\p{L}\p{N}\s]\s*)*썸넬/u, /^\s*(?:[^\p{L}\p{N}\s]\s*)*쇼츠\s*스크립트\s*$/u, /^\s*<[^>]{1,40}>\s*$/, /^\s*\[(?:음악|박수|웃음)\]\s*$/];

/** 같은 대본 비교용 (공백·기호 무시) */
export const scriptKey = (text: string) => text.replace(/[\s\p{P}\p{S}]/gu, "").slice(0, 300);

/**
 * 메모장 파일 → 대본 목록.
 * 나누는 기준: 구분선(---), 빈 줄 2개 이상, 조회수 줄(1.8만회), 새 "제목" 줄. 제목·조회수는 따로 뽑고 "썸넬"·"[음악]" 같은 줄은 뺀다.
 * 30자 미만 조각은 버리고, 같은 대본은 한 번만.
 */
export function parseScriptFile(raw: string): ScriptExample[] {
  const lines = raw.replace(/\r\n?/g, "\n").replace(/\u0000/g, "").split("\n");
  const out: ScriptExample[] = [];
  const seen = new Set<string>();
  let title = "";
  let views: number | null = null;
  let body: string[] = [];
  let blank = 0;
  let wantTitle = false;

  const flush = () => {
    const text = body.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    body = [];
    if (text.replace(/\s/g, "").length < 30) return false;
    const key = scriptKey(text);
    if (!seen.has(key)) {
      seen.add(key);
      out.push({ title: title.slice(0, SCRIPT_FORMAT_LIMITS.titleChars), views, text: text.slice(0, SCRIPT_FORMAT_LIMITS.exampleChars) });
    }
    title = "";
    views = null;
    return true;
  };
  const hasBody = () => body.some((l) => l.trim());

  for (const line of lines) {
    const t = line.trim();
    if (!t) {
      blank++;
      if (blank >= 2 && hasBody()) flush();
      else if (hasBody()) body.push("");
      continue;
    }
    blank = 0;
    if (SEPARATOR.test(t)) {
      if (hasBody()) flush();
      continue;
    }
    const v = parseViews(t);
    if (v != null) {
      if (hasBody()) flush();
      views = v;
      continue;
    }
    const tm = t.match(TITLE);
    if (tm) {
      if (hasBody()) flush();
      title = tm[1].trim();
      wantTitle = !title;
      continue;
    }
    if (SKIP.some((re) => re.test(t))) continue;
    if (wantTitle) {
      title = t;
      wantTitle = false;
      continue;
    }
    body.push(t.replace(/\[(?:음악|박수|웃음)\]/g, "").trim());
  }
  if (hasBody()) flush();
  return out;
}

/** 저장 전 정리: 빈 대본·중복 제거, 길이·개수 제한 */
export function cleanScriptExamples(value: unknown): ScriptExample[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: ScriptExample[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const text = String(r.text ?? "").replace(/\r\n?/g, "\n").replace(/\u0000/g, "").trim().slice(0, SCRIPT_FORMAT_LIMITS.exampleChars);
    if (!text) continue;
    const key = scriptKey(text);
    if (seen.has(key)) continue;
    seen.add(key);
    const views = r.views == null || r.views === "" ? null : Number(r.views);
    out.push({
      title: String(r.title ?? "").trim().slice(0, SCRIPT_FORMAT_LIMITS.titleChars),
      views: views != null && Number.isFinite(views) && views >= 0 ? Math.round(views) : null,
      text,
    });
    if (out.length >= SCRIPT_FORMAT_LIMITS.examples) break;
  }
  return out;
}

/** 생성할 때 같이 보낼 예시: 조회수가 높은 순, 짧게 */
export function promptExamples(examples: ScriptExample[]): ScriptExample[] {
  return [...examples]
    .sort((a, b) => (b.views ?? -1) - (a.views ?? -1))
    .slice(0, SCRIPT_FORMAT_LIMITS.promptExamples)
    .map((e) => ({ ...e, text: e.text.length > SCRIPT_FORMAT_LIMITS.promptExampleChars ? e.text.slice(0, SCRIPT_FORMAT_LIMITS.promptExampleChars) + "…" : e.text }));
}

/** 조회수 표시 (1.8만회) */
export function formatViews(n: number | null): string {
  if (n == null) return "";
  if (n >= 10_000) return `${Math.round(n / 1_000) / 10}만회`;
  if (n >= 1_000) return `${Math.round(n / 100) / 10}천회`;
  return `${n}회`;
}
