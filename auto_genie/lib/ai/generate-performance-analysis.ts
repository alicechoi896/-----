import "server-only";
import { chatModel } from "./provider";
import { generateStructured } from "./generate-structured";
import { performanceAnalysisSchema, type PerformanceAnalysis } from "./schemas";
import { PROMPT_INJECTION_GUARD } from "./prompt-safety";
import type { PerformanceRatios } from "@/lib/performance/scoring";

export async function analyzePerformance(params: {
  organizationName: string;
  contentTitle: string;
  platform: string;
  strategyTitle: string | null;
  coreMessage: string | null;
  metrics: Record<string, number>;
  ratios: PerformanceRatios;
  performanceScore: number;
  brandCoreMessage: string | null;
  decisionRuleHints: string[];
  similarContentPerformance: { title: string; score: number }[];
}): Promise<PerformanceAnalysis> {
  const system = `당신은 마케팅 성과 분석 AI다. 콘텐츠 성과 데이터를 근거로 무엇이 효과적이었고 무엇이 아쉬웠는지 분석한다.
${PROMPT_INJECTION_GUARD}
숫자 데이터에 실제로 근거해서만 분석하고, 확인되지 않은 원인을 단정하지 않는다. 다음 콘텐츠 제안은 구체적이고 실행 가능해야 한다.`;

  const prompt = `기업명: ${params.organizationName}
콘텐츠: ${params.contentTitle} (${params.platform})
전략: ${params.strategyTitle ?? "-"} / 핵심 메시지: ${params.coreMessage ?? "-"}
브랜드 대표 메시지: ${params.brandCoreMessage ?? "-"}

성과 지표: ${JSON.stringify(params.metrics)}
전환율: ${JSON.stringify(params.ratios)}
종합 성과 점수: ${params.performanceScore} / 100

참고할 의사결정 규칙: ${params.decisionRuleHints.join(" / ") || "없음"}
유사 콘텐츠 성과 비교: ${
    params.similarContentPerformance.map((c) => `${c.title}: ${c.score}점`).join(", ") || "비교 데이터 없음"
  }

위 데이터를 바탕으로 성과가 좋았던 이유, 낮았던 이유, 조회 성과와 구매 성과의 차이, 유지할 전략 요소, 수정할 전략 요소, 다음 콘텐츠 제안을 생성하라.`;

  return generateStructured({ model: chatModel(), schema: performanceAnalysisSchema, system, prompt });
}
