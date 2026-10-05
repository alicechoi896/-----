import "server-only";
import { HONESTY_RULE_TEXT } from "@/lib/domain/honesty";
import type { GeneratorConfig, OutputSection } from "@/lib/generators/types";
import type { RawProductData } from "@/lib/types";
import type { ChatMessage } from "../../providers/types";
import type { GenerationContext } from "../context-types";
import { renderStyleBlocks } from "../style-context";
import { formatViews, promptExamples, promptTitles } from "@/lib/script-format";
import { isListFormat } from "@/lib/generators/types";
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
      o.format === "cards"
        ? `string[] (${o.label} ${o.count ?? 3}편 — 배열 원소 하나가 대본 한 편 전체, 줄바꿈 포함)`
        : isListFormat(o.format)
          ? `string[] (${o.label}${o.count ? `, ${o.count}개` : ""})`
          : `string (${o.label})`,
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
        p.audience ? `타깃 시청자: ${p.audience} — 이 사람이 '내 얘기다' 하고 멈추도록, 이 사람의 상황·불편·말투로 Hook 과 장면을 구체적으로 쓴다` : "",
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
  // 대본 포맷: 대본 구조를 정한다 (말투는 스타일, 구조는 포맷). 참고 대본은 조회수 높은 2개만 짧게
  if (ctx.scriptFormat && ctx.scriptFormatUse === "full") {
    const f = ctx.scriptFormat;
    const ex = promptExamples(f.examples);
    blocks.push(
      block(`대본 포맷: ${f.name} (구조 참고 — 그대로 복제하지 않는다)`, [
        "아래 가이드라인은 잘된 대본들의 공통 구조다. 큰 흐름(Hook → 핵심 → CTA)은 살리되, 단계 일부를 합치거나 순서·강조점·표현을 바꿔 이 제품·주제에 맞게 더 설득력 있게 다시 짠다.",
        "대본 3편은 같은 포맷에서 출발하되 편마다 Hook 방식·전개·강조 포인트·CTA 를 다르게 해서, 사용자가 좋은 부분을 골라 섞을 수 있게 한다.",
        "영상 길이와 말투 규칙('~니다.' 금지, 짧은 리듬)은 그대로 지킨다. 가격·할인·배송·순위 주장은 [제품 정보]에 근거가 있을 때만 쓰고, 없으면 '링크에서 확인' 식으로 바꾼다.",
        ...(f.guideline ? f.guideline.split("\n") : ["(가이드라인 없음 — 아래 참고 대본의 구조를 참고한다)"]),
      ]),
    );
    if (ex.length) {
      blocks.push(
        block(
          "대본 포맷 > 참고 대본 (구조·리듬만 참고. 문장·제품명·숫자를 그대로 쓰지 않고, 받아 적은 오타는 따라 하지 않는다)",
          ex.map((e, i) => `(${i + 1}${e.views != null ? ` · ${formatViews(e.views)}` : ""}) ${e.text.replace(/\n/g, " / ")}`),
        ),
      );
    }
  }
  // 피해야 할 대본 (3단계): 반응이 낮았던 대본의 패턴을 피한다 (짧게)
  if (ctx.scriptFormat && ctx.scriptFormatUse === "full" && ctx.scriptFormat.badExamples?.length) {
    blocks.push(
      block("대본 포맷 > 피해야 할 대본 (이렇게 쓰지 않는다 — 시작 방식·전개·표현을 반복하지 않는다)", ctx.scriptFormat.badExamples.slice(0, 2).map((e, i) => `(${i + 1}) ${e.text.slice(0, 300).replace(/\n/g, " / ")}`)),
    );
  }
  // 대본 포맷의 참고 대본 제목 → 영상 제목·블로그 글 제목의 패턴 참고 (복사 금지)
  if (ctx.scriptFormat) {
    const titles = promptTitles(ctx.scriptFormat.examples);
    if (titles.length) {
      blocks.push(
        block(`대본 포맷 > 잘된 제목 (${ctx.scriptFormatUse === "titles" ? "블로그 글 제목" : "영상 제목"} 패턴 참고 — 그대로 쓰지 않는다)`, [
          "아래 제목들의 설득 구조(후회·손해 회피, 반문, 숫자, 대상 지정, 비교 등)만 뽑아 지금 주제·제품·키워드에 맞는 새 제목으로 더 설득력 있게 바꾼다. 문장·제품명을 복사하지 않는다.",
          ctx.scriptFormatUse === "titles" ? "블로그는 검색형 제목이다: 핵심 키워드를 앞쪽에 두고 영상식 과장 표현은 줄인다." : "",
          ...titles.map((t) => `잘된 제목: ${t}`),
        ].filter(Boolean)),
      );
    }
  }
  // Keyword Intelligence: 실제 플랫폼 데이터의 키워드 후보 (검색량 아님)
  if (ctx.keywordIntel && ctx.keywordIntel.candidates.length) {
    const ki = ctx.keywordIntel;
    const where = ki.source === "youtube" ? `YouTube 관련 영상 ${ki.sampleSize}개` : `NAVER 블로그 글 ${ki.sampleSize}개`;
    blocks.push(
      block(`Keyword Intelligence — '${ki.seed}' 실제 ${where}에서 반복된 표현 (근거 있는 키워드 후보)`, [
        "제목·Hook·키워드는 아래 실제 표현을 우선 활용한다. 목록에 없는 검색량·순위·점수는 만들지 않는다. 제품·주제와 관계없는 표현은 쓰지 않는다.",
        ...ki.candidates.slice(0, 15).map((c) => `- ${c.keyword} (${c.evidence})`),
        ...(ki.trendSignals.length
          ? ["NAVER 데이터랩 상대 관심도 (0~100, 검색량 아님):", ...ki.trendSignals.map((t) => `- ${t.keyword}: ${t.relativeInterest} (${t.direction === "up" ? "최근 상승" : t.direction === "down" ? "최근 하락" : "비슷"})`)]
          : []),
      ]),
    );
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
  const optionLabel = (key: string, v: unknown) => {
    const o = config.fields.find((f) => f.name === key)?.options?.find((x) => x.value === v);
    return o ? (o.hint ? `${o.label} (${o.hint})` : o.label) : String(v);
  };
  const userInput = Object.entries(input)
    .filter(([key, v]) => v !== "" && v != null && !(Array.isArray(v) && v.length === 0) && key !== "productId" && key !== "trendId" && key !== "referenceVideoId" && key !== "styleId" && key !== "profileId" && key !== "scriptFormatId")
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
      keySpecs: "string[]",
      keyBenefits: "string[]",
      differentiators: "string[]",
      targetAudience: "string[]",
      buyingPoints: "string[]",
      cautions: "string[]",
      useCases: "string[]",
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
      raw.price ? `판매가: ${raw.price}원` : "",
      raw.originalPrice ? `정가: ${raw.originalPrice}원` : "",
      raw.discountRate ? `할인율: ${raw.discountRate}%` : "",
      raw.options?.length ? `옵션: ${raw.options.join(", ")}` : "",
      `설명: ${raw.descriptionText}`,
      ...Object.entries(raw.specs).map(([k, v]) => `스펙 ${k}: ${v}`),
      raw.detailImageInsights ? `상세페이지 이미지에서 읽은 내용:\n${raw.detailImageInsights}` : "",
      ...raw.reviewSnippets.map((r) => `리뷰 발췌: ${r}`),
    ]),
    `다음 JSON 형식으로만 응답한다:\n${JSON.stringify(shape, null, 2)}`,
  ].join("\n\n");
  return [
    { role: "system", content: template.system },
    { role: "user", content: user },
  ];
}
