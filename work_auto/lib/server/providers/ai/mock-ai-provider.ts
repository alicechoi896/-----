import "server-only";
import { findCatalogByTitle } from "@/lib/mock/product-catalog";
import type { OutputSection } from "@/lib/generators/types";
import type { ProductAnalysisContent, RawProductData } from "@/lib/types";
import type { GenerationContext } from "../../ai/context-types";
import { serverConfig } from "../../config";
import { contentText } from "../types";
import type {
  AIProvider,
  StructuredGenerationRequest,
  StructuredGenerationResult,
  TextGenerationRequest,
  TextGenerationResult,
} from "../types";
import { writeMockContent } from "./mock-writer";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Mock AI Provider — 외부 호출 없이 AIProvider 계약을 그대로 지킨다.
 * task 이름으로 분기해서 variables 를 보고 결정적인 결과를 만든다.
 * 실제 Provider 와 같은 입력(messages)을 받으므로, 프롬프트 조립 흐름은 실제와 동일하게 검증된다.
 */
export class MockAIProvider implements AIProvider {
  readonly id = "mock";
  readonly kind = "ai" as const;
  readonly label = "Mock AI";
  /** Mock 은 이미지를 읽을 수 없다 (상세페이지 이미지 읽기는 OpenAI 또는 Claude 연결 필요) */
  readonly supportsVision = false;
  readonly model = "mock-writer-v1";

  async testConnection() {
    return { ok: true, message: "Mock AI 는 항상 사용 가능합니다.", testedAt: new Date().toISOString(), mock: true };
  }

  async generateText(request: TextGenerationRequest): Promise<TextGenerationResult> {
    await sleep(serverConfig.mockLatencyMs);
    const last = contentText(request.messages.at(-1)?.content ?? "");
    return { text: `(Mock 응답) ${last.slice(0, 80)}`, provider: this.id, model: this.model };
  }

