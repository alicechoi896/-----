import "server-only";
import { chatModel } from "./provider";
import { generateStructured } from "./generate-structured";
import { contentFitAnalysisSchema, type ContentFitAnalysis } from "./schemas";
import { PROMPT_INJECTION_GUARD, wrapReferenceContext } from "./prompt-safety";

export interface ContentFitContext {
  organizationName: string;
  strategyTitle: string;
  targetProblem: string | null;
  coreMessage: string | null;
  contentDirection: string | null;
  brandCoreMessage: string | null;
  prohibitedExpressions: string[];
  platform: string;
  contentTitle: string | null;
  contentBody: string;
}

export async function analyzeContentFit(context: ContentFitContext): Promise<ContentFitAnalysis> {
  const system = `당신은 사용자가 직접 작성한 마케팅 콘텐츠가 기업의 전략과 얼마나 맞는지 평가하는 AI다.
${PROMPT_INJECTION_GUARD}
콘텐츠에 실제로 없는 내용을 있다고 평가하지 않는다. 근거 없이 후하게 평가하지 않으며, 맞지 않는 부분은 명확히 지적한다.`;

  const prompt = `기업명: ${context.organizationName}
전략명: ${context.strategyTitle}
타깃 문제: ${context.targetProblem ?? "-"}
전략 핵심 메시지: ${context.coreMessage ?? "-"}
콘텐츠 방향: ${context.contentDirection ?? "-"}
브랜드 대표 메시지: ${context.brandCoreMessage ?? "-"}
금지 표현: ${context.prohibitedExpressions.join(", ") || "없음"}

${wrapReferenceContext(
  "사용자가 직접 작성한 콘텐츠",
  `플랫폼: ${context.platform}\n제목: ${context.contentTitle ?? "-"}\n본문:\n${context.contentBody}`
)}

이 콘텐츠가 위 전략과 얼마나 맞는지 0~100점(fitScore)으로 평가하라. 전략과 맞는 요소(matchedElements),
어긋나거나 빠진 요소(mismatchedElements), 개선 제안(suggestions), 한 문단 요약(summary)을 작성하라.`;

  return generateStructured({
    model: chatModel(),
    schema: contentFitAnalysisSchema,
    system,
    prompt,
  });
}
