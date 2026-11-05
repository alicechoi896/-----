import "server-only";
import { CLAUDE_ONLY_FEATURES, forcedAi, withClaude } from "../providers/ai-force";
import { NO_RATING_RULE, banmalRatio, endingTarget, followShare, wrapScript, yoRatio } from "@/lib/script-format";
import { findHonestyViolations } from "@/lib/domain/honesty";
import { APPENDABLE_KEYS, APPEND_MAX_ITEMS, mergeAppend } from "@/lib/generators/append";
import { findGeneratorConfig } from "@/lib/generators/configs";
import { findFeature } from "@/lib/registry";
import { isListFormat, type OutputSection } from "@/lib/generators/types";
import {
  TOP_TITLE_COUNT,
  scriptMetaKey,
  supportsPrecise,
  type PreciseQuality,
} from "@/lib/generators/quality";
import type { ChannelId, ContentWorkflow, ContextSummary, GenerateContentRequest, GeneratedContent, GeneratedValue, KeywordIntelligence } from "@/lib/types";
import { keywordIntelligence, pickSeed } from "./keyword-intelligence";
import { keywordLibrary } from "./keyword-library";
import { createId, nowIso } from "@/lib/utils";
import { buildGenerationContext } from "../ai/context-builder";
import { renderContentPrompt } from "../ai/prompts/render";
import { getPromptTemplate } from "../ai/prompts/templates";
import { requireAccess } from "../auth";
import { AppError } from "../http";
import { getAIProvider } from "../providers/registry";
import { getCurrentUserId, getRepositories } from "../repositories";
import { pruneContentHistory } from "./content-history";
import { productService } from "./products";

/**
 * 콘텐츠 생성 유스케이스 — 모든 생성형 기능이 이 함수 하나를 쓴다.
 *
 *  1. Generator Config 로 입력 검증
 *  2. ContextBuilder 로 AI Memory 조립
 *  3. 버전 관리되는 Prompt 템플릿으로 메시지 생성
 *  4. AIProvider.generateStructured 호출
 *  5. 결과 정규화 + 정직성 검사
 *  6. 생성 이력 저장 (promptVersion, provider, model, context 요약 포함)
 */
/** 출력 형식 강제: 목록·태그는 문자열 배열, 텍스트는 문자열 (Claude structured outputs) */
function outputSchema(outputs: OutputSection[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: outputs.map((o) => o.key),
    properties: Object.fromEntries(
      outputs.map((o) => [
        o.key,
        isListFormat(o.format)
          ? { type: "array", items: { type: "string" }, description: `${o.label}${o.count ? ` (${o.count}개)` : ""}` }
          : { type: "string", description: o.label },
      ]),
    ),
  };
}

/** AI 응답 → 저장 형식 (목록은 배열, 텍스트는 문자열) */
function normalizeOutput(outputs: OutputSection[], data: Record<string, unknown>): Record<string, GeneratedValue> {
  const output: Record<string, GeneratedValue> = {};
  for (const section of outputs) {
    const raw = data[section.key];
    const isList = isListFormat(section.format);
    output[section.key] = isList
      ? Array.isArray(raw)
        ? raw.map(String)
        : raw
          ? [String(raw)]
          : []
      : Array.isArray(raw)
        ? raw.join("\n")
        : String(raw ?? "");
  }
  return output;
}

/** 다시 만들 때 함께 바꾸는 항목: 블로그 본문을 바꾸면 소제목도 본문에 맞게 */
const LINKED_SECTIONS: Record<string, string[]> = { body: ["headings"] };

type Prepared = Awaited<ReturnType<typeof prepare>>;

/** 1)~2) 입력 검증 + Context (빠른·정밀 공통) */
async function prepare({ featureId, input }: GenerateContentRequest) {
  const feature = findFeature(featureId);
  const config = findGeneratorConfig(featureId);
  if (!feature || !config) throw new AppError("UNKNOWN_FEATURE", "생성 기능을 찾을 수 없습니다.", 404);
  if (feature.channelId === "settings") throw new AppError("UNKNOWN_FEATURE", "생성 기능이 아닙니다.", 400);
  const channelId = feature.channelId as ChannelId;

  // 1) 입력 검증
  for (const field of config.fields) {
    if (field.type === "images") {
      // 사진은 브라우저에만 있고, 서버에는 "사진 n: 설명" 목록만 온다
      const raw = Array.isArray(input[field.name]) ? (input[field.name] as unknown[]) : [];
      input[field.name] = raw.slice(0, 10).map((c, i) => `사진${i + 1}: ${String(c ?? "").trim().slice(0, 80) || "제품 사진"}`);
    }
    const v = input[field.name];
    const empty = v == null || v === "" || (Array.isArray(v) && v.length === 0);
    if (field.required && empty) throw new AppError("VALIDATION", `${field.label}을(를) 입력해 주세요.`);
  }

  const userId = await getCurrentUserId();

  // 2) Context
  const context = await buildGenerationContext({ userId, featureId, channelId, config, input });
  const template = getPromptTemplate(config.promptId);
  return { feature, config, channelId, userId, featureId, input, context, template };
}

