import "server-only";
import type { ChannelId, UserStyleInput } from "@/lib/types";
import { getPromptTemplate } from "../ai/prompts/templates";
import { AppError } from "../http";
import { getAIProvider } from "../providers/registry";

const strArray = { type: "array", items: { type: "string" } } as const;

const STYLE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["name", "tone", "description", "rules", "examplePhrases", "hooks", "ctas", "titlePatterns", "bannedPhrases"],
  properties: {
    name: { type: "string" },
    tone: { type: "string" },
    description: { type: "string" },
    rules: strArray,
    examplePhrases: strArray,
    hooks: strArray,
    ctas: strArray,
    titlePatterns: strArray,
    bannedPhrases: strArray,
  },
} as const;

/** 참고 자료 최대 길이 (AI 입력 비용 관리). 브라우저에서 읽은 텍스트만 받고 저장하지 않는다 */
export const MAX_REFERENCE_CHARS = 12_000;

const CHANNEL_HINT: Record<string, string> = {
  youtube: "YouTube 영상 (제목·대본)",
  "naver-clip": "NAVER 클립 세로 숏폼",
  "naver-blog": "NAVER 블로그 글",
};

/**
 * 참고 자료 → 나의 스타일 초안 (AI).
 * 결과는 바로 저장하지 않고 폼에 채워서 사용자가 고친 뒤 저장한다. 참고 자료 원문은 어디에도 저장하지 않는다.
 */
export const styleExtractor = {
  async extract(input: { text?: string; channelIds?: ChannelId[] }): Promise<UserStyleInput & { provider: string }> {
    const text = String(input.text ?? "").trim();
    if (text.length < 50) throw new AppError("VALIDATION", "참고 자료를 50자 이상 넣어 주세요. (글, 대본, 영상 제목·설명 등)");
    const reference = text.slice(0, MAX_REFERENCE_CHARS);
    const channelIds = (input.channelIds ?? []).filter((c) => c in CHANNEL_HINT);
    const template = getPromptTemplate("style.extract");
    const ai = await getAIProvider();
    const result = await ai.generateStructured<Record<string, unknown>>({
      task: "style-extract",
      messages: [
        { role: "system", content: template.system },
        {
          role: "user",
          content: [
            template.task,
            `[사용할 채널] ${channelIds.length ? channelIds.map((c) => CHANNEL_HINT[c]).join(", ") : "모든 채널"}`,
            text.length > MAX_REFERENCE_CHARS ? `(자료가 길어 앞부분 ${MAX_REFERENCE_CHARS.toLocaleString("ko-KR")}자만 보냅니다)` : "",
            "",
            "[참고 자료]",
            reference,
          ]
            .filter((l) => l !== "")
            .join("\n"),
        },
      ],
      outputKeys: ["name", "tone", "rules"],
      jsonSchema: STYLE_SCHEMA as unknown as Record<string, unknown>,
      variables: { text: reference },
      maxTokens: 2500,
    });
    const d = result.data;
    const list = (v: unknown, n: number) => (Array.isArray(v) ? v.map(String).map((s) => s.trim()).filter(Boolean).slice(0, n) : []);
    const draft: UserStyleInput = {
      name: String(d.name ?? "").trim().slice(0, 40) || "참고 자료 스타일",
      channelIds,
      tone: String(d.tone ?? "").trim(),
      description: String(d.description ?? "").trim(),
      rules: list(d.rules, 10),
      examplePhrases: list(d.examplePhrases, 8),
      hooks: list(d.hooks, 8),
      ctas: list(d.ctas, 6),
      titlePatterns: list(d.titlePatterns, 6),
      bannedPhrases: list(d.bannedPhrases, 8),
      isDefault: false,
    };
    if (!draft.rules.length) throw new AppError("AI_BAD_OUTPUT", "스타일을 뽑지 못했습니다. 자료를 조금 더 넣어 다시 시도해 주세요.", 502);
    return { ...draft, provider: `${result.provider}/${result.model}` };
  },
};
