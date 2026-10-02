import "server-only";
import { HONESTY_RULE_TEXT } from "@/lib/domain/honesty";
import type { GeneratorConfig, OutputSection } from "@/lib/generators/types";
import type { RawProductData } from "@/lib/types";
import type { ChatMessage } from "../../providers/types";
import type { GenerationContext } from "../context-types";
import { renderStyleBlocks } from "../style-context";
import type { PromptTemplate } from "./types";

/**
 * 프롬프트 조립기.
 *   최종 프롬프트 = 고정 프롬프트(system) + 제품 + 스타일 + 좋은 예시 + 피드백 + 성과 + 트렌드 + 사용자 입력 + 출력 형식
 * 각 블록은 [제목] 으로 구분한다. 블록 순서를 바꾸면 결과 품질이 달라질 수 있으므로 템플릿 버전을 올린다.
 */

const block = (title: string, body: string | string[]) => {
  const text = Array.isArray(body) ? body.filter(Boolean).map((l) => `- ${l}`).join("\n") : body;
  return text ? `[${title}]\n${text}` : "";
};

function outputFormat(outputs: OutputSection[]): string {
  const shape = Object.fromEntries(
    outputs.map((o) => [
      o.key,
      o.format === "list" || o.format === "tags" ? `string[] (${o.label}${o.count ? `, ${o.count}개` : ""})` : `string (${o.label})`,
    ]),
  );
  return `다음 JSON 형식으로만 응답한다:\n${JSON.stringify(shape, null, 2)}`;
}

function contextBlocks(ctx: GenerationContext): string[] {
  const blocks: string[] = [];
  const p = ctx.product;
  if (p) {
    const a = p.analysis;
    blocks.push(
      block("제품 정보", [
        `제품명: ${a.basicInfo.name} (${a.basicInfo.brand})`,
        `한 줄 설명: ${a.summary.oneLiner}`,
        `핵심 특징: ${a.summary.keyFeatures.join(", ")}`,
        `핵심 장점: ${a.summary.keyBenefits.join(", ")}`,
        `차별점: ${a.summary.differentiators.join(", ")}`,
        `추천 대상: ${a.summary.targetAudience.join(", ")}`,
        `주의할 점: ${a.summary.cautions.join(", ")}`,
        `영상 강조 포인트: ${a.contentData.videoPoints.join(", ")}`,
        `블로그 강조 포인트: ${a.contentData.blogPoints.join(", ")}`,
        `추천 Hook: ${a.contentData.hooks.join(" / ")}`,
      ]),
      block("사용 금지 표현", a.contentData.forbiddenExpressions),
    );
  }
  if (ctx.contentProfile) {
    const p = ctx.contentProfile;
    blocks.push(
      block("콘텐츠 프로필 (이 사용자가 다루는 분야)", [
        `프로필: ${p.name}${p.description ? ` — ${p.description}` : ""}`,
        `대표 카테고리: ${p.mainCategory}`,
        p.subCategories.length ? `세부 관심분야: ${p.subCategories.join(", ")}` : "",
        p.seedKeywords.length ? `관심 키워드 (자연스럽게 맞으면 활용): ${p.seedKeywords.join(", ")}` : "",
        p.excludeKeywords.length ? `제외 키워드 (다루지 않는다): ${p.excludeKeywords.join(", ")}` : "",
      ]),
    );
  }
  // 스타일: Style Context Builder 가 고른 표본과 영상/블로그별 해석 지시 (lib/server/ai/style-context.ts)
  if (ctx.styleContext) {
    for (const b of renderStyleBlocks(ctx.styleContext)) blocks.push(block(b.title, b.lines));
  }
  if (ctx.learning) {
    const LABEL: Record<string, string> = {
      title_insights: "제목",
      hook_insights: "Hook",
      structure_insights: "구조",
      cta_insights: "CTA",
      keyword_insights: "키워드",
      positive_traits: "좋은 특징",
      negative_traits: "피할 특징",
      style_adjustments: "표현",
    };
    blocks.push(
      block(`학습 프로필 v${ctx.learning.version} — 팀이 실제로 써 보며 발견한 경향 (참고용)`, [
        "규칙·금지 표현·나의 스타일이 이것보다 우선한다. 경향을 모든 결과에 똑같이 적용하지 말고 다양성을 유지한다.",
        ...ctx.learning.insights.map((i) => `${LABEL[i.category] ?? i.category}: ${i.text}`),
      ]),
    );
  }
  if (ctx.examples.length) {
    blocks.push(
      block(
        "좋은 예시 (과거 결과 요약 — 구조·톤만 참고, 문장 복사 금지)",
        ctx.examples.map((e) => `(${e.kind === "positive" ? "반응 좋았던 결과" : "일반 결과"}) ${e.text.replace(/\n/g, " | ")}`),
      ),
    );
  }
  if (ctx.avoid.length) {
    blocks.push(
      block(
        "피해야 할 패턴 (사용자 피드백)",
        ctx.avoid.map((a) => (a.edited ? `${a.reason} → 사용자 수정본: ${JSON.stringify(a.edited)}` : a.reason)),
      ),
    );
  }
  if (ctx.performanceHints.length) blocks.push(block("성과가 좋았던 콘텐츠", ctx.performanceHints));
  if (ctx.trend) blocks.push(block("현재 트렌드", [`${ctx.trend.title} (키워드: ${ctx.trend.keywords.join(", ")})`]));
  if (ctx.referenceVideo) {
    blocks.push(block("참고 영상", [`${ctx.referenceVideo.title} — ${ctx.referenceVideo.channelName}`, ctx.referenceVideo.note ?? ""]));
  }
  if (ctx.honestyGuard) blocks.push(block("정직성 규칙 (최우선)", HONESTY_RULE_TEXT));
  return blocks.filter(Boolean);
}

