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

    // 2단계 생성 (데모)
    if (request.task.startsWith("content-stage1:")) {
      const data = writeMockContent({ featureId: v.featureId as string, outputs: v.outputs as OutputSection[], input: v.input as Record<string, unknown>, context: v.context as GenerationContext });
      const ki = (v.context as GenerationContext).keywordIntel;
      if (ki?.candidates.length && Array.isArray(data.titles)) data.titles = [...ki.candidates.slice(0, 3).map((c) => `${c.keyword}, 사기 전에 꼭 볼 3가지`), ...data.titles];
      const n = Array.isArray(data.titles) ? data.titles.length : 0;
      const title_top = [1, 2, 3, 4, 5].filter((i) => i <= n).map((index) => ({ index, reason: ["실제 영상에서 반복된 표현을 앞에 뒀다", "숫자로 구체적인 약속", "구매 판단에 바로 도움", "궁금증을 남긴다", "대상이 분명하다"][index - 1] }));
      return { data: { ...data, title_top } as unknown as T, provider: this.id, model: this.model };
    }
    if (request.task.startsWith("content-stage2:")) {
      const data = writeMockContent({ featureId: v.featureId as string, outputs: v.outputs as OutputSection[], input: v.input as Record<string, unknown>, context: v.context as GenerationContext });
      const sel = v.selected as { title: string; hook: string; cta: string };
      if (Array.isArray(data.script)) {
        data.script = data.script.map((sc, i) => {
          const lines = sc.split("\n");
          lines[0] = sel.hook || lines[0];
          lines[lines.length - 1] = sel.cta || lines[lines.length - 1];
          lines.splice(1, 0, `(${["문제 해결", "결론 먼저", "비교 판단"][i % 3]}) ${sel.title}`);
          return lines.join("\n");
        });
      }
      const ki = (v.context as GenerationContext).keywordIntel;
      const primary = ki?.candidates[0]?.keyword ?? sel.title.split(/[,\s]/)[0];
      const related = (ki?.candidates.slice(1, 8) ?? []).map((c) => ({ keyword: c.keyword, intent: "info" }));
      return {
        data: { ...data, primary_keyword: primary, related_keywords: related, script_structures: ["문제 해결형", "결론 선공개형", "비교·구매 판단형"] } as unknown as T,
        provider: this.id,
        model: this.model,
      };
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

    if (request.task === "social-title-translate") {
      // 데모: 자주 나오는 말만 바꾼다 (실제 AI 는 자연스러운 한국어로 옮긴다)
      const words: [RegExp, string][] = [
        [/无线吸尘器/g, "무선청소기"], [/手持吸尘器/g, "핸디 청소기"], [/吸尘器/g, "청소기"], [/空气炸锅/g, "에어프라이어"], [/真实测评/g, "솔직 리뷰"], [/测评/g, "리뷰"],
        [/开箱/g, "언박싱"], [/避坑指南|避坑/g, "후회 안 하는 법"], [/一周使用感受|使用一个月/g, "써 본 후기"], [/平价替代/g, "가성비 대안"], [/对比/g, "비교"],
        [/好物分享|好物推荐/g, "추천템"], [/使用技巧/g, "사용 꿀팁"], [/值不值得买|值得买吗/g, "살 만할까?"], [/租房必备|租房好物/g, "자취 필수템"], [/性价比/g, "가성비"],
        [/清洁技巧/g, "청소 꿀팁"], [/宿舍必备/g, "기숙사 필수템"], [/保姆级教程/g, "초보용 설명서"], [/抖音/g, ""],
      ];
      const items = ((v.items as { id: string; title: string }[]) ?? []).map((it) => ({
        id: it.id,
        translatedTitle: words.reduce((t, [re, ko]) => t.replace(re, ` ${ko} `), it.title).replace(/\s+/g, " ").trim(),
      }));
      return { data: { items } as unknown as T, provider: this.id, model: this.model };
    }

    if (request.task === "social-query-translate") {
      // 데모: 몇 단어만 사전으로 바꾼다 (중국어 1개만 쓴다)
      const k = String(v.keyword ?? "");
      if (k.includes("변환실패")) throw new Error("데모: 변환 실패");
      const dict: Record<string, [string, string, string]> = {
        다이슨: ["戴森 无线吸尘器", "Dyson 无线吸尘器", "Dyson cordless vacuum"],
        무선청소기: ["无线吸尘器", "手持吸尘器", "cordless vacuum"],
        에어프라이어: ["空气炸锅", "空气炸锅推荐", "air fryer"],
        마사지건: ["筋膜枪", "按摩枪", "massage gun"],
        가습기: ["加湿器", "家用加湿器", "humidifier"],
      };
      // 한국어 부분만 바꾸고 영어·숫자는 그대로 (데모)
      const words: Record<string, string> = { 갤럭시: "盖乐世", 아이폰: "iPhone", 다이슨: "戴森", 무선청소기: "无线吸尘器", 에어프라이어: "空气炸锅", 마사지건: "筋膜枪", 가습기: "加湿器", 리뷰: "测评", 추천: "推荐" };
      const zh = k
        .split(/\s+/)
        .map((w) => (/[가-힣]/.test(w) ? (Object.entries(words).find(([ko]) => w.includes(ko))?.[1] ?? Object.values(dict).find(() => false) ?? "好物") : w))
        .join(" ")
        .trim();
      return { data: { primary_zh: zh } as unknown as T, provider: this.id, model: this.model };
    }

    if (request.task === "script-format-extract") {
      // 데모: 참고 대본의 줄 수·글자 수·마무리 표현으로 간단한 포맷을 만든다
      const ex = (v.examples as { text: string }[]) ?? [];
      const lines = ex.map((e) => e.text.split("\n").filter((l) => l.trim()));
      const avgLines = Math.round(lines.reduce((s, l) => s + l.length, 0) / Math.max(1, lines.length)) || 10;
      const all = lines.flat();
      const avgLen = Math.round(all.reduce((s, l) => s + l.length, 0) / Math.max(1, all.length)) || 15;
      const product = v.contentType !== "info";
      const has = (re: RegExp) => ex.some((e) => re.test(e.text));
      const guideline = [
        "[구조]",
        product ? "1) Hook (1~2줄): [제품] + '아무거나 사면 후회' / '이거 모르면 손해' 처럼 손해·후회를 짚는다" : "1) Hook (1~2줄): '[주제], 결국 난리 났습니다' 처럼 사건·변화를 먼저 던진다",
        product ? "2) 핵심 정보 (3~5줄): 숫자가 들어간 스펙·장점 2~3개" : "2) 핵심 사실 (3~5줄): 무슨 일인지 숫자·출처와 함께",
        product ? "3) 비교·추천 대상 (1~2줄): 누구에게 맞는지, 다른 모델과 차이" : "3) 의미·영향 (1~2줄): 시청자에게 무엇이 달라지는지",
        has(/아래|링크|제품 ?보기|태그/) ? "4) CTA (1~2줄): '아래 제품 보기에서 확인하세요' 처럼 링크로 안내" : "4) CTA (1줄): 저장·댓글로 마무리",
        `[리듬] 한 줄 약 ${Math.max(5, avgLen - 4)}~${avgLen + 6}자, 전체 ${Math.max(6, avgLines - 2)}~${avgLines + 3}줄, 15~40초`,
        "[Hook 방식] 후회·손해 경고 / '이런 걸 왜 사지?' 같은 반문 / '믿어지세요?' 같은 놀람",
        "[CTA 방식] 아래 링크·제품 보기 안내, 가격 확인 유도",
        "[피할 것] 제품 정보에 없는 할인·배송 약속, '무조건'·'100%'·'역대급' 같은 단정 (근거가 있을 때만)",
      ].join("\n");
      return { data: { name: product ? "후회형 제품 쇼츠" : "이슈 요약 쇼츠", guideline } as unknown as T, provider: this.id, model: this.model };
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