  async generateStructured<T extends Record<string, unknown>>(
    request: StructuredGenerationRequest,
  ): Promise<StructuredGenerationResult<T>> {
    await sleep(serverConfig.mockLatencyMs);
    const v = request.variables;

    if (request.task === "product-analysis") {
      const data = mockAnalyzeProduct(v.raw as RawProductData);
      return { data: data as unknown as T, provider: this.id, model: "mock-analyzer-v1" };
    }

    if (request.task === "learning-update") {
      // 데모: 신호 종류를 세어 그럴듯한 Insight 를 만든다 (기존 Insight 는 근거를 더한다)
      const prev = (v.previous ?? {}) as Record<string, { text: string; support_count: number; positive_count: number; negative_count: number; confidence: number }[]>;
      const samples = (v.samples ?? []) as { kinds: string[] }[];
      const pos = samples.filter((s) => s.kinds.some((k) => ["up", "exemplar", "published", "pick", "edit"].includes(k))).length;
      const neg = samples.filter((s) => s.kinds.includes("down")).length;
      const bump = (cat: string, text: string, p: number, n: number) => {
        const list = [...(prev[cat] ?? [])].map((i) => ({ ...i, updated: false }));
        const hit = list.find((i) => i.text === text);
        if (hit) Object.assign(hit, { support_count: hit.support_count + p + n, positive_count: hit.positive_count + p, negative_count: hit.negative_count + n, confidence: Math.min(0.95, hit.confidence + 0.1), updated: true });
        else if (p + n > 0) list.push({ text, support_count: p + n, positive_count: p, negative_count: n, confidence: p + n >= 2 ? 0.55 : 0.35, updated: true });
        return list;
      };
      const data = {
        title_insights: bump("title_insights", "숫자가 들어간 구체적인 제목을 많이 고름", pos, 0),
        hook_insights: bump("hook_insights", "첫 문장에서 문제를 바로 짚는 Hook 반응이 좋음", pos, 0),
        structure_insights: bump("structure_insights", "핵심 장점 2~3개로 짧게 정리한 구조 선호", pos, 0),
        cta_insights: bump("cta_insights", "부담 없는 저장·링크 확인 CTA 선호", pos, 0),
        keyword_insights: prev.keyword_insights ?? [],
        positive_traits: bump("positive_traits", "짧은 문장과 빠른 전개", pos, 0),
        negative_traits: bump("negative_traits", "긴 서론과 같은 표현 반복", 0, neg),
        style_adjustments: prev.style_adjustments ?? [],
      };
      return { data: data as unknown as T, provider: this.id, model: this.model };
    }

    if (request.task.startsWith("content-regenerate:")) {
      const data = writeMockContent({
        featureId: v.featureId as string,
        outputs: v.outputs as OutputSection[],
        input: v.input as Record<string, unknown>,
        context: v.context as GenerationContext,
      });
      const shuffle = <X,>(xs: X[]) => xs.map((x) => [Math.random(), x] as const).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
      if (v.append) {
        // 추가 만들기: 지금 목록과 겹치지 않는 새 후보 (데모라 표시를 붙인다)
        const tag = new Date().toLocaleTimeString("ko-KR", { hour12: false });
        const fresh = Object.fromEntries(
          Object.entries(data).map(([k, val]) => [k, Array.isArray(val) ? shuffle(val).map((x, i) => `${x} ${tag}-${i + 1}`) : val]),
        );
        return { data: fresh as unknown as T, provider: this.id, model: this.model };
      }
      const remixed = Object.fromEntries(
        Object.entries(data).map(([k, val]) => [k, Array.isArray(val) ? shuffle(val) : typeof val === "string" ? `${val}\n\n(다시 만든 데모 결과 ${new Date().toLocaleTimeString("ko-KR")})` : val]),
      );
      return { data: remixed as unknown as T, provider: this.id, model: this.model };
    }

    if (request.task.startsWith("content:")) {
      const data = writeMockContent({
        featureId: v.featureId as string,
        outputs: v.outputs as OutputSection[],
        input: v.input as Record<string, unknown>,
        context: v.context as GenerationContext,
      });
      return { data: data as unknown as T, provider: this.id, model: this.model };
    }

    if (request.task === "youtube-video-analysis") {
      return { data: mockVideoAnalysis(v.video as MockVideo) as unknown as T, provider: this.id, model: this.model };
    }

    if (request.task === "style-type-examples") {
      // 데모: 고른 유형의 예시를 번갈아 (부족하면 번호를 붙여 다르게)
      const types = (v.types as { label: string; examples: string[] }[]) ?? [];
      const pool = types.flatMap((t) => t.examples.map((e, i) => ({ e, i })));
      pool.sort((a, b) => a.i - b.i);
      const stamp = new Date().toLocaleTimeString("ko-KR", { hour12: false });
      const items = Array.from({ length: 10 }, (_, n) => (pool.length ? `${pool[n % pool.length].e}${n >= pool.length ? ` (${Math.floor(n / pool.length) + 1})` : ""} · 데모 ${stamp}` : `예시 ${n + 1}`));
      return { data: { items } as unknown as T, provider: this.id, model: this.model };
    }

    if (request.task === "style-extract") {
      return { data: mockStyleExtract(String(v.text ?? "")) as unknown as T, provider: this.id, model: this.model };
    }

    if (request.task === "youtube-trend-topics") {
      return { data: mockTrendTopics(v.videos as MockVideo[], v.keywords as string[]) as unknown as T, provider: this.id, model: this.model };
    }

    throw new Error(`MockAIProvider: 지원하지 않는 task 입니다 (${request.task})`);
  }
}

interface MockVideo {
  title: string;
  channelSubscribers: number;
  views: number;
  viewsPerDay: number;
  format: "shorts" | "long";
  tags: string[];
}

function mockVideoAnalysis(video: MockVideo) {
  const ratio = video.views / Math.max(video.channelSubscribers, 1);
  const main = video.tags[0] ?? video.title.split(/\s+/)[0];
  return {
    reasons: [
      `구독자 ${video.channelSubscribers.toLocaleString("ko-KR")}명 대비 조회수 ${ratio.toFixed(1)}배 → 구독자 밖 추천 유입이 컸을 가능성이 큽니다.`,
      `하루 평균 ${video.viewsPerDay.toLocaleString("ko-KR")}회 조회 → 게시 직후 반응이 빨랐습니다.`,
      /\d/.test(video.title) ? "제목에 숫자가 있어 내용 범위가 분명하고 클릭 부담이 적습니다." : "제목이 시청자의 상황을 직접 짚어 공감을 부릅니다.",
      video.format === "shorts" ? "짧은 Shorts 형식이라 끝까지 보는 비율이 높았을 가능성이 있습니다." : "충분한 길이로 정리형 정보를 담아 저장·공유하기 좋습니다.",
    ],
    titleSuggestions: [
      `${main} 처음이라면 이것부터 확인하세요`,
      `${main} 3가지 비교, 직접 써 보고 정리했습니다`,
      `${main} 하기 전에 알았으면 좋았을 것`,
      `10분 만에 끝내는 ${main} 정리`,
      `${main}, 이렇게 하면 실패하지 않습니다`,
    ],
    keywords: [...new Set([...video.tags.slice(0, 6), `${main} 추천`, `${main} 방법`])].slice(0, 8),
  };
}