/** 5)~6) 정직성 검사 + 저장 (빠른·정밀 공통) */
/** 사용자가 넣은 주요 키워드 (주요 키워드·메인·서브 키워드, 순서 유지·중복 제거) */
function userKeywords(input: Record<string, unknown>): string[] {
  const raw = [input.mainKeyword, ...(Array.isArray(input.keywords) ? input.keywords : [input.keywords]), ...(Array.isArray(input.subKeywords) ? input.subKeywords : [])];
  return dedupeKeywords(raw.map((x) => String(x ?? "")));
}
const kwKey = (s: string) => s.replace(/^#/, "").replace(/\s+/g, "").toLowerCase();
function dedupeKeywords(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const k = raw.replace(/\s+/g, " ").trim();
    if (k.replace(/^#/, "").length < 2 || seen.has(kwKey(k))) continue;
    seen.add(kwKey(k));
    out.push(k);
  }
  return out;
}
/** 키워드 30개·태그·해시태그에 주요 키워드를 모두 포함 (v0.9.46: 여러 개 넣어도 하나만 반영되던 문제) */
/** 설명글에서 '이 설명은 ~입니다', '핵심 요약:' 같은 안내·항목 이름을 지운다 (설명란에 바로 붙여 넣게, v0.9.50) */
export function cleanDescription(text: string): string {
  const LABEL = /^\s*(?:[#*■▶●\-•]+\s*)?(?:\[?(?:설명글|영상 설명|핵심 요약|요약|주요 내용|추천 대상|확인할 점|마무리 안내|마무리|CTA|행동 유도)\]?)\s*[:：]\s*/;
  return text
    .split("\n")
    .filter((l) => !/^\s*\(?\s*(?:이|본|아래)\s*(?:설명|설명글|글)(?:은|는|란은)\s.*(?:입니다|이에요|예요)[.\s)]*$/.test(l))
    .map((l) => l.replace(LABEL, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function mergeUserKeywords(config: Prepared["config"], input: Record<string, unknown>, output: Record<string, GeneratedValue>) {
  const mine = userKeywords(input);
  for (const sec of config.outputs) {
    const v = output[sec.key];
    if (!Array.isArray(v)) continue;
    if (sec.key === "keywords") output.keywords = dedupeKeywords([...mine, ...v]).slice(0, Math.max(30, sec.count ?? 30));
    else if (sec.key === "tags") output.tags = dedupeKeywords([...mine, ...v]).slice(0, sec.count ?? 30);
    else if (sec.key === "hashtags") output.hashtags = dedupeKeywords([...mine.map((k) => `#${k.replace(/\s+/g, "")}`), ...v]).slice(0, sec.count ?? 8);
  }
}

/**
 * v0.9.90: 대본 포맷의 말끝을 어겼으면(예: 포맷은 '~요'를 거의 안 쓰는데 결과는 '~요' 투성이) 내용은 그대로 두고 말끝만 고친다 (AI 1회, 어겼을 때만).
 * 실패해도 원래 결과를 그대로 쓴다.
 */
async function enforceEndings(p: Prepared, output: Record<string, GeneratedValue>): Promise<void> {
  const ctx = p.context;
  if (!ctx.scriptFormat || ctx.scriptFormatUse !== "full" || !Array.isArray(output.script)) return;
  const target = endingTarget(ctx.scriptFormat);
  if ((target.maxYo === null && target.maxBanmal === null) || !target.rule) return;
  const scripts = output.script as string[];
  // v0.9.125: '~요'가 너무 많거나, 참고 대본에 없는 반말이 섞였으면 말끝만 고친다
  const over = (s: string) => (target.maxYo !== null && yoRatio(s) > target.maxYo + 0.1) || (target.maxBanmal !== null && banmalRatio(s) > target.maxBanmal + 0.1);
  const bad = scripts.map((s, i) => ({ s, i, r: yoRatio(s), b: banmalRatio(s) })).filter((x) => over(x.s));
  if (!bad.length) return;
  try {
    const ai = await getAIProvider();
    const ex = (ctx.scriptFormat.examples ?? []).slice(0, 2).map((e) => e.text.slice(0, 400));
    const r = await ai.generateStructured<{ script?: unknown }>({
      task: "content:script-endings",
      messages: [
        { role: "system", content: "당신은 한국어 쇼츠 대본 편집자다. 내용·순서·줄 수·줄바꿈은 그대로 두고 문장 끝(말끝)만 규칙에 맞게 고친다. JSON 으로만 답한다." },
        {
          role: "user",
          content: [
            target.rule,
            ex.length ? `[참고 대본 말투]\n${ex.join("\n---\n")}` : "",
            `[고칠 대본 ${bad.length}편] (배열 순서 그대로, 각 편은 줄바꿈 유지)`,
            JSON.stringify(bad.map((b) => b.s)),
            '형식: {"script":["고친 대본 1", …]}',
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
      outputKeys: ["script"],
      jsonSchema: { type: "object", additionalProperties: false, required: ["script"], properties: { script: { type: "array", items: { type: "string" } } } },
      variables: { scripts: bad.map((b) => b.s) },
    });
    const fixed = Array.isArray(r.data.script) ? (r.data.script as unknown[]).map((x) => String(x ?? "")) : [];
    let n = 0;
    bad.forEach((b, k) => {
      const f = fixed[k]?.trim();
      // 줄 수가 크게 달라지면(내용을 바꿨으면) 쓰지 않는다
      if (!f || Math.abs(f.split(/\n+/).length - b.s.split(/\n+/).length) > 2 || (yoRatio(f) > b.r && b.r > 0) || over(f) && yoRatio(f) >= b.r && banmalRatio(f) >= b.b) return;
      scripts[b.i] = f;
      n++;
    });
    if (n) ctx.summary.notes.push(`대본 포맷 말끝에 맞춰 대본 ${n}편의 말끝을 고쳤습니다 ('~요'·반말 줄 줄임).`);
  } catch {
    /* 원래 결과 그대로 */
  }
}

/** v0.9.174 YouTube 제품 홍보 영상(·자동 제작) 대본: 10자 넘는 줄은 띄어쓰기에서 나눈다 (낱말 중간은 안 끊음) */
const WRAP_FEATURES = new Set(["yt-product-video"]);
function wrapScriptLines(featureId: string, output: Record<string, GeneratedValue>): void {
  if (!WRAP_FEATURES.has(featureId) || !Array.isArray(output.script)) return;
  output.script = (output.script as string[]).map((t) => wrapScript(String(t)));
}

async function finish(
  p: Prepared,
  output: Record<string, GeneratedValue>,
  ai: { provider: string; model: string },
  extra: { headline?: string; quality?: PreciseQuality; workflow?: ContentWorkflow; keywordIntel?: KeywordIntelligence | null } = {},
): Promise<GeneratedContent> {
  const { feature, config, featureId, channelId, userId, input, context, template } = p;
  mergeUserKeywords(config, input, output);
  await enforceEndings(p, output);
  wrapScriptLines(featureId, output);
  if (typeof output.description === "string") output.description = cleanDescription(output.description);
  if (context.honestyGuard) {
    const violations = findHonestyViolations(JSON.stringify(output));
    if (violations.length) context.summary.notes.push(`정직성 검사 경고: "${violations.join('", "')}" 표현 확인 필요`);
  }
  const headlineValue = output[config.headlineKey];
  const headline = extra.headline || (Array.isArray(headlineValue) ? headlineValue[0] : headlineValue) || feature.title;
  const summary: ContextSummary = {
    ...context.summary,
    ...(extra.quality ? { quality: extra.quality } : {}),
    ...(extra.workflow ? { workflow: extra.workflow } : {}),
    ...(extra.keywordIntel ? { keywordIntel: compactIntel(extra.keywordIntel) } : {}),
  };
  const content: GeneratedContent = {
    id: createId("cnt"),
    userId,
    projectId: null,
    featureId,
    channelId,
    productId: context.product?.product.id ?? null,
    input,
    output,
    headline,
    promptId: template.id,
    promptVersion: template.version,
    provider: ai.provider,
    model: ai.model,
    context: summary,
    isExemplar: false,
    rating: null,
    createdAt: nowIso(),
  };
  await getRepositories().contents.insert(content);
  if (context.product) await productService.touch(context.product.product.id);
  await pruneContentHistory(userId).catch(() => 0); // 오래된 이력 정리 (실패해도 생성은 성공)
  return content;
}

const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/** 1단계에 만드는 항목 (나머지는 2단계) */
export const STAGE1_KEYS = new Set(["topics", "titles", "hooks", "ctas"]);
/** 2단계 생성을 쓰는 기능: 영상·클립 (대본·제목·Hook 이 있는 것) */
export const isTwoStage = (outputs: OutputSection[]) => supportsPrecise(outputs);

/** 저장용 Keyword Intelligence (후보 15개·근거만) */
function compactIntel(k: KeywordIntelligence): KeywordIntelligence {
  return { ...k, candidates: k.candidates.slice(0, 15) };
}

/** 생성 직전 Keyword Intelligence (기능별 Seed 1개, 플랫폼 호출은 여기서만) */
async function collectIntel(p: Prepared, requestId?: string): Promise<KeywordIntelligence> {
  const seed = pickSeed(p.featureId, p.input, {
    productName: p.context.product?.product.name ?? null,
    trendTitle: p.context.trend?.title ?? null,
    category: typeof p.input.category === "string" ? p.input.category : null,
  });
  const intel = await keywordIntelligence.collect({ userId: p.userId, featureId: p.featureId, seed, requestId });
  // 키워드 관리 자동 수집: 실제 영상·글에서 반복된 키워드 후보 → 이 제품과 연결 (추가 호출 0)
  if (intel.candidates.length)
    await keywordLibrary.ingestQuietly(intel.candidates.slice(0, 10).map((c) => ({ keyword: c.keyword, origin: "keyword-intel" as const, productId: p.context.product?.product.id ?? null })), p.userId);
  return intel;
}
const listOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** v0.9.157 [이 요청을 포맷 규칙으로 저장]: 이 원고가 쓴 대본 포맷 가이드라인 끝 '사용자 요청 규칙'에 한 줄 더한다 */
export async function saveRequestAsRule(contentId: string, text: unknown): Promise<{ formatName: string; added: boolean }> {
  const rule = String(text ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
  if (!rule) throw new AppError("VALIDATION", "저장할 요청이 없습니다.");
  const userId = await getCurrentUserId();
  const content = await getRepositories().contents.get(contentId);
  if (!content || content.userId !== userId) throw new AppError("NOT_FOUND", "콘텐츠를 찾을 수 없습니다.", 404);
  const formatId = content.context.scriptFormat?.id;
  if (!formatId || formatId.includes("+")) throw new AppError("VALIDATION", "이 원고는 대본 포맷 하나를 쓰지 않아 저장할 곳이 없습니다.");
  const { scriptFormatService } = await import("./script-formats");
  const f = (await scriptFormatService.list()).find((x) => x.id === formatId);
  if (!f) throw new AppError("NOT_FOUND", "대본 포맷을 찾을 수 없습니다.", 404);
  const HEAD = "[사용자 요청 규칙]";
  const line = `- ${rule}`;
  if (f.guideline.includes(line)) return { formatName: f.name, added: false };
  const guideline = f.guideline.includes(HEAD) ? `${f.guideline.trimEnd()}\n${line}` : `${f.guideline.trimEnd()}\n\n${HEAD}\n${line}`.trim();
  await scriptFormatService.update(f.id, { ...f, guideline: guideline.slice(0, 8000) });
  return { formatName: f.name, added: true };
}

/** v0.9.164 [왜?] AI 가 적은 후보별 이유 (후보 문장 → 이유, 60자) */
export function pickWhy(raw: unknown, candidates: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of Array.isArray(raw) ? raw : []) {
    const cand = candidates[Number((r as { index?: unknown })?.index) - 1];
    const why = String((r as { why?: unknown })?.why ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
    if (cand && why) out[cand] = why;
  }
  return out;
}

/** v0.9.153 AI 가 적은 "이 후보는 포맷의 어느 문장을 따랐다" — 포맷 원문에 실제로 있는 것만 남긴다 (후보 문장 → 포맷 원문) */
export function pickRefs(raw: unknown, candidates: string[], formatList: string[]): Record<string, string> {
  const norm = (x: string) => x.replace(/\s+/g, "").trim();
  const byNorm = new Map(formatList.map((t) => [norm(t), t]));
  const out: Record<string, string> = {};
  for (const r of Array.isArray(raw) ? raw : []) {
    const cand = candidates[Number((r as { index?: unknown })?.index) - 1];
    const model = byNorm.get(norm(String((r as { model?: unknown })?.model ?? "")));
    if (cand && model && norm(cand) !== norm(model)) out[cand] = model;
  }
  return out;
}

export const contentGenerationService = {
  /** 한 번에 생성 (블로그·예전 방식). 블로그는 생성 직전에 NAVER Keyword Intelligence 를 모아 넣는다 */
  async generate(req: GenerateContentRequest & { clientRequestId?: string }): Promise<GeneratedContent> {
    if (CLAUDE_ONLY_FEATURES.has(String(req.featureId)) && !forcedAi()) return withClaude(() => this.generate(req));
    const p = await prepare(req);
    const intel = p.featureId.startsWith("blog-") ? await collectIntel(p, req.clientRequestId) : null;
    if (intel) {
      p.context.keywordIntel = intel;
      if (intel.note) p.context.summary.notes.push(intel.note);
    }
    // 3) Prompt → 4) AI 호출
    const messages = renderContentPrompt(p.template, p.config, p.input, p.context);
    const ai = await getAIProvider();
    const result = await ai.generateStructured<Record<string, unknown>>({
      task: `content:${p.featureId}`,
      messages,
      outputKeys: p.config.outputs.map((o) => o.key),
      jsonSchema: outputSchema(p.config.outputs),
      variables: { featureId: p.featureId, outputs: p.config.outputs, input: p.input, context: p.context },
    });
    return finish(p, normalizeOutput(p.config.outputs, result.data), result, intel ? { keywordIntel: intel } : {});
  },

  /**
   * 1단계 (영상·클립): Keyword Intelligence → 제목·Hook·CTA 후보 (+ 정보성은 추천 주제). 대본·설명·태그는 아직 만들지 않는다.
   * 플랫폼 API 는 여기서만 (YouTube search 1 + videos 1 / NAVER 블로그 검색 1 + 데이터랩 1). docs/TWO_STAGE_CONTENT_GENERATION.md
   */
  async stage1(req: GenerateContentRequest & { clientRequestId?: string }): Promise<GeneratedContent> {
    if (CLAUDE_ONLY_FEATURES.has(String(req.featureId)) && !forcedAi()) return withClaude(() => this.stage1(req));
    const p = await prepare(req);
    if (!isTwoStage(p.config.outputs)) throw new AppError("VALIDATION", "2단계 생성은 영상·클립 원고에서만 씁니다.");
    const intel = await collectIntel(p, req.clientRequestId);
    p.context.keywordIntel = intel;
    if (intel.note) p.context.summary.notes.push(intel.note);
    const outputs = p.config.outputs.filter((o) => STAGE1_KEYS.has(o.key));
    const messages = renderContentPrompt(p.template, { ...p.config, outputs }, p.input, p.context);
    // v0.9.153: 대본 포맷이 있으면 제목·Hook 은 포맷 구조가 먼저 (마지막 지시가 가장 세게 먹어서, 여기서 다시 못 박는다)
    const f = p.context.scriptFormat;
    const fTitles = f ? [...new Set([...f.examples.map((e) => e.title.trim()).filter(Boolean), ...(f.titlePatterns ?? [])])] : [];
    const fHooks = f?.hooks ?? [];
    const share = Math.round(followShare(f) * 100);
    const titleCount = outputs.find((o) => o.key === "titles")?.count ?? 10;
    const hookCount = outputs.find((o) => o.key === "hooks")?.count ?? 5;
    messages.push({
      role: "user",
      content: [
        "[1단계] 제목 후보·Hook 후보·CTA 후보만 만든다. 대본·설명·키워드·태그는 아직 쓰지 않는다 (사용자가 제목을 고른 뒤 2단계에서 만든다).",
        fTitles.length
          ? `제목: ${titleCount}개 중 ${Math.round((titleCount * share) / 100)}개 이상은 [대본 포맷 > 잘된 제목] 중 하나를 골라 그 구조·어순·길이·말투를 그대로 두고 제품·주제·숫자 단어만 바꾼다 (사용자가 원본과 나란히 놓고 봐도 같은 틀이라고 느낄 만큼). Keyword Intelligence 표현은 그 틀의 빈칸에 넣는 단어로만 쓴다. 나머지만 새 방식으로 쓰고, 서로 다른 약속(구매 판단·기능·비교·후회 방지 등)을 하게 만든다.`
          : "제목은 Keyword Intelligence 의 실제 표현과 제품·주제의 사실을 활용하고, 서로 다른 약속(구매 판단·기능·비교·후회 방지 등)을 하게 만든다.",
        fHooks.length
          ? `Hook: 영상 첫 3초에 말하는 문장이다. ${hookCount}개 중 ${Math.round((hookCount * share) / 100)}개 이상은 [대본 포맷 > Hook] 중 하나의 문장 구조·길이·말끝을 그대로 두고 내용 단어만 바꾼다.`
          : "",
        fTitles.length || fHooks.length
          ? "format_refs 에 따라 쓴 것을 적는다: titles·hooks 각각 {index: 1부터 센 번호, model: 따라 한 포맷 원문 그대로}. 포맷을 따르지 않은 후보는 적지 않는다. 원문에 없는 문장을 model 로 쓰지 않는다."
          : "",
        "제목을 다 쓴 뒤 클릭률이 가장 높을 5개를 골라 title_top 에 1부터 센 번호와 이유를 쓴다.",
        "reasons 에 후보마다 왜 이렇게 썼는지 한 줄(40자 안쪽)을 적는다: titles·hooks·ctas 각각 {index: 1부터 센 번호, why: 노린 구조·심리 + 근거(포맷·제품 사실·키워드)}. 예: '숫자 약속 + 구매 직전 고민 — 구매 포인트 380g'.",
      ].filter(Boolean).join("\n"),
    });
    const ai = await getAIProvider();
    const schema = outputSchema(outputs) as { properties: Record<string, unknown>; required: string[] };
    schema.properties.title_top = {
      type: "array",
      description: "추천 제목 5개 (titles 의 1부터 센 번호)",
      items: { type: "object", additionalProperties: false, required: ["index", "reason"], properties: { index: { type: "integer" }, reason: { type: "string" } } },
    };
    schema.required = [...schema.required, "title_top"];
    const refItem = { type: "array", items: { type: "object", additionalProperties: false, required: ["index", "model"], properties: { index: { type: "integer" }, model: { type: "string" } } } };
    const whyItem = { type: "array", items: { type: "object", additionalProperties: false, required: ["index", "why"], properties: { index: { type: "integer" }, why: { type: "string" } } } };
    schema.properties.reasons = { type: "object", additionalProperties: false, required: ["titles", "hooks", "ctas"], properties: { titles: whyItem, hooks: whyItem, ctas: whyItem } };
    schema.required = [...schema.required, "reasons"];
    if (fTitles.length || fHooks.length) {
      schema.properties.format_refs = { type: "object", additionalProperties: false, required: ["titles", "hooks"], properties: { titles: refItem, hooks: refItem } };
      schema.required = [...schema.required, "format_refs"];
    }
    const result = await ai.generateStructured<Record<string, unknown>>({
      task: `content-stage1:${p.featureId}`,
      messages,
      outputKeys: [...outputs.map((o) => o.key), "title_top"],
      jsonSchema: schema,
      variables: { featureId: p.featureId, outputs, input: p.input, context: p.context },
    });
    const output = normalizeOutput(outputs, result.data);
    const titles = Array.isArray(output.titles) ? output.titles : [];
    const titleTop = listOf(result.data.title_top)
      .map((t) => ({ title: titles[Number((t as { index?: unknown })?.index) - 1] ?? "", reason: str((t as { reason?: unknown })?.reason, 200) }))
      .filter((t, i, arr) => t.title && arr.findIndex((x) => x.title === t.title) === i)
      .slice(0, TOP_TITLE_COUNT);
    const refs = (result.data.format_refs ?? {}) as { titles?: unknown; hooks?: unknown };
    const formatRefs = {
      titles: pickRefs(refs.titles, titles, fTitles),
      hooks: pickRefs(refs.hooks, Array.isArray(output.hooks) ? output.hooks : [], fHooks),
    };
    const rs = (result.data.reasons ?? {}) as Record<string, unknown>;
    const reasons = {
      titles: pickWhy(rs.titles, titles),
      hooks: pickWhy(rs.hooks, Array.isArray(output.hooks) ? output.hooks : []),
      ctas: pickWhy(rs.ctas, Array.isArray(output.ctas) ? output.ctas : []),
    };
    console.info("[Stage1] format follow", JSON.stringify({ format: f?.name ?? null, titles: `${Object.keys(formatRefs.titles).length}/${titles.length}`, hooks: `${Object.keys(formatRefs.hooks).length}/${Array.isArray(output.hooks) ? output.hooks.length : 0}` }));
    const workflow: ContentWorkflow = { id: createId("wf"), stage: 1, keywordIntelligence: compactIntel(intel) };
    return finish(p, output, result, { quality: { mode: "precise", angles: [], titleTop, scripts: [], formatRefs, reasons }, workflow });
  },

  /**
   * 2단계: 1단계에서 고른 제목 1개(+ Hook·CTA) → 대본 3편·최종 키워드·태그(해시태그)·설명. 제목마다 1번씩 부른다 (AI 1회).
   * 플랫폼 API 는 다시 부르지 않고 1단계의 Keyword Intelligence 를 쓴다.
   */
  async stage2(input: { stage1Id?: unknown; title?: unknown; hook?: unknown; cta?: unknown }): Promise<GeneratedContent> {
    const repo = getRepositories();
    const userId = await getCurrentUserId();
    const s1 = await repo.contents.get(String(input.stage1Id ?? ""));
    if (s1 && CLAUDE_ONLY_FEATURES.has(s1.featureId) && !forcedAi()) return withClaude(() => this.stage2(input));
    if (!s1 || s1.userId !== userId || s1.context.workflow?.stage !== 1) throw new AppError("NOT_FOUND", "1단계 결과를 찾을 수 없습니다.", 404);
    const title = str(input.title, 200);
    const hook = str(input.hook, 300);
    const cta = str(input.cta, 300);
    if (!title) throw new AppError("VALIDATION", "제목을 골라 주세요.");
    const p = await prepare({ featureId: s1.featureId, input: { ...s1.input } });
    const intel = s1.context.workflow.keywordIntelligence ?? null;
    p.context.keywordIntel = intel;
    const outputs = p.config.outputs.filter((o) => !STAGE1_KEYS.has(o.key));
    const messages = renderContentPrompt(p.template, { ...p.config, outputs }, p.input, p.context);
    const tagKey = outputs.some((o) => o.key === "tags") ? "tags" : outputs.some((o) => o.key === "hashtags") ? "hashtags" : null;
    const isInfo = p.featureId.includes("info");
    const hasFormat = Boolean(p.context.scriptFormat && p.context.scriptFormatUse === "full");
    messages.push({
      role: "user",
      content: [
        "[2단계] 사용자가 고른 아래 제목·Hook·CTA 로 만든다. 제목·Hook·CTA 는 바꾸지 않는다 (문장 연결을 위해 아주 조금 다듬는 것만 허용).",
        `[선택한 제목] ${title}`,
        `[선택한 Hook] ${hook || "(없음 — 제목에 맞는 Hook 을 첫 줄로)"}`,
        `[선택한 CTA] ${cta || "(없음 — 자연스러운 마무리)"}`,
        "규칙:",
        "1. 대본 3편은 모두 이 제목의 약속을 실제로 전달한다 (예: '3가지'면 대본 안에 실제 3가지, '카메라가 달라진 이유'면 카메라가 중심).",
        "2. 대본 3편의 첫 줄은 선택한 Hook(또는 그 변형), 마지막은 선택한 CTA 로 끝낸다.",
        hasFormat
          ? "3. 3편 모두 [대본 포맷]의 가이드라인 단계 순서와 참고 대본의 구조·문장 길이·리듬·연결어를 따른다 (사용자가 참고 대본과 나란히 봐도 같은 틀). 편마다 강조 포인트·장면·예시만 다르게 한다. 새 구조를 만들지 않는다. script_structures 에 각 편이 따른 포맷 단계 흐름을 짧게 쓴다."
          : isInfo
            ? "3. 3편은 설득 구조가 다르다: ① 가장 중요한 정보부터 ② 궁금증·반전형 ③ 체크리스트·정리형. script_structures 에 각 편의 구조 이름을 쓴다."
            : "3. 3편은 설득 구조가 다르다: ① 문제 해결형 ② 핵심 장점·결론 먼저 ③ 비교·구매 판단형. script_structures 에 각 편의 구조 이름을 쓴다.",
        "4. primary_keyword 는 이 제목의 검색 의도에 맞는 핵심 키워드 1개, related_keywords 는 제목·대본 방향에 맞는 관련 키워드(검색 의도 intent: purchase·info·compare·review·howto 중 하나). Keyword Intelligence 의 실제 표현을 우선 쓰고, 제목과 관계없는 키워드는 넣지 않는다. 사용자가 주요 키워드를 여러 개 넣었으면 그 키워드를 모두 포함하고 각각에서 파생된 키워드를 고르게 섞어 related_keywords 를 20~29개 만든다.",
        tagKey ? `5. ${tagKey} 는 최종 키워드(primary_keyword + related_keywords)에서 만든다. 중복·의미 없는 일반 단어는 뺀다.` : "",
        "6. 설명(description)은 이 제목과 대본에 실제로 나온 내용만 쓴다. 제품 스펙은 [제품 정보] 범위 안에서만.",
        "8. script_reasons 에 대본 편마다, thumb_reasons 에 섬네일 제목 후보마다(index 1부터) 왜 이렇게 썼는지 한 줄(40자 안쪽, 노린 것 + 근거)을 적는다.",
        isInfo ? "" : `7. ${NO_RATING_RULE}`,
      ]
        .filter(Boolean)
        .join("\n"),
    });
    const schema = outputSchema(outputs) as { properties: Record<string, unknown>; required: string[] };
    schema.properties.primary_keyword = { type: "string" };
    schema.properties.related_keywords = {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["keyword", "intent"], properties: { keyword: { type: "string" }, intent: { type: "string" } } },
    };
    schema.properties.script_structures = { type: "array", items: { type: "string" }, description: "대본 3편 각각의 설득 구조 이름" };
    // v0.9.164 [왜?] 대본·섬네일 제목 후보마다 이유 한 줄
    schema.properties.script_reasons = { type: "array", items: { type: "string" }, description: "대본 편마다 왜 이렇게 썼는지 한 줄 (40자 안쪽, 노린 것 + 근거)" };
    const hasThumbs = outputs.some((o) => o.key === "thumbnailTitles");
    if (hasThumbs) schema.properties.thumb_reasons = { type: "array", items: { type: "object", additionalProperties: false, required: ["index", "why"], properties: { index: { type: "integer" }, why: { type: "string" } } } };
    schema.required = [...schema.required, "primary_keyword", "related_keywords", "script_structures", "script_reasons", ...(hasThumbs ? ["thumb_reasons"] : [])];
    const ai = await getAIProvider();
    const result = await ai.generateStructured<Record<string, unknown>>({
      task: `content-stage2:${p.featureId}`,
      messages,
      outputKeys: [...outputs.map((o) => o.key), "primary_keyword", "related_keywords", "script_structures"],
      jsonSchema: schema,
      variables: { featureId: p.featureId, outputs, input: p.input, context: p.context, selected: { title, hook, cta } },
    });
    const output = normalizeOutput(outputs, result.data);
    const primaryKeyword = str(result.data.primary_keyword, 60);
    const relatedKeywords = listOf(result.data.related_keywords)
      .map((r) => ({ keyword: str((r as { keyword?: unknown })?.keyword, 60), intent: str((r as { intent?: unknown })?.intent, 20) || "info" }))
      .filter((r, i, arr) => r.keyword && r.keyword !== primaryKeyword && arr.findIndex((x) => x.keyword === r.keyword) === i)
      .slice(0, 29);
    // 키워드 칸 = 최종 키워드 (제목 기준), 태그는 중복 제거
    // 핵심 → 주요 키워드(사용자) → 관련 키워드 → AI 키워드 순서로 최대 30개 (finish 에서 한 번 더 정리)
    if (outputs.some((o) => o.key === "keywords"))
      output.keywords = dedupeKeywords([primaryKeyword, ...userKeywords(p.input), ...relatedKeywords.map((r) => r.keyword), ...(Array.isArray(output.keywords) ? output.keywords : [])]).slice(0, 30);
    if (tagKey && Array.isArray(output[tagKey])) output[tagKey] = [...new Set((output[tagKey] as string[]).map((t) => t.trim()).filter((t) => t.replace(/^#/, "").length >= 2))];
    const scripts = Array.isArray(output.script) ? output.script : [];
    const structures = listOf(result.data.script_structures).map((x) => str(x, 30));
    const quality: PreciseQuality = {
      mode: "precise",
      angles: [],
      titleTop: [],
      scripts: scripts.map((s, i) => ({ key: scriptMetaKey(s), angle: structures[i] ?? "", checks: { hook: true, openLoop: true, answer: true }, review: "" })),
    };
    // [왜?] 1단계에서 고른 제목·Hook·CTA 의 이유도 이어서 (2단계 결과 화면에서 보이게)
    const r1 = s1.context.quality?.reasons ?? {};
    const scriptWhy = listOf(result.data.script_reasons).map((x) => str(x, 80));
    quality.reasons = {
      titles: r1.titles?.[title] ? { [title]: r1.titles[title] } : {},
      hooks: hook && r1.hooks?.[hook] ? { [hook]: r1.hooks[hook] } : {},
      ctas: cta && r1.ctas?.[cta] ? { [cta]: r1.ctas[cta] } : {},
      script: Object.fromEntries(scripts.map((t, i) => [t, scriptWhy[i] ?? ""]).filter(([, w]) => w)),
      thumbnailTitles: pickWhy(result.data.thumb_reasons, Array.isArray(output.thumbnailTitles) ? output.thumbnailTitles.map(String) : []),
    };
    const workflow: ContentWorkflow = { id: s1.context.workflow.id, stage: 2, stage1Id: s1.id, selected: { title, hook, cta }, primaryKeyword, relatedKeywords };
    return finish(p, output, result, { headline: title, quality, workflow });
  },

  /**
   * 결과의 한 항목만 새로 만든다 (AI 호출 1회).
   * - 후보 목록(제목·Hook·CTA·키워드·태그·해시태그, `APPENDABLE_KEYS`): **추가 만들기** — 지금 목록과 겹치지 않는 새 후보를
   *   목록 위에 더한다. 직접 수정본·체크한 후보·대표 제목은 그대로 둔다
   * - 글(대본·설명글·본문 …): **다시 만들기** — 다른 내용으로 바꾼다 (블로그 본문은 소제목도 함께)
   * - 같은 입력·Context 로 다시 조립한다 (스타일 표본은 새로 뽑힌다)
   */
  async regenerateSection(contentId: string, key: string, request?: string): Promise<GeneratedContent> {
    const ask = String(request ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
    const repo = getRepositories();
    const userId = await getCurrentUserId();
    const content = await repo.contents.get(contentId);
    if (!content || content.userId !== userId) throw new AppError("NOT_FOUND", "콘텐츠를 찾을 수 없습니다.", 404);
    const config = findGeneratorConfig(content.featureId);
    if (!config) throw new AppError("UNKNOWN_FEATURE", "생성 기능을 찾을 수 없습니다.", 404);
    await requireAccess(content.featureId); // 생성 기능 등급 권한
    const keys = [key, ...(LINKED_SECTIONS[key] ?? [])];
    const sections = config.outputs.filter((o) => keys.includes(o.key));
    if (!sections.length) throw new AppError("VALIDATION", "다시 만들 수 없는 항목입니다.");
    const append = APPENDABLE_KEYS.has(key);
    const asList = (v: GeneratedValue | undefined) => (Array.isArray(v) ? v : v ? [v] : []);
    // 화면에 보이는 목록 (직접 수정했다면 수정본)
    const shown = (k: string) => content.context.userEdits?.[k]?.value ?? content.output[k];
    if (append && asList(shown(key)).length >= APPEND_MAX_ITEMS) {
      throw new AppError("VALIDATION", `후보는 ${APPEND_MAX_ITEMS}개까지 모을 수 있습니다. [직접 수정]에서 안 쓸 후보를 지운 뒤 추가해 주세요.`);
    }

    const input = { ...content.input };
    const context = await buildGenerationContext({ userId, featureId: content.featureId, channelId: content.channelId, config, input });
    // 2단계 생성 결과: 1단계 Keyword Intelligence 를 그대로 (플랫폼 API 재호출 없음)
    const wf = content.context.workflow;
    if (wf?.stage === 1) context.keywordIntel = wf.keywordIntelligence ?? null;
    if (wf?.stage === 2 && wf.stage1Id) context.keywordIntel = (await repo.contents.get(wf.stage1Id))?.context.workflow?.keywordIntelligence ?? null;
    const template = getPromptTemplate(config.promptId);
    const messages = renderContentPrompt(template, { ...config, outputs: sections }, input, context);
    if (wf?.stage === 2 && wf.selected) {
      messages.push({
        role: "user",
        content: [
          "[2단계 · 같은 제목으로] 아래 제목·Hook·CTA 를 그대로 지킨다. 새 제목을 만들거나 방향을 바꾸지 않는다. 대본은 이 제목의 약속을 실제로 전달한다.",
          `[선택한 제목] ${wf.selected.title}`,
          `[선택한 Hook] ${wf.selected.hook || "(없음)"}`,
          `[선택한 CTA] ${wf.selected.cta || "(없음)"}`,
          wf.primaryKeyword ? `[핵심 키워드] ${wf.primaryKeyword}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      });
    }

    // 지금 결과: 다시 만들 항목은 "겹치지 말 것", 나머지는 "어울리게" 참고용 (길이 제한)
    const clip = (v: GeneratedValue | undefined, n: number) => JSON.stringify(v ?? "").slice(0, n);
    const current = sections.map((o) => `- ${o.label}: ${append ? clip(shown(o.key), 6000) : clip(content.output[o.key], 1500)}`).join("\n");
    const others = config.outputs
      .filter((o) => !keys.includes(o.key))
      .map((o) => `- ${o.label}: ${clip(content.output[o.key], 300)}`)
      .join("\n");
    messages.push({
      role: "user",
      content: [
        ...(append
          ? [
              `[추가 만들기] 아래 항목의 새 후보만 만든다: ${sections.map((o) => `${o.label} ${o.count ?? 10}개`).join(", ")}. 지금 목록에 더할 것이다.`,
              "지금 목록에 있는 것과 같거나 거의 같은 후보(조사·어순만 바꾼 것 포함)는 쓰지 않는다. 다른 각도·다른 표현으로. 형식·규칙은 위와 같다.",
              "[지금 목록 — 겹치지 말 것]",
            ]
          : [
              `[다시 만들기] 아래 항목만 새로 만든다: ${sections.map((o) => o.label).join(", ")}.`,
              "지금 결과와 겹치지 않게 다른 표현·다른 각도로 쓴다. 같은 문장을 다시 쓰지 않는다. 형식·개수·규칙은 위와 같다.",
              "[지금 결과 — 피할 것]",
            ]),
        current,
        others ? "[같은 콘텐츠의 다른 항목 — 어울리게 참고]" : "",
        others,
      ]
        .filter(Boolean)
        .join("\n"),
    });

    // v0.9.157: 사용자가 적은 한 줄 요청 — 마지막에 둬서 가장 세게 따르게 (규칙·정직성·말끝은 그대로)
    if (ask)
      messages.push({
        role: "user",
        content: `[사용자 요청 — 이번에 가장 먼저 지킨다] ${ask}\n이 요청대로 ${sections.map((o) => o.label).join(", ")}을(를) 만든다. 단, 사실·정직성 규칙·대본 포맷의 말끝 규칙·형식(개수·JSON)은 그대로 지킨다.`,
      });
    const ai = await getAIProvider();
    const result = await ai.generateStructured<Record<string, unknown>>({
      task: `content-regenerate:${content.featureId}`,
      messages,
      outputKeys: sections.map((o) => o.key),
      jsonSchema: outputSchema(sections),
      variables: { featureId: content.featureId, outputs: sections, input, context, previous: content.output, append },
    });
    const fresh = normalizeOutput(sections, result.data);
    wrapScriptLines(content.featureId, fresh);
    const userEdits = { ...(content.context.userEdits ?? {}) };
    const picks = { ...(content.context.picks ?? {}) };
    let output: Record<string, GeneratedValue>;
    let headline = content.headline;
    if (append) {
      // 원본 목록과 (직접 수정했다면) 수정본 목록 모두 위에 새 후보를 더한다. 체크한 후보는 그대로
      const added = asList(fresh[key]);
      const edited = userEdits[key];
      const forShown = mergeAppend(asList(shown(key)), added);
      if (!forShown.added.length) throw new AppError("NO_NEW_ITEMS", "겹치지 않는 새 후보를 만들지 못했습니다. 한 번 더 눌러 주세요.", 422);
      if (edited) userEdits[key] = { ...edited, value: forShown.list };
      output = { ...content.output, [key]: mergeAppend(asList(content.output[key]), added).list };
    } else {
      output = { ...content.output, ...fresh };
      const headlineValue = output[config.headlineKey];
      headline = (Array.isArray(headlineValue) ? headlineValue[0] : headlineValue) || content.headline;
      for (const k of keys) {
        delete userEdits[k];
        delete picks[k];
      }
    }
    const notes = [...content.context.notes];
    if (context.honestyGuard) {
      const violations = findHonestyViolations(JSON.stringify(fresh));
      if (violations.length) notes.push(`정직성 검사 경고(${append ? "추가 만들기" : "다시 만들기"}): "${violations.join('", "')}" 표현 확인 필요`);
    }
    const regenerated = [...(content.context.regenerated ?? []), { key, at: nowIso(), provider: result.provider, ...(append ? { mode: "append" as const } : {}), ...(ask ? { request: ask } : {}) }].slice(-20);
    const updated = await repo.contents.update(content.id, { output, headline, context: { ...content.context, notes, regenerated, userEdits, picks } });
    if (!updated) throw new AppError("NOT_FOUND", "콘텐츠를 찾을 수 없습니다.", 404);
    return updated;
  },
};
