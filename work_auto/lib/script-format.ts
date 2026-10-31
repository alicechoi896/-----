/**
 * 대본 포맷 — 화면·서버가 같이 쓰는 규칙 (docs/SCRIPT_FORMATS.md)
 * - 메모장(.txt)에 여러 대본을 붙여 둔 파일을 대본 단위로 나눈다 (브라우저에서 읽고 서버로 파일을 올리지 않는다)
 */
import type { ScriptExample, ScriptFormatType } from "@/lib/types/script-format";

export const SCRIPT_FORMAT_LIMITS = {
  /** 포맷 하나에 넣는 참고 대본 수 (대본 내용이 있는 것) */
  examples: 30,
  /** 제목만 담은 참고 (트렌드·영상 검색에서 담은 제목, v0.9.50) */
  titleOnly: 300,
  /** 섬네일 제목 (v0.9.55) */
  thumbnailTitles: 300,
  thumbnailTitleChars: 60,
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

/** 제목만 담은 참고 (트렌드·영상 검색에서 [대본 포맷에 담기], v0.9.30): 제목 패턴으로만 쓰고 대본 구조 분석에는 빠진다 */
export const isTitleOnly = (e: ScriptExample) => !e.text.trim() && Boolean(e.title.trim());
/** 같은 참고인지 비교하는 키 (대본이 있으면 대본, 제목만이면 제목) */
export const exampleKey = (e: { title: string; text: string }) => (e.text.trim() ? scriptKey(e.text) : `t:${scriptKey(e.title)}`);

/** 저장 전 정리: 빈 대본·중복 제거, 길이·개수 제한 (대본 없이 제목만 있는 것도 남긴다) */
export function cleanScriptExamples(value: unknown): ScriptExample[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const out: ScriptExample[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const text = String(r.text ?? "").replace(/\r\n?/g, "\n").replace(/\u0000/g, "").trim().slice(0, SCRIPT_FORMAT_LIMITS.exampleChars);
    const title = String(r.title ?? "").replace(/\s+/g, " ").trim().slice(0, SCRIPT_FORMAT_LIMITS.titleChars);
    if (!text && !title) continue;
    const key = exampleKey({ title, text });
    if (seen.has(key)) continue;
    seen.add(key);
    const views = r.views == null || r.views === "" ? null : Number(r.views);
    out.push({
      title,
      views: views != null && Number.isFinite(views) && views >= 0 ? Math.round(views) : null,
      text,
    });
  }
  // 대본 있는 참고 30개 + 제목만 300개 (순서 유지)
  let scripts = 0;
  let titles = 0;
  return out.filter((e) => (e.text ? ++scripts <= SCRIPT_FORMAT_LIMITS.examples : ++titles <= SCRIPT_FORMAT_LIMITS.titleOnly));
}

/** 제목만 담은 참고 개수 */
export const titleOnlyCount = (examples: ScriptExample[]) => examples.filter((e) => !e.text.trim() && e.title.trim()).length;

/**
 * 포맷을 얼마나 따를지 (v0.9.65): 포맷에 담긴 항목(참고 대본·제목·Hook·CTA·섬네일 제목)이 100개 이상이면
 * 결과의 80% 이상을 포맷 구조 그대로 (단어만 이 제품·주제로), 그보다 적으면 50%.
 */
export const FORMAT_HEAVY_ITEMS = 100;
export function formatStrength(f: { examples?: ScriptExample[]; titlePatterns?: string[]; hooks?: string[]; ctas?: string[]; thumbnailTitles?: string[] } | null): { total: number; heavy: boolean; ratio: number } {
  if (!f) return { total: 0, heavy: false, ratio: 0 };
  const total = (f.examples?.length ?? 0) + (f.titlePatterns?.length ?? 0) + (f.hooks?.length ?? 0) + (f.ctas?.length ?? 0) + (f.thumbnailTitles?.length ?? 0);
  const heavy = total >= FORMAT_HEAVY_ITEMS;
  return { total, heavy, ratio: heavy ? 0.8 : 0.5 };
}

/** 무작위 n 개 (생성할 때마다 다른 표본) */
export function sampleList<T>(xs: T[], n: number): T[] {
  return xs.length <= n ? [...xs] : [...xs].sort(() => Math.random() - 0.5).slice(0, n);
}

/** 생성할 때 같이 보낼 예시: 조회수가 높은 순. 포맷이 크면(heavy) 5개·900자, 아니면 2개·500자 */
export function promptExamples(examples: ScriptExample[], heavy = false): ScriptExample[] {
  const n = heavy ? 5 : SCRIPT_FORMAT_LIMITS.promptExamples;
  const chars = heavy ? 900 : SCRIPT_FORMAT_LIMITS.promptExampleChars;
  return examples
    .filter((e) => e.text.trim())
    .sort((a, b) => (b.views ?? -1) - (a.views ?? -1))
    .slice(0, n)
    .map((e) => ({ ...e, text: e.text.length > chars ? e.text.slice(0, chars) + "…" : e.text }));
}

/** 제목 패턴 참고용: 조회수 높은 순 제목 최대 5개 */
export function promptTitles(examples: ScriptExample[], max = 20): string[] {
  // v0.9.50: 매번 같은 제목만 보내 같은 제목이 반복되던 문제 → 생성할 때마다 무작위로 고른다 (조회수 높은 제목은 조금 더 자주)
  const pool = examples.filter((e) => e.title.trim()).map((e) => ({ t: e.title.trim().slice(0, 80), w: Math.random() * (1 + Math.log10((e.views ?? 0) + 10) / 4) }));
  return pool.sort((a, b) => b.w - a.w).slice(0, max).map((x) => x.t);
}

/** 포맷의 제목 수 (제목 구성 비율을 정하는 기준) */
export const formatTitleCount = (examples: ScriptExample[]) => examples.filter((e) => e.title.trim()).length;

/**
 * 제목 후보 구성 (v0.9.50, 10개 기준). 포맷 제목이 100개 이하면 AI 4 · 포맷 4 · 트렌드 2, 넘으면 AI 2 · 포맷 7 · 트렌드 1.
 * 포맷·트렌드 제목이 없으면 그 몫은 AI 추천으로 돌린다. 다른 개수(예: 20개)는 비율대로 늘린다.
 */
export function titleMix(total: number, formatTitles: number, trendTitles: number): { ai: number; format: number; trend: number } {
  // v0.9.65: 포맷 제목이 100개를 넘으면 80% (AI 1 · 포맷 8 · 트렌드 1)
  const base = formatTitles > 100 ? { ai: 1, format: 8, trend: 1 } : { ai: 4, format: 4, trend: 2 };
  const scale = total / 10;
  let format = formatTitles ? Math.round(base.format * scale) : 0;
  let trend = trendTitles ? Math.round(base.trend * scale) : 0;
  format = Math.min(format, total);
  trend = Math.min(trend, total - format);
  return { ai: total - format - trend, format, trend };
}

/** 블로그 글: 대본은 없지만 대본 포맷의 '잘된 제목'을 제목 패턴으로 쓴다 */
export function blogTitleFormatTypeOf(featureId: string, input: Record<string, unknown>): ScriptFormatType | null {
  if (featureId === "blog-product-writing") return "product";
  if (featureId === "blog-info-writing") return "info";
  if (featureId === "blog-auto-writing") return input.productId ? "product" : "info";
  return null;
}

/** 조회수 표시 (1.8만회) */
export function formatViews(n: number | null): string {
  if (n == null) return "";
  if (n >= 10_000) return `${Math.round(n / 1_000) / 10}만회`;
  if (n >= 1_000) return `${Math.round(n / 100) / 10}천회`;
  return `${n}회`;
}

/**
 * 참고 대본의 말끝 분포 (v0.9.82) — 포맷이 '~요'를 거의 안 쓰는데 결과가 '~요'로 끝나던 문제.
 * 줄마다 마지막 낱말의 끝으로 나눈다: 요(해요체) · 니다(합니다체) · 다(반말 평서) · 음(음슴체·명사형) · 반말(~어·~지·~야…) · 기타(명사·물음표 등)
 */
export type EndingKind = "yo" | "nida" | "da" | "eum" | "banmal" | "other";
export const ENDING_LABEL: Record<EndingKind, string> = { yo: "'~요'", nida: "'~니다'", da: "'~다'(반말)", eum: "'~음/~함/~임'", banmal: "반말 '~어/~지/~야/~네/~거든'", other: "명사·물음표 등으로 끝" };

export function endingOf(line: string): EndingKind | null {
  const t = line.replace(/[\s.!?~…·"'”’)\]\-ㅋㅎ😀-🙏]+$/u, "").trim();
  if (!t) return null;
  if (/니다$/.test(t)) return "nida";
  if (/요$/.test(t)) return "yo";
  if (/(음|함|임|됨|짐|옴|봄|감)$/.test(t)) return "eum";
  if (/다$/.test(t)) return "da";
  if (/(어|아|지|야|네|게|거든|잖아|래|대|해|돼|까|봐|와|줘|라|자|해봐)$/.test(t)) return "banmal";
  return "other";
}

export function endingProfile(texts: string[]): { total: number; ratios: Record<EndingKind, number> } {
  const counts: Record<EndingKind, number> = { yo: 0, nida: 0, da: 0, eum: 0, banmal: 0, other: 0 };
  let total = 0;
  for (const text of texts)
    for (const line of text.split(/\n+|(?<=[.?!])\s+/)) {
      const k = endingOf(line);
      if (!k) continue;
      counts[k]++;
      total++;
    }
  const ratios = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, total ? v / total : 0])) as Record<EndingKind, number>;
  return { total, ratios };
}

