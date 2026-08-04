import "server-only";
import { chatModel } from "./provider";
import { generateStructured } from "./generate-structured";
import { strategyGenerationSchema, type StrategyOptionAi } from "./schemas";
import { PROMPT_INJECTION_GUARD, wrapReferenceContext } from "./prompt-safety";

export interface RetrievedChunkForStrategy {
  index: number;
  content: string;
  dataSourceTitle: string;
  similarity: number;
}

export interface DecisionRuleForStrategy {
  name: string;
  condition: string;
  action: string;
  reason: string;
  category: string;
}

export async function generateStrategyOptions(params: {
  organizationName: string;
  campaign: {
    name: string;
    productName: string | null;
    audience: string;
    currentProblem: string;
    goal: string;
    platforms: string[];
    extraConditions: string | null;
  };
  chunks: RetrievedChunkForStrategy[];
  rules: DecisionRuleForStrategy[];
  brandCoreMessage: string | null;
}): Promise<StrategyOptionAi[]> {
  const chunkBlock = params.chunks
    .map((c) => `[chunk ${c.index}] (출처: ${c.dataSourceTitle})\n${c.content}`)
    .join("\n\n---\n\n");

  const ruleBlock = params.rules
    .map((r) => `- ${r.name}: IF ${r.condition} THEN ${r.action} BECAUSE ${r.reason}`)
    .join("\n");

  const system = `당신은 중소기업 마케팅 전략 AI다. 기업의 실제 데이터(근거 자료, 의사결정 규칙, 브랜드 메시지)를 바탕으로 서로 다른 관점의 마케팅 전략 후보를 생성한다.
${PROMPT_INJECTION_GUARD}
전략은 반드시 캠페인 조건과 제공된 근거에 부합해야 하며, 최소 3개 최대 5개를 생성한다. 각 전략은 서로 다른 targetProblem 또는 contentDirection을 가져야 한다.
기본적으로 문제 진단형/성공 사례형/전문지식형/반론 해결형 네 가지 관점을 참고하되, 기업 데이터에 더 적합한 다른 전략 유형이 있다면 자유롭게 사용한다.
featureScores의 각 항목은 0~100 사이 정수로, 근거 자료와 비교해 신중하게 평가한다. evidenceChunkIndexes에는 실제로 참고한 [chunk N]의 N만 넣고, appliedDecisionRuleNames에는 실제로 적용한 규칙의 이름만 넣는다. 최종 점수는 절대 직접 계산하지 않는다 — 서버가 계산한다.`;

  const prompt = `기업명: ${params.organizationName}
캠페인명: ${params.campaign.name}
상품: ${params.campaign.productName ?? "미지정"}
핵심 고객: ${params.campaign.audience}
현재 문제: ${params.campaign.currentProblem}
캠페인 목표: ${params.campaign.goal}
운영 플랫폼: ${params.campaign.platforms.join(", ")}
추가 조건: ${params.campaign.extraConditions ?? "없음"}
브랜드 대표 메시지: ${params.brandCoreMessage ?? "미확인"}

의사결정 규칙:
${ruleBlock || "(등록된 규칙 없음)"}

${wrapReferenceContext("기업 데이터 검색 결과", chunkBlock || "(관련 근거 자료 없음)")}

위 조건을 바탕으로 서로 다른 전략 후보를 생성하라.`;

  const result = await generateStructured({
    model: chatModel(),
    schema: strategyGenerationSchema,
    system,
    prompt,
  });

  return result.strategies;
}
