import "server-only";
import type { ChannelId, StyleSampleSnapshot, UserStyle } from "@/lib/types";

/**
 * ★ Style Context Builder — "나의 스타일"을 생성 1회분의 AI 지시로 바꾼다. (docs/STYLE_CONTEXT.md)
 *
 * AI Provider 와 무관하다. 여기서 만든 StyleContext 를 프롬프트 조립기(render.ts)가 블록으로 바꾸고,
 * 그 메시지를 기본 AI(Claude/OpenAI, getAIProvider)가 그대로 받는다.
 *
 * 항목별 역할
 *  - rules           반드시 지킨다         → 항상 전체 전달
 *  - bannedPhrases   절대 쓰지 않는다      → 항상 전체 전달
 *  - examplePhrases  말투 참고             → 10개 초과면 무작위 10개
 *  - hooks           도입부 설계 참고      → 10개 초과면 무작위 10개 (블로그는 도입 문장으로 재해석)
 *  - ctas            마무리 방식 참고      → 10개 초과면 무작위 10개 (블로그는 자연스러운 마무리로 재해석)
 *  - titlePatterns   제목 설득 구조 참고   → 10개 초과면 무작위 10개, AI 가 새 제목 후보 약 10개로 재해석
 */

/** 생성 1회에 AI 로 보내는 최대 개수. 이 값만 바꾸면 된다 */
export const STYLE_SAMPLE_CONFIG = {
  hooks: 10,
  ctas: 10,
  titlePatterns: 10,
  examplePhrases: 10,
  /** 생성 결과의 제목 후보 수 (안내 문구용. 실제 개수는 generator config 의 titles count) */
  titleCandidates: 10,
} as const;

export type StyleMedium = "video" | "blog";

export interface StyleContext {
  styleId: string;
  name: string;
  medium: StyleMedium;
  tone: string;
  description: string;
  /** 전체 */
  rules: string[];
  /** 전체 */
  bannedPhrases: string[];
  /** 아래 네 개는 표본 (많으면 무작위) */
  examplePhrases: string[];
  hooks: string[];
  ctas: string[];
  titlePatterns: string[];
  /** 저장된 전체 개수 (표본과 비교해 보여 주기용) */
  totals: { examplePhrases: number; hooks: number; ctas: number; titlePatterns: number };
}

/** NAVER 블로그는 글, 나머지(YouTube·NAVER 클립)는 영상 */
export function styleMediumOf(channelId: ChannelId | string): StyleMedium {
  return channelId === "naver-blog" ? "blog" : "video";
}

/** n 개 이하면 순서 그대로 전부, 많으면 무작위 n 개 (Fisher–Yates, 원래 순서로 정렬해 돌려준다) */
export function sampleItems<T>(items: readonly T[], n: number, random: () => number = Math.random): T[] {
  if (items.length <= n) return [...items];
  const idx = items.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx
    .slice(0, n)
    .sort((a, b) => a - b)
    .map((i) => items[i]);
}

export function buildStyleContext({
  style,
  channelId,
  random = Math.random,
}: {
  style: UserStyle;
  channelId: ChannelId | string;
  random?: () => number;
}): StyleContext {
  const c = STYLE_SAMPLE_CONFIG;
  const titlePatterns = style.titlePatterns ?? [];
  return {
    styleId: style.id,
    name: style.name,
    medium: styleMediumOf(channelId),
    tone: style.tone,
    description: style.description,
    rules: [...style.rules],
    bannedPhrases: [...style.bannedPhrases],
    examplePhrases: sampleItems(style.examplePhrases, c.examplePhrases, random),
    hooks: sampleItems(style.hooks, c.hooks, random),
    ctas: sampleItems(style.ctas, c.ctas, random),
    titlePatterns: sampleItems(titlePatterns, c.titlePatterns, random),
    totals: {
      examplePhrases: style.examplePhrases.length,
      hooks: style.hooks.length,
      ctas: style.ctas.length,
      titlePatterns: titlePatterns.length,
    },
  };
}

/** generated_contents.context 에 남길 "이번 생성에 실제로 보낸 스타일 표본" */
export function styleSnapshot(sc: StyleContext): StyleSampleSnapshot {
  return {
    styleId: sc.styleId,
    medium: sc.medium,
    hooks: sc.hooks,
    ctas: sc.ctas,
    titlePatterns: sc.titlePatterns,
    examplePhrases: sc.examplePhrases,
    rulesCount: sc.rules.length,
    bannedCount: sc.bannedPhrases.length,
    totals: sc.totals,
  };
}

