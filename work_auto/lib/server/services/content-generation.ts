import "server-only";
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

async function finish(
  p: Prepared,
  output: Record<string, GeneratedValue>,
  ai: { provider: string; model: string },
  extra: { headline?: string; quality?: PreciseQuality; workflow?: ContentWorkflow; keywordIntel?: KeywordIntelligence | null } = {},
): Promise<GeneratedContent> {
  const { feature, config, featureId, channelId, userId, input, context, template } = p;
  mergeUserKeywords(config, input, output);
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
  return keywordIntelligence.collect({ userId: p.userId, featureId: p.featureId, seed, requestId });
}
const listOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export const contentGenerationService = {
  /** 한 번에 생성 (블로그·예전 방식). 블로그는 생성 직전에 NAVER Keyword Intelligence 를 모아 넣는다 */
  async generate(req: GenerateContentRequest & { clientRequestId?: string }): Promise<GeneratedContent> {
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
    const p = await prepare(req);
    if (!isTwoStage(p.config.outputs)) throw new AppError("VALIDATION", "2단계 생성은 영상·클립 원고에서만 씁니다.");
    const intel = await collectIntel(p, req.clientRequestId);
    p.context.keywordIntel = intel;
    if (intel.note) p.context.summary.notes.push(intel.note);
    const outputs = p.config.outputs.filter((o) => STAGE1_KEYS.has(o.key));
    const messages = renderContentPrompt(p.template, { ...p.config, outputs }, p.input, p.context);
    messages.push({
      role: "user",
      content: [
        "[1단계] 제목 후보·Hook 후보·CTA 후보만 만든다. 대본·설명·키워드·태그는 아직 쓰지 않는다 (사용자가 제목을 고른 뒤 2단계에서 만든다).",
        "제목은 Keyword Intelligence 의 실제 표현과 제품·주제의 사실을 활용하고, 서로 다른 약속(구매 판단·기능·비교·후회 방지 등)을 하게 만든다.",
        "제목을 다 쓴 뒤 클릭률이 가장 높을 5개를 골라 title_top 에 1부터 센 번호와 이유를 쓴다.",
      ].join("\n"),
    });
    const ai = await getAIProvider();
    const schema = outputSchema(outputs) as { properties: Record<string, unknown>; required: string[] };
    schema.properties.title_top = {
      type: "array",
      description: "추천 제목 5개 (titles 의 1부터 센 번호)",
      items: { type: "object", additionalProperties: false, required: ["index", "reason"], properties: { index: { type: "integer" }, reason: { type: "string" } } },
    };
    schema.required = [...schema.required, "title_top"];
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
    const workflow: ContentWorkflow = { id: createId("wf"), stage: 1, keywordIntelligence: compactIntel(intel) };
    return finish(p, output, result, { quality: { mode: "precise", angles: [], titleTop, scripts: [] }, workflow });
  },

  /**
   * 2단계: 1단계에서 고른 제목 1개(+ Hook·CTA) → 대본 3편·최종 키워드·태그(해시태그)·설명. 제목마다 1번씩 부른다 (AI 1회).
   * 플랫폼 API 는 다시 부르지 않고 1단계의 Keyword Intelligence 를 쓴다.
   */
  async stage2(input: { stage1Id?: unknown; title?: unknown; hook?: unknown; cta?: unknown }): Promise<GeneratedContent> {
    const repo = getRepositories();
    const userId = await getCurrentUserId();
    const s1 = await repo.contents.get(String(input.stage1Id ?? ""));
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
        isInfo
          ? "3. 3편은 설득 구조가 다르다: ① 가장 중요한 정보부터 ② 궁금증·반전형 ③ 체크리스트·정리형. script_structures 에 각 편의 구조 이름을 쓴다."
          : "3. 3편은 설득 구조가 다르다: ① 문제 해결형 ② 핵심 장점·결론 먼저 ③ 비교·구매 판단형. script_structures 에 각 편의 구조 이름을 쓴다.",
        "4. primary_keyword 는 이 제목의 검색 의도에 맞는 핵심 키워드 1개, related_keywords 는 제목·대본 방향에 맞는 관련 키워드(검색 의도 intent: purchase·info·compare·review·howto 중 하나). Keyword Intelligence 의 실제 표현을 우선 쓰고, 제목과 관계없는 키워드는 넣지 않는다. 사용자가 주요 키워드를 여러 개 넣었으면 그 키워드를 모두 포함하고 각각에서 파생된 키워드를 고르게 섞어 related_keywords 를 20~29개 만든다.",
        tagKey ? `5. ${tagKey} 는 최종 키워드(primary_keyword + related_keywords)에서 만든다. 중복·의미 없는 일반 단어는 뺀다.` : "",
        "6. 설명(description)은 이 제목과 대본에 실제로 나온 내용만 쓴다. 제품 스펙은 [제품 정보] 범위 안에서만.",
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
    schema.required = [...schema.required, "primary_keyword", "related_keywords", "script_structures"];
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
  async regenerateSection(contentId: string, key: string): Promise<GeneratedContent> {
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

    const ai = await getAIProvider();
    const result = await ai.generateStructured<Record<string, unknown>>({
      task: `content-regenerate:${content.featureId}`,
      messages,
      outputKeys: sections.map((o) => o.key),
      jsonSchema: outputSchema(sections),
      variables: { featureId: content.featureId, outputs: sections, input, context, previous: content.output, append },
    });
    const fresh = normalizeOutput(sections, result.data);
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
    const regenerated = [...(content.context.regenerated ?? []), { key, at: nowIso(), provider: result.provider, ...(append ? { mode: "append" as const } : {}) }].slice(-20);
    const updated = await repo.contents.update(content.id, { output, headline, context: { ...content.context, notes, regenerated, userEdits, picks } });
    if (!updated) throw new AppError("NOT_FOUND", "콘텐츠를 찾을 수 없습니다.", 404);
    return updated;
  },
};
