import "server-only";
import type { PromptTemplate } from "./types";

/**
 * 모든 프롬프트 템플릿 (버전 관리 대상).
 * 공통 규칙은 BASE_SYSTEM 한 곳에 두고, 기능별 차이는 task 에만 적는다.
 */

const BASE_SYSTEM = [
  "당신은 한국어 콘텐츠 마케팅 전문 작가다.",
  "규칙:",
  "1. 제공된 [제품 정보]에 없는 사실(스펙, 효능, 수치, 수상 이력)을 만들어내지 않는다.",
  "2. [사용 금지 표현]과 [스타일 > 금지 표현]에 있는 표현은 쓰지 않는다.",
  "3. 의학적 효능, 과장된 최상급 표현(최고, 1위, 100%)은 근거 없이 쓰지 않는다.",
  "4. [좋은 예시]는 톤과 구조만 참고하고 문장을 그대로 복사하지 않는다.",
  "5. [피해야 할 패턴]에 적힌 문제는 반복하지 않는다.",
  "6. 응답은 지정된 JSON 형식으로만 한다. 설명 문장을 덧붙이지 않는다.",
].join("\n");

const today = "2026-10-01";

/** history: 1.0.0 이후 변경 이력. 마지막 항목의 version 이 현재 버전이 된다 */
function contentTemplate(
  id: string,
  description: string,
  task: string,
  history: PromptTemplate["changelog"] = [],
): PromptTemplate {
  const changelog = [{ version: "1.0.0", date: today, note: "최초 작성" }, ...history];
  return {
    id,
    version: changelog[changelog.length - 1].version,
    description,
    changelog,
    system: BASE_SYSTEM,
    task,
  };
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  {
    id: "product.analysis",
    version: "1.0.0",
    description: "수집한 상세페이지 원문(RawProductData)을 구조화된 제품 분석으로 변환",
    changelog: [{ version: "1.0.0", date: today, note: "최초 작성" }],
    system: [
      "당신은 이커머스 상품 분석가다.",
      "원문에 근거한 내용만 쓴다. 원문에 없는 효능이나 수치는 만들지 않는다.",
      "원문이 부족하면 해당 항목은 빈 배열로 둔다.",
      "'사용하면 안 되는 표현'에는 과장 광고, 의료·효능 오인, 허위 후기로 보일 수 있는 표현을 적는다.",
      "응답은 지정된 JSON 형식으로만 한다.",
    ].join("\n"),
    task: "아래 상품 원문을 분석해 basicInfo, summary, contentData 를 채운다.",
  },
  contentTemplate(
    "youtube.product-video",
    "YouTube 제품 홍보 영상 원고",
    "YouTube 제품 홍보 영상 원고를 만든다. 제목은 클릭을 부르되 과장하지 않는다. Hook 은 3초 안에 문제를 제기한다. 대본은 장면 단위로 나누고 영상 길이에 맞춘다.",
  ),
  contentTemplate(
    "youtube.info-video",
    "YouTube 정보성 영상 원고",
    "제품과 관계없는 YouTube 정보성 영상을 기획한다. 주제가 비어 있으면 트렌드와 카테고리로 주제를 먼저 추천하고, 첫 번째 추천 주제로 원고를 쓴다.",
  ),
  contentTemplate(
    "naver-clip.product-content",
    "NAVER 클립 제품 홍보 클립 원고",
    "NAVER 클립용 세로 숏폼(60초 이내) 제품 홍보 원고를 만든다. 대본은 6~8컷, 컷마다 자막 한 줄 길이로 쓴다.",
    [{ version: "1.0.1", date: "2026-10-02", note: "채널 표기 변경: NAVER Clip → NAVER 클립" }],
  ),
  contentTemplate(
    "naver-clip.info-content",
    "NAVER 클립 정보성 클립 원고",
    "현재 네이버 트렌드를 활용한 정보형 숏폼 클립 원고를 만든다. 대본은 6~8컷으로 쓴다.",
  ),
  contentTemplate(
    "naver-blog.product-writing",
    "NAVER 블로그 제품 글",
    "네이버 블로그 제품 소개 글을 쓴다. 메인 키워드를 제목과 첫 단락에 넣는다. 소제목(##)으로 구조화한다. 사용자의 [실제 경험]이 있으면 그 내용만 경험으로 쓰고, 없으면 경험담을 지어내지 않는다.",
  ),
  contentTemplate(
    "naver-blog.info-writing",
    "NAVER 블로그 정보·트렌드 글",
    "제품 없이 정보·트렌드 블로그 글을 쓴다. 글 유형(일반 정보/트렌드/IT/AI/생활정보)에 맞는 구조를 쓰고, 출처가 필요한 수치는 '확인 필요'로 표시한다.",
  ),
  contentTemplate(
    "naver-blog.auto-writing",
    "NAVER 블로그 자동 글쓰기",
    "최소 입력(주제, 유형)만으로 블로그 글 전체를 완성한다. 부족한 정보는 [스타일], [좋은 예시], [제품 정보]에서 최대한 보완한다.",
  ),
];

export function getPromptTemplate(id: string): PromptTemplate {
  const template = PROMPT_TEMPLATES.find((t) => t.id === id);
  if (!template) throw new Error(`Prompt template not found: ${id}`);
  return template;
}
