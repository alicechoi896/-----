import "server-only";
import type { z } from "zod";
import { chatModel } from "./provider";
import { generateStructured } from "./generate-structured";
import { platformContentSchemas, type PlatformContent } from "./schemas";
import { PROMPT_INJECTION_GUARD, wrapReferenceContext } from "./prompt-safety";
import type { Platform } from "@/types/database";

const PLATFORM_BRIEF: Record<Platform, string> = {
  naver_blog: "네이버 블로그 SEO 글: 검색 의도, 제목, 도입부, 소제목 구조, 본문, 핵심 키워드, CTA, SEO 메타 설명을 포함한다.",
  instagram: "인스타그램 캐러셀: 첫 장 후킹, 7~10장 슬라이드 문구, 캡션, CTA, 해시태그를 포함한다.",
  threads: "스레드(Threads) 글: 첫 문장, 본문 스레드 5~8개, 마지막 질문 또는 행동 유도를 포함한다.",
  youtube_shorts: "유튜브 쇼츠 대본: 첫 3초 후킹, 장면별 대본과 자막, 예상 길이(초), 제목 후보 5개, CTA를 포함한다.",
  newsletter: "이메일 뉴스레터: 제목 후보, 프리헤더, 도입, 사례, 핵심 내용, CTA를 포함한다.",
  landing_page: "랜딩페이지 카피: 헤드라인, 문제, 해결책, 차별점, 신뢰 요소, 상품 안내, FAQ, CTA를 포함한다.",
};

export interface ContentGenerationContext {
  organizationName: string;
  strategyTitle: string;
  targetProblem: string | null;
  coreMessage: string | null;
  contentDirection: string | null;
  funnelStep: string | null;
  productName: string | null;
  audience: string | null;
  brandCoreMessage: string | null;
  prohibitedExpressions: string[];
  decisionRuleHints: string[];
}

export async function generateContentForPlatform<P extends Platform>(
  platform: P,
  context: ContentGenerationContext
): Promise<PlatformContent[P]> {
  const schema = platformContentSchemas[platform] as unknown as z.ZodType<PlatformContent[P]>;

  const system = `당신은 중소기업 마케팅 콘텐츠 작성 AI다. 주어진 전략과 기업 데이터를 바탕으로 ${PLATFORM_BRIEF[platform]}
${PROMPT_INJECTION_GUARD}
브랜드의 금지 표현은 절대 사용하지 않는다. 과장 광고, 근거 없는 효능 주장을 하지 않는다. 실제 자료에 없는 수치나 통계를 지어내지 않는다.`;

  const prompt = `기업명: ${context.organizationName}
전략명: ${context.strategyTitle}
타깃 문제: ${context.targetProblem ?? "-"}
핵심 메시지: ${context.coreMessage ?? "-"}
콘텐츠 방향: ${context.contentDirection ?? "-"}
퍼널 단계: ${context.funnelStep ?? "-"}
상품: ${context.productName ?? "-"}
핵심 고객: ${context.audience ?? "-"}
브랜드 대표 메시지: ${context.brandCoreMessage ?? "-"}

${wrapReferenceContext(
  "기업 지침",
  `금지 표현: ${context.prohibitedExpressions.join(", ") || "없음"}\n참고할 의사결정 규칙: ${
    context.decisionRuleHints.join(" / ") || "없음"
  }`
)}

위 전략을 기준으로 콘텐츠를 생성하라.`;

  return generateStructured({ model: chatModel(), schema, system, prompt }) as Promise<PlatformContent[P]>;
}