const TITLE_RULES = [
  "숫자형·질문형·반전형·정보형 등 형태를 섞고, 같은 어미를 반복하지 않는다.",
  "제품명·핵심 키워드를 자연스럽게 넣는다.",
  "과장되거나 사실과 다른 표현, [제품 정보]에 없는 성능·효능 주장은 쓰지 않는다.",
];

/** 프롬프트 블록 (제목, 줄 목록). 영상과 블로그는 Hook·CTA·제목 패턴을 다르게 쓰도록 지시한다 */
export function renderStyleBlocks(sc: StyleContext): { title: string; lines: string[] }[] {
  const blog = sc.medium === "blog";
  const blocks: { title: string; lines: string[] }[] = [];

  blocks.push({
    title: "스타일",
    lines: [`이름: ${sc.name}`, sc.tone ? `톤: ${sc.tone}` : "", sc.description ? `설명: ${sc.description}` : ""],
  });
  if (sc.rules.length) blocks.push({ title: "스타일 > 규칙 (반드시 모두 지킨다)", lines: sc.rules });
  if (sc.bannedPhrases.length) blocks.push({ title: "스타일 > 금지 표현 (절대 쓰지 않는다)", lines: sc.bannedPhrases });
  if (sc.examplePhrases.length) {
    blocks.push({
      title: "스타일 > 자주 쓰는 표현 (사용자 말투 참고. 그대로 반복하지 말고 말투만 닮게 쓴다)",
      lines: sc.examplePhrases,
    });
  }

  if (sc.hooks.length) {
    blocks.push(
      blog
        ? {
            title: "스타일 > Hook (영상용 문장 — 블로그 도입부로 재해석)",
            lines: [
              "아래는 영상 첫 3초용 Hook 이다. 짧고 자극적인 문장을 블로그에 그대로 쓰지 않는다.",
              "같은 문제 제기·궁금증 방식을 자연스러운 블로그 도입 문장으로 바꿔 첫 단락에 쓴다. (예: '이거 아직도 모르세요?' → '이 기능을 모르고 사용하는 분들이 생각보다 많습니다.')",
              ...sc.hooks.map((h) => `참고 Hook: ${h}`),
            ],
          }
        : {
            title: "스타일 > Hook (영상 첫 부분 설계 참고)",
            lines: [
              "영상 첫 3초 Hook 을 설계할 때 아래 방식(문제 제기·궁금증·반전 등)을 참고해 현재 주제에 맞게 새로 쓴다. 문장을 그대로 복사하지 않는다.",
              ...sc.hooks.map((h) => `참고 Hook: ${h}`),
            ],
          },
    );
  }

  if (sc.ctas.length) {
    blocks.push(
      blog
        ? {
            title: "스타일 > CTA (영상용 문장 — 블로그 마무리로 재해석)",
            lines: [
              "아래는 영상용 행동 유도 문장이다. '고정댓글 확인하세요', '구독·좋아요' 같은 영상 표현을 블로그에 그대로 쓰지 않는다.",
              "글 마지막은 문맥에 맞게 자연스럽게 마무리한다: 다음 행동 안내, 제품 정보 확인, 관련 내용 추가 확인, 글 내용 정리 중 알맞은 방식.",
              ...sc.ctas.map((c) => `참고 CTA: ${c}`),
            ],
          }
        : {
            title: "스타일 > CTA (영상 마지막 행동 유도 참고)",
            lines: [
              "영상 마지막 행동 유도는 아래 방식을 참고해 상황에 맞게 응용한다. 문장을 그대로 복사하지 않는다.",
              ...sc.ctas.map((c) => `참고 CTA: ${c}`),
            ],
          },
    );
  }

  if (sc.titlePatterns.length) {
    blocks.push({
      title: blog ? "스타일 > 제목 패턴 (검색형 블로그 제목으로 재해석)" : "스타일 > 제목 패턴 (영상 제목 설득 구조 참고)",
      lines: [
        "아래 제목 패턴은 설득 구조를 참고하기 위한 예시다. 문장이나 표현을 그대로 복사하지 마라.",
        "현재 주제, 제품, 키워드, 타깃, 채널 특성에 맞게 완전히 새로운 제목으로 재해석하라.",
        blog
          ? `영상 제목 느낌을 복사하지 말고, 검색 키워드 + 사용자 검색 의도 + 패턴의 설득 구조를 결합해 검색형 블로그 제목 후보 약 ${STYLE_SAMPLE_CONFIG.titleCandidates}개를 만든다. 핵심 키워드는 제목 앞쪽에 둔다.`
          : `패턴의 설득 구조를 응용해 영상 제목 후보 약 ${STYLE_SAMPLE_CONFIG.titleCandidates}개를 만든다.`,
        ...TITLE_RULES,
        ...sc.titlePatterns.map((t) => `제목 패턴: ${t}`),
      ],
    });
  }
  return blocks;
}