/** 프롬프트에 넣을 말끝 규칙 (참고 줄이 10줄 미만이면 null) */
export function endingRule(texts: string[]): string | null {
  const { total, ratios } = endingProfile(texts);
  if (total < 10) return null;
  const pct = (k: EndingKind) => Math.round(ratios[k] * 100);
  const order = (Object.keys(ratios) as EndingKind[]).filter((k) => ratios[k] >= 0.05).sort((a, b) => ratios[b] - ratios[a]);
  const dist = order.map((k) => `${ENDING_LABEL[k]} ${pct(k)}%`).join(" · ");
  const lines = [`말끝 규칙 (가장 중요 — 스타일·기본 말투 규칙보다 우선): 참고 대본 문장 끝은 ${dist}. 대본의 문장 끝도 이 비율을 그대로 따른다.`];
  if (ratios.yo < 0.3) lines.push(`참고 대본은 '~요'로 거의 끝나지 않는다 (${pct("yo")}%). '~요'·'~거든요'·'~죠'로 끝나는 줄은 전체의 ${Math.max(0, pct("yo") + 5)}% 이하로만 쓴다.`);
  if (ratios.nida < 0.1) lines.push("'~니다'로 끝내지 않는다.");
  return lines.join(" ");
}

/** v0.9.90: 가이드라인에 사람이 직접 쓴 '~요 금지' (예: '요로 끝내지 않는다', '~요 금지', '반말로') */
export function guidelineBansYo(text: string): boolean {
  const t = text.replace(/\s+/g, " ");
  return /요\s*(?:로|으로)?\s*(?:끝|마무리)[^.\n]{0,15}(?:않|말|금지|x|X|❌|노)/.test(t) || /[~-]?요\s*(?:체|말투|어미)?\s*(?:금지|쓰지\s*않|쓰지\s*말|빼)/.test(t) || /반말\s*(?:로|으로|만|사용|쓴다|위주)/.test(t);
}

