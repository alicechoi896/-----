import "server-only";
import { findHonestyViolations } from "@/lib/domain/honesty";
import { APPENDABLE_KEYS, APPEND_MAX_ITEMS, mergeAppend } from "@/lib/generators/append";
import { findGeneratorConfig } from "@/lib/generators/configs";
import { findFeature } from "@/lib/registry";
import { isListFormat, type OutputSection } from "@/lib/generators/types";
import {
  PRECISE_ANGLE_COUNT,
  PRECISE_TITLE_COUNT,
  TOP_TITLE_COUNT,
  scriptMetaKey,
  supportsPrecise,
  type PreciseQuality,
  type PreciseStage,
} from "@/lib/generators/quality";
import type { ChannelId, ContextSummary, GenerateContentRequest, GeneratedContent, GeneratedValue } from "@/lib/types";
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
async function finish(
  p: Prepared,
  output: Record<string, GeneratedValue>,
  ai: { provider: string; model: string },
  extra: { headline?: string; quality?: PreciseQuality } = {},
): Promise<GeneratedContent> {
  const { feature, config, featureId, channelId, userId, input, context, template } = p;
  if (context.honestyGuard) {
    const violations = findHonestyViolations(JSON.stringify(output));
    if (violations.length) context.summary.notes.push(`정직성 검사 경고: "${violations.join('", "')}" 표현 확인 필요`);
  }
  const headlineValue = output[config.headlineKey];
  const headline = extra.headline || (Array.isArray(headlineValue) ? headlineValue[0] : headlineValue) || feature.title;
  const summary: ContextSummary = extra.quality ? { ...context.summary, quality: extra.quality } : context.summary;
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
const listOf = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

export const contentGenerationService = {
  /** 빠른 생성: AI 1회 */
  async generate(req: GenerateContentRequest): Promise<GeneratedContent> {
    const p = await prepare(req);
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
    return finish(p, normalizeOutput(p.config.outputs, result.data), result);
  },

  /**
   * 정밀 생성 (v0.9.31): AI 4회. 같은 Context·프롬프트 위에 단계 지시만 더한다. docs/QUALITY_MODES.md
   *  ① 앵글 3개 → ② 제목 40개 + 추천 TOP 5(이유) + Hook → ③ 앵글별 대본 3편 + 나머지 항목 → ④ 이탈 지점 검토·수정 + 뼈대 판정
   * onStage 로 단계가 시작될 때마다 알린다 (화면 진행 표시). ④가 실패하면 ③ 대본을 그대로 저장한다.
   */
  async generatePrecise(req: GenerateContentRequest, onStage: (stage: PreciseStage) => void = () => {}): Promise<GeneratedContent> {
    const p = await prepare(req);
    if (!supportsPrecise(p.config.outputs)) throw new AppError("VALIDATION", "정밀 생성은 영상·클립 원고에서만 쓸 수 있습니다.");
    const ai = await getAIProvider();
    const { config, featureId, input, context, template } = p;
    const base = (outputs: OutputSection[]) => renderContentPrompt(template, { ...config, outputs }, input, context);
    const vars = { featureId, input, context };

    // ① 앵글
    onStage("angles");
    const scriptSection = config.outputs.find((o) => o.key === "script")!;
    const angleT = getPromptTemplate("content.precise-angles");
    const r1 = await ai.generateStructured<{ angles?: unknown }>({
      task: `content-precise-angles:${featureId}`,
      messages: [...base([scriptSection]), { role: "user", content: angleT.task }],
      outputKeys: ["angles"],
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["angles"],
        properties: {
          angles: {
            type: "array",
            description: `서로 다른 앵글 ${PRECISE_ANGLE_COUNT}개`,
            items: { type: "object", additionalProperties: false, required: ["name", "why"], properties: { name: { type: "string" }, why: { type: "string" } } },
          },
        },
      },
      variables: { ...vars, step: "angles" },
      maxTokens: 600,
    });
    const angles = listOf(r1.data.angles)
      .map((a) => ({ name: str((a as { name?: unknown })?.name, 30), why: str((a as { why?: unknown })?.why, 200) }))
      .filter((a) => a.name)
      .slice(0, PRECISE_ANGLE_COUNT);
    if (!angles.length) throw new AppError("AI_BAD_OUTPUT", "앵글을 정하지 못했습니다. 다시 시도해 주세요.", 502);
    const angleText = angles.map((a, i) => `앵글 ${i + 1}. ${a.name} — ${a.why}`).join("\n");

    // ② 제목 40 + TOP 5 + Hook
    onStage("titles");
    const titleT = getPromptTemplate("content.precise-titles");
    const titleSection: OutputSection = { ...config.outputs.find((o) => o.key === "titles")!, count: PRECISE_TITLE_COUNT };
    const hookSection = config.outputs.find((o) => o.key === "hooks")!;
    const r2 = await ai.generateStructured<{ titles?: unknown; hooks?: unknown; title_top?: unknown }>({
      task: `content-precise-titles:${featureId}`,
      messages: [...base([titleSection, hookSection]), { role: "user", content: `${titleT.task}\n[앵글]\n${angleText}` }],
      outputKeys: ["titles", "hooks", "title_top"],
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["titles", "hooks", "title_top"],
        properties: {
          titles: { type: "array", items: { type: "string" }, description: `제목 후보 ${PRECISE_TITLE_COUNT}개` },
          hooks: { type: "array", items: { type: "string" }, description: `Hook 후보 ${hookSection.count ?? 10}개 이상` },
          title_top: {
            type: "array",
            description: `추천 제목 ${TOP_TITLE_COUNT}개 (titles 의 1부터 센 번호)`,
            items: { type: "object", additionalProperties: false, required: ["index", "reason"], properties: { index: { type: "integer" }, reason: { type: "string" } } },
          },
        },
      },
      variables: { ...vars, step: "titles", outputs: [titleSection, hookSection], angles },
      maxTokens: 3500,
    });
    const titles = [...new Set(listOf(r2.data.titles).map((t) => str(t, 120)).filter(Boolean))];
    const hooks = [...new Set(listOf(r2.data.hooks).map((t) => str(t, 200)).filter(Boolean))];
    if (!titles.length) throw new AppError("AI_BAD_OUTPUT", "제목을 만들지 못했습니다. 다시 시도해 주세요.", 502);
    const seenTop = new Set<string>();
    const titleTop = listOf(r2.data.title_top)
      .map((t) => {
        const i = Number((t as { index?: unknown })?.index) - 1;
        return { title: titles[i] ?? "", reason: str((t as { reason?: unknown })?.reason, 200) };
      })
      .filter((t) => t.title && !seenTop.has(t.title) && seenTop.add(t.title))
      .slice(0, TOP_TITLE_COUNT);
    // 추천을 고르지 못했으면 앞에서부터 (이유 없이)
    for (const t of titles) {
      if (titleTop.length >= TOP_TITLE_COUNT) break;
      if (seenTop.has(t)) continue;
      titleTop.push({ title: t, reason: "" });
      seenTop.add(t);
    }
    // 추천 제목을 목록 맨 앞으로 (대표 제목 = 추천 1위)
    const orderedTitles = [...titleTop.map((t) => t.title), ...titles.filter((t) => !seenTop.has(t))];

    // ③ 앵글별 대본 3편 + 나머지 항목
    onStage("scripts");
    const rest = config.outputs.filter((o) => o.key !== "titles" && o.key !== "hooks");
    const r3 = await ai.generateStructured<Record<string, unknown>>({
      task: `content-precise-scripts:${featureId}`,
      messages: [
        ...base(rest),
        {
          role: "user",
          content: [
            "[정밀 생성 3/4: 대본] script 는 대본 3편이고, 대본 1·2·3 은 아래 앵글 1·2·3 을 각각 따른다. 대본 뼈대 규칙을 반드시 지킨다.",
            `[앵글]\n${angleText}`,
            `[추천 제목 — 대본이 이 제목의 약속을 지키게]\n${titleTop.map((t) => `- ${t.title}`).join("\n")}`,
            `[Hook 후보 — 첫 줄로 골라 쓰거나 다듬어도 된다]\n${hooks.slice(0, 12).map((h) => `- ${h}`).join("\n")}`,
          ].join("\n"),
        },
      ],
      outputKeys: rest.map((o) => o.key),
      jsonSchema: outputSchema(rest),
      variables: { ...vars, step: "scripts", outputs: rest, angles },
    });
    const restOut = normalizeOutput(rest, r3.data);
    const drafts = (Array.isArray(restOut.script) ? restOut.script : [restOut.script]).filter((s) => s.trim());
    if (!drafts.length) throw new AppError("AI_BAD_OUTPUT", "대본을 만들지 못했습니다. 다시 시도해 주세요.", 502);

    // ④ 이탈 지점 검토·수정 (실패해도 ③ 대본으로 저장)
    onStage("review");
    const reviewT = getPromptTemplate("content.precise-review");
    let finalScripts = drafts;
    let reviews: { review: string; checks: PreciseQuality["scripts"][number]["checks"] }[] = drafts.map(() => ({ review: "", checks: { hook: false, openLoop: false, answer: false } }));
    try {
      const r4 = await ai.generateStructured<{ scripts?: unknown }>({
        task: `content-precise-review:${featureId}`,
        messages: [
          { role: "system", content: reviewT.system },
          {
            role: "user",
            content: [
              reviewT.task,
              `[영상 길이] ${String(input.length ?? "") || "입력 없음"}`,
              ...drafts.map((d, i) => `### 대본 ${i + 1} (앵글: ${angles[i]?.name ?? "-"})\n${d}`),
            ].join("\n"),
          },
        ],
        outputKeys: ["scripts"],
        jsonSchema: {
          type: "object",
          additionalProperties: false,
          required: ["scripts"],
          properties: {
            scripts: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["script", "review", "hook", "open_loop", "answer"],
                properties: {
                  script: { type: "string", description: "고친 대본 (고칠 곳이 없으면 원래 대본)" },
                  review: { type: "string" },
                  hook: { type: "boolean" },
                  open_loop: { type: "boolean" },
                  answer: { type: "boolean" },
                },
              },
            },
          },
        },
        variables: { ...vars, step: "review", drafts },
        maxTokens: 4000,
      });
      const items = listOf(r4.data.scripts);
      finalScripts = drafts.map((d, i) => {
        const fixed = str((items[i] as { script?: unknown })?.script, 4000);
        // 고친 대본이 너무 짧아졌으면(잘림) 원래 대본
        return fixed && fixed.length >= d.length * 0.5 ? fixed : d;
      });
      reviews = drafts.map((_, i) => {
        const it = (items[i] ?? {}) as Record<string, unknown>;
        return { review: str(it.review, 300), checks: { hook: it.hook === true, openLoop: it.open_loop === true, answer: it.answer === true } };
      });
    } catch {
      context.summary.notes.push("정밀 생성: 이탈 지점 검토 단계가 실패해 검토 전 대본을 저장했습니다.");
    }

    const quality: PreciseQuality = {
      mode: "precise",
      angles,
      titleTop,
      scripts: finalScripts.map((s, i) => ({ key: scriptMetaKey(s), angle: angles[i]?.name ?? "", ...reviews[i] })),
    };
    const output: Record<string, GeneratedValue> = {};
    for (const o of config.outputs) output[o.key] = o.key === "titles" ? orderedTitles : o.key === "hooks" ? hooks : o.key === "script" ? finalScripts : restOut[o.key];
    return finish(p, output, r3, { headline: orderedTitles[0], quality });
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
    const template = getPromptTemplate(config.promptId);
    const messages = renderContentPrompt(template, { ...config, outputs: sections }, input, context);

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