export function renderContentPrompt(
  template: PromptTemplate,
  config: GeneratorConfig,
  input: Record<string, unknown>,
  ctx: GenerationContext,
): ChatMessage[] {
  const labels = Object.fromEntries(config.fields.map((f) => [f.name, f.label]));
  // 선택형 항목은 값("15s") 대신 화면 이름("Shorts 15초")으로 보낸다
  const optionLabel = (key: string, v: unknown) =>
    config.fields.find((f) => f.name === key)?.options?.find((o) => o.value === v)?.label ?? String(v);
  const userInput = Object.entries(input)
    .filter(([key, v]) => v !== "" && v != null && !(Array.isArray(v) && v.length === 0) && key !== "productId" && key !== "trendId" && key !== "referenceVideoId" && key !== "styleId" && key !== "profileId")
    .map(([key, v]) => `${labels[key] ?? key}: ${Array.isArray(v) ? v.join(", ") : optionLabel(key, v)}`);

  const user = [
    block("작업", template.task),
    ...contextBlocks(ctx),
    block("사용자 입력", userInput),
    outputFormat(config.outputs),
  ]
    .filter(Boolean)
    .join("\n\n");

  return [
    { role: "system", content: template.system },
    { role: "user", content: user },
  ];
}

export function renderProductAnalysisPrompt(template: PromptTemplate, raw: RawProductData): ChatMessage[] {
  const shape = {
    basicInfo: { name: "string", brand: "string", category: "string", seller: "string", url: "string" },
    summary: {
      oneLiner: "string",
      keyFeatures: "string[]",
      keyBenefits: "string[]",
      differentiators: "string[]",
      targetAudience: "string[]",
      buyingPoints: "string[]",
      cautions: "string[]",
    },
    contentData: { videoPoints: "string[]", blogPoints: "string[]", keywords: "string[]", hooks: "string[]", forbiddenExpressions: "string[]" },
  };
  const user = [
    block("작업", template.task),
    block("상품 원문", [
      `상품명: ${raw.title}`,
      raw.brand ? `브랜드: ${raw.brand}` : "",
      raw.category ? `카테고리: ${raw.category}` : "",
      raw.seller ? `판매처: ${raw.seller}` : "",
      raw.url ? `URL: ${raw.url}` : "",
      raw.price ? `가격: ${raw.price}원` : "",
      `설명: ${raw.descriptionText}`,
      ...Object.entries(raw.specs).map(([k, v]) => `스펙 ${k}: ${v}`),
      ...raw.reviewSnippets.map((r) => `리뷰 발췌: ${r}`),
    ]),
    `다음 JSON 형식으로만 응답한다:\n${JSON.stringify(shape, null, 2)}`,
  ].join("\n\n");
  return [
    { role: "system", content: template.system },
    { role: "user", content: user },
  ];
}