/** 대본 한 편에서 '~요'로 끝나는 줄 비율 */
export function yoRatio(script: string): number {
  const ks = script.split(/\n+/).map(endingOf).filter((k): k is EndingKind => Boolean(k));
  return ks.length ? ks.filter((k) => k === "yo").length / ks.length : 0;
}

/** 포맷의 말끝 목표: '~요' 최대 비율 + 프롬프트 규칙 (가이드라인 금지 > 참고 대본 분포) */
export function endingTarget(f: { examples?: { text: string }[]; guideline?: string; hooks?: string[]; ctas?: string[] } | null): { maxYo: number | null; rule: string | null } {
  if (!f) return { maxYo: null, rule: null };
  const texts = (f.examples ?? []).map((e) => e.text);
  const fromExamples = endingRule(texts);
  if (guidelineBansYo(f.guideline ?? "")) {
    return {
      maxYo: 0.05,
      rule: `말끝 규칙 (가장 중요 — 다른 모든 말투 규칙보다 우선): 대본 포맷 가이드라인에 따라 '~요'·'~거든요'·'~죠'·'~해요'로 끝나는 줄을 쓰지 않는다. 말끝은 참고 대본처럼 '~다'·반말·'~음'·명사로 끝낸다.${fromExamples ? ` ${fromExamples}` : ""}`,
    };
  }
  const { total, ratios } = endingProfile(texts);
  if (total >= 10 && ratios.yo < 0.3) return { maxYo: ratios.yo + 0.05, rule: fromExamples };
  return { maxYo: null, rule: fromExamples };
}
