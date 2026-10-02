import "server-only";
import type { OutputSection } from "@/lib/generators/types";
import type { GeneratedValue } from "@/lib/types";
import type { GenerationContext } from "../../ai/context-types";

/**
 * Mock 콘텐츠 작성기.
 * 실제 AI 없이도 "Context 가 결과에 반영되는 모습"을 보여주도록
 * 제품 분석, 스타일, 트렌드, 키워드, 정직성 가드레일을 사용해 결정적인 텍스트를 만든다.
 */

interface WriterInput {
  featureId: string;
  outputs: OutputSection[];
  input: Record<string, unknown>;
  context: GenerationContext;
}

const asString = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const asList = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
const uniq = (list: string[]) => Array.from(new Set(list.filter(Boolean)));
const hashtag = (s: string) => `#${s.replace(/\s+/g, "")}`;

export function writeMockContent({ featureId, outputs, input, context }: WriterInput): Record<string, GeneratedValue> {
  const p = context.product?.analysis;
  const productName = p?.basicInfo.name ?? "";
  const shortName = productName.split(" ").slice(0, 2).join(" ");
  const topic =
    asString(input.topic) || context.trend?.title || asString(input.mainKeyword) || asList(input.keywords)[0] || asString(input.category) || "오늘의 주제";
  const keywords = uniq([
    asString(input.mainKeyword),
    ...asList(input.keywords),
    ...asList(input.subKeywords),
    ...(p?.contentData.keywords ?? []),
    ...(context.trend?.keywords ?? []),
    asString(input.category),
  ]);
  const benefits = p?.summary.keyBenefits ?? [`${topic}의 핵심을 빠르게 이해할 수 있다`, "바로 따라 할 수 있는 방법을 정리했다", "자주 하는 실수를 피할 수 있다"];
  const features = p?.summary.keyFeatures ?? [];
  const phrase = context.style?.ctas[0] ?? context.style?.examplePhrases[0];
  const isClip = featureId.startsWith("clip");
  const isBlog = featureId.startsWith("blog");
  const experience = asString(input.experience);

  const hook =
    context.style?.hooks[0] ??
    p?.contentData.hooks[0] ??
    (context.trend ? `요즘 '${context.trend.title}' 검색이 급증한 이유, 30초로 정리합니다.` : `${topic}, 이것만 알면 됩니다.`);

  const titleCandidates = [
    p ? `${shortName}, 요즘 많이 찾는 이유 3가지` : `${topic}, 이것만 알면 충분합니다`,
    p ? `${p.summary.targetAudience[0] ?? "누구나"}라면 주목할 ${shortName}` : `${topic} 제대로 알아보기`,
    p ? `${keywords[0] ?? shortName} 고를 때 꼭 볼 3가지` : `요즘 다들 찾는 ${topic}, 핵심 정리`,
    p ? `${shortName} 스펙 한눈에 정리 (${features[0] ?? "핵심 기능"})` : `${topic} 초보자를 위한 가이드`,
    p ? `${p.summary.differentiators[0] ?? "차별점"}, ${shortName}` : `${topic} 자주 묻는 질문 5가지`,
  ];
  // 제목 패턴: 실제 AI 는 구조만 참고해 새로 쓰지만, 데모는 빈칸만 채워 "패턴이 반영되는 모습"을 보여 준다
  const fill = (pattern: string) =>
    pattern
      .replace(/\[(제품|제품명)\]/g, shortName || topic)
      .replace(/\[숫자\]/g, "3")
      .replace(/\[키워드\]/g, keywords[0] ?? topic)
      .replace(/\[대상\]/g, p?.summary.targetAudience[0] ?? "처음 알아보는 분")
      .replace(/\[행동\]/g, "검색만")
      .replace(/\[[^\]]{1,10}\]/g, topic);
  titleCandidates.push(
    ...(context.styleContext?.titlePatterns ?? []).map(fill),
    `${topic}, 처음이라면 이것부터`,
    `${shortName || topic} 실제로 따져 본 장단점`,
    `왜 다들 ${shortName || topic} 이야기를 할까`,
    `${keywords[1] ?? topic} 놓치기 쉬운 포인트`,
    `${topic} 한 번에 정리 (체크리스트)`,
  );
  titleCandidates.splice(0, titleCandidates.length, ...uniq(titleCandidates));

  // 대본: 말할 문장만 (장면·컷·시간 표시 없음)
  const scriptLines = isClip
    ? [
        hook,
        p ? `${shortName}, ${features[0] ?? "핵심 기능"}부터 볼게요.` : `${topic}, 핵심 하나만 짚을게요.`,
        benefits[0],
        benefits[1] ?? "두 번째 포인트도 있어요.",
        p?.summary.cautions[0] ? `다만 ${p.summary.cautions[0]}` : "주의할 점도 꼭 확인하세요.",
        phrase ?? "저장해 두고 필요할 때 보세요.",
      ]
    : [
        hook,
        p ? p.summary.oneLiner : `오늘은 ${topic}에 대해 핵심만 정리해 보겠습니다.`,
        ...(p?.contentData.videoPoints ?? ["먼저 기본 개념부터 볼게요.", "실제 예시로 확인해 보면 이렇습니다.", "따라 하는 방법은 어렵지 않습니다."]),
        `정리하면 ${benefits.slice(0, 3).join(", ")}입니다.`,
        p?.summary.cautions.length ? `다만 ${p.summary.cautions[0]}` : "상황에 따라 결과는 다를 수 있습니다.",
        phrase ?? "도움이 되셨다면 구독과 좋아요 부탁드립니다.",
      ];

  // 30개까지 채우는 키워드 (데모)
  const keywordPool = uniq([
    ...keywords,
    ...uniq([topic, shortName, keywords[0] ?? "", asString(input.category), topic.split(" ").slice(0, 2).join(" "), ...topic.split(" ").filter((w) => w.length >= 2)])
      .slice(0, 4)
      .flatMap((k) =>
        ["추천", "후기", "비교", "가격", "장단점", "사용법", "고르는 법", "2026", "정리", "꿀팁", "방법", "주의사항", "초보", "순위", "효과"].map((s) => `${k} ${s}`),
      ),
    ...(p?.contentData.keywords ?? []).map((k) => `${k} 추천`),
  ]);
  const hookPool = uniq([
    ...(context.styleContext?.hooks ?? []),
    hook,
    `${topic}, 이것만 알면 됩니다`,
    `아직도 ${topic} 이렇게 하세요?`,
    `${shortName || topic} 사기 전에 30초만 보세요`,
    `많이들 놓치는 ${topic} 포인트`,
    `결론부터 말할게요`,
    `3가지만 기억하세요`,
    `이건 직접 비교해 봤어요`,
    `요즘 ${topic} 많이 찾는 이유`,
    `처음이라면 꼭 보세요`,
  ]);
  const ctaPool = uniq([
    ...(context.styleContext?.ctas ?? []),
    "도움이 됐다면 저장해 두세요",
    "궁금한 점은 댓글로 남겨 주세요",
    "다음 영상도 놓치지 않으려면 구독해 주세요",
    p ? `${shortName} 정보는 설명란에서 확인하세요` : "자세한 내용은 설명란에 정리해 뒀어요",
    "비슷한 고민 하는 분께 공유해 주세요",
    "여러분 생각도 댓글로 알려 주세요",
    "좋아요 한 번이 큰 힘이 돼요",
    "관련 영상도 이어서 보세요",
    "알림 설정하면 새 영상 바로 받아 보실 수 있어요",
    "오늘 내용 요약은 고정 댓글에 있어요",
  ]);

  const disclosure = context.honestyGuard
    ? "※ 이 글은 제품 공식 정보와 공개된 스펙을 바탕으로 정리했습니다."
    : experience
      ? `※ 아래 내용에는 작성자가 직접 사용한 경험이 포함되어 있습니다.`
      : "";

  const headings = p
    ? [`${shortName}는 어떤 제품인가요?`, "주요 스펙 정리", "이런 분께 맞습니다", "구매 전 확인할 점", "한눈에 요약"]
    : [`${topic}란?`, "왜 지금 주목받을까", "핵심 정리 3가지", "자주 묻는 질문", "마무리 체크리스트"];

  const body = [
    disclosure,
    "",
    `${headings[0]}`,
    p ? `${p.summary.oneLiner}. ${p.basicInfo.brand}에서 판매하는 제품으로 ${p.basicInfo.seller}에서 구매할 수 있습니다.` : `${topic}에 대해 검색하는 분들이 가장 궁금해하는 내용을 순서대로 정리했습니다.`,
    "",
    `${headings[1]}`,
    ...(features.length ? features.map((f) => `- ${f}`) : benefits.map((b) => `- ${b}`)),
    "",
    `${headings[2]}`,
    ...(p?.summary.targetAudience ?? ["처음 알아보는 분", "빠르게 핵심만 알고 싶은 분"]).map((t) => `- ${t}`),
    ...(experience ? ["", "직접 사용해 본 경험", experience] : []),
    "",
    `${headings[3]}`,
    ...(p?.summary.cautions ?? ["상황에 따라 다를 수 있으니 공식 정보를 함께 확인하세요."]).map((c) => `- ${c}`),
    "",
    `${headings[4]}`,
    `${keywords.slice(0, 3).join(", ")}를 찾는 분이라면 위 내용을 기준으로 비교해 보세요.`,
  ].join("\n");

  const builders: Record<string, (count: number) => GeneratedValue> = {
    titles: (n) => titleCandidates.slice(0, n),
    title: () => titleCandidates[0],
    topics: (n) =>
      (context.trend
        ? [`${context.trend.title} 핵심 정리`, `${context.trend.title}, 사람들이 몰랐던 사실`, `${topic} 초보 가이드`]
        : [`${topic} 핵심 정리`, `${topic} 흔한 오해 3가지`, `${topic} 시작하는 법`]
      ).slice(0, n),
    hook: () => hook,
    hooks: (n) => hookPool.slice(0, n),
    ctas: (n) => ctaPool.slice(0, n),
    script: () => scriptLines.join("\n\n"),
    description: () =>
      [
        p ? `${p.summary.oneLiner}.` : `${topic}에 대해 핵심만 정리했습니다.`,
        "",
        p
          ? `이번 영상에서는 ${shortName}의 주요 기능과 실제로 쓸 때 확인할 점을 순서대로 살펴봅니다.`
          : `이번 영상에서는 ${topic}을(를) 처음 알아보는 분도 이해할 수 있게 핵심부터 차근차근 정리했습니다.`,
        "",
        ...benefits.slice(0, 3).map((b) => `✔ ${b}`),
        "",
        `이런 분께 추천합니다: ${(p?.summary.targetAudience ?? ["처음 알아보는 분", "빠르게 핵심만 알고 싶은 분"]).join(", ")}`,
        "",
        p?.summary.cautions.length ? `구매 전에 ${p.summary.cautions[0]} 부분은 꼭 확인해 보세요.` : "상황에 따라 다를 수 있으니 공식 정보도 함께 확인해 보세요.",
        "",
        "궁금한 점은 댓글로 남겨 주시면 다음 영상에서 답해 드릴게요.",
        "",
        context.honestyGuard && p ? "본 콘텐츠는 제품 공식 정보를 바탕으로 제작되었습니다." : "",
        isBlog ? "" : keywords.slice(0, 5).map(hashtag).join(" "),
      ]
        .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""))
        .join("\n")
        .trim(),
    keywords: (n) => keywordPool.slice(0, n),
    hashtags: (n) => keywordPool.slice(0, n).map(hashtag),
    tags: (n) => keywordPool.slice(0, n),
    body: () => withPhotoMarkers(body.trim(), asList(input.photos).length, headings),
    headings: (n) => headings.slice(0, n),
    benefits: (n) => benefits.slice(0, n),
    info: (n) =>
      p
        ? Object.entries(context.product?.analysis ? specsOf(context) : {})
            .map(([k, v]) => `${k}: ${v}`)
            .slice(0, n)
            .concat(p.summary.cautions.slice(0, 1).map((c) => `확인: ${c}`))
        : [],
    cta: () =>
      p ? `${shortName}의 최신 가격과 구성은 아래 링크에서 확인해 보세요.` : "도움이 되셨다면 공감과 이웃 추가 부탁드립니다.",
  };

  const result: Record<string, GeneratedValue> = {};
  for (const section of outputs) {
    const build = builders[section.key];
    result[section.key] = build ? build(section.count ?? 5) : `(${section.label} — Mock 출력)`;
  }
  return result;
}

function specsOf(context: GenerationContext): Record<string, string> {
  // 제품 분석에는 스펙 원문이 없으므로 핵심 특징을 "항목: 값" 형태로 바꿔서 쓴다
  const features = context.product?.analysis.summary.keyFeatures ?? [];
  return Object.fromEntries(features.map((f, i) => [`특징 ${i + 1}`, f]));
}

/** 데모: 소제목 아래 첫 문단 뒤에 사진 자리를 하나씩, 남는 사진은 끝에 넣는다 */
function withPhotoMarkers(body: string, count: number, headings: string[]): string {
  if (!count) return body;
  const lines = body.split("\n");
  const out: string[] = [];
  let next = 1;
  for (let i = 0; i < lines.length; i++) {
    out.push(lines[i]);
    const prev = lines[i - 1] ?? "";
    if (headings.includes(prev.trim()) && lines[i].trim() && next <= count) out.push("", `[사진${next++}]`);
  }
  while (next <= count) out.push("", `[사진${next++}]`);
  return out.join("\n");
}