/** 참고 자료의 문장 길이·어미·첫/마지막 문장으로 규칙 기반 스타일 초안을 만든다 */
function mockStyleExtract(text: string) {
  const sentences = text
    .split(/(?<=[.!?。]|요\s|다\s)\s*|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4);
  const avg = sentences.length ? Math.round(sentences.reduce((n, s) => n + s.length, 0) / sentences.length) : 20;
  const polite = /요[.!?\s]|니다/.test(text);
  const first = sentences[0] ?? "";
  const last = sentences.at(-1) ?? "";
  return {
    name: avg <= 20 ? "짧고 빠른 말투" : "차분한 설명형",
    tone: `${polite ? "존댓말" : "반말·구어체"}, 문장 평균 ${avg}자 내외`,
    description: avg <= 20 ? "짧은 문장을 빠르게 이어 리듬감을 만든다." : "배경 → 핵심 → 정리 순서로 차근차근 설명한다.",
    rules: [
      `한 문장은 ${Math.max(10, avg)}자 내외로 쓴다`,
      polite ? "존댓말(~요, ~니다)로 쓴다" : "친구에게 말하듯 편하게 쓴다",
      "첫 문장에서 독자의 상황이나 고민을 짚는다",
      "핵심은 3가지 이내로 정리한다",
    ],
    examplePhrases: sentences.slice(1, 4).map((s) => s.slice(0, 30)),
    hooks: [first.slice(0, 40) || "이거 모르면 손해예요", "딱 30초만 보시면 됩니다"],
    ctas: [last.slice(0, 40) || "도움이 됐다면 저장해 두세요", "궁금한 점은 댓글로 남겨 주세요"],
    titlePatterns: ["[제품] 사기 전에 꼭 알아야 하는 [숫자]가지", "아직도 [행동]하고 있다면 이것부터 확인하세요"],
    bannedPhrases: ["무조건", "역대급"],
  };
}

function mockTrendTopics(videos: MockVideo[], keywords: string[]) {
  const picks = (keywords.length ? keywords : videos.map((v) => v.tags[0] ?? v.title.split(/\s+/)[0])).slice(0, 6);
  const patterns = ["처음 시작하는 사람을 위한 정리", "직접 비교해 본 결과", "자주 하는 실수 5가지", "10분 루틴", "가격대별 추천", "모르면 손해인 꿀팁"];
  return {
    topics: picks.map((k, i) => ({
      title: `${k} ${patterns[i % patterns.length]}`,
      angle: `불러온 영상에서 '${k}' 관련 영상의 일평균 조회수가 높게 나타납니다.`,
      keywords: [k, `${k} 추천`, `${k} 방법`],
      format: i % 2 === 0 ? "shorts" : "long",
    })),
  };
}

/** 카탈로그에 있는 제품은 준비된 분석을, 없는 제품은 원문에서 규칙 기반으로 요약한다 */
function mockAnalyzeProduct(raw: RawProductData): ProductAnalysisContent {
  const known = findCatalogByTitle(raw.title);
  if (known) return structuredClone(known.analysis);

  const sentences = raw.descriptionText
    .split(/[.\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 3);
  const specs = Object.entries(raw.specs).map(([k, v]) => `${k} ${v}`);
  const features = (specs.length ? specs : sentences).slice(0, 5);
  const name = raw.title || "이름 없는 제품";
  const short = name.split(" ").slice(0, 2).join(" ");

  return {
    basicInfo: {
      name,
      brand: raw.brand ?? "미확인",
      category: raw.category ?? "미분류",
      seller: raw.seller ?? "직접 입력",
      url: raw.url ?? "",
    },
    summary: {
      oneLiner: sentences[0] ? `${sentences[0]}` : `${name} 제품`,
      keyFeatures: features,
      keyBenefits: sentences.slice(1, 4).length ? sentences.slice(1, 4) : ["원문에서 장점을 찾지 못했습니다. 직접 보완해 주세요."],
      differentiators: sentences.slice(4, 6),
      targetAudience: ["원문 정보가 부족합니다. 추천 대상을 직접 입력해 주세요."],
      buyingPoints: raw.price ? [`가격 ${raw.price.toLocaleString("ko-KR")}원`] : [],
      cautions: ["원문에 명시되지 않은 효능·효과는 쓰지 않습니다."],
    },
    contentData: {
      videoPoints: features.slice(0, 3).map((f) => `${f} 보여주기`),
      blogPoints: ["스펙 표 정리", "구매 전 확인 사항"],
      keywords: [short, `${short} 추천`, `${short} 후기`].filter(Boolean),
      hooks: [`${short}, 사기 전에 이것부터 보세요`],
      forbiddenExpressions: ["100% 효과", "최고", "완벽"],
    },
  };
}
