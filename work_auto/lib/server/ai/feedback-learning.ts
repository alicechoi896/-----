import "server-only";
import { createId, nowIso } from "@/lib/utils";
import { NO_RATING_RULE } from "@/lib/script-format";
import { AppError } from "../http";
import { getAIProvider } from "../providers/registry";
import { getCurrentUserId, getRepositories } from "../repositories";
import { videoStorage } from "../video/storage";

/**
 * 피드백 학습 (v0.9.164) — 결과 항목(제목·Hook·CTA·대본·섬네일 제목)마다 👍/👎.
 * 👎 + 이유 → [고치고 배우기] AI 1번: 왜 그렇게 나왔는지 + 고친 후보 3개 + 앞으로 지킬 규칙 한 줄 제안
 * 규칙은 사람이 [이 규칙 배우기]를 눌러야 저장되고(잘못된 규칙이 쌓이지 않게), 다음 생성부터 마지막 지시에 들어간다.
 * 항목별 켜진 규칙 최대 10개 (넘으면 가장 오래된 것을 끈다). 저장: {owner}/ai/feedback-learning.json (DB 변경 없음)
 */
export const FEEDBACK_KEYS = ["titles", "hooks", "ctas", "script", "thumbnailTitles"] as const;
export type FeedbackKey = (typeof FEEDBACK_KEYS)[number];
export const FEEDBACK_LABEL: Record<FeedbackKey, string> = { titles: "제목", hooks: "Hook", ctas: "CTA", script: "대본", thumbnailTitles: "섬네일 제목" };
export const DOWN_REASONS = ["너무 길다", "과장됐다", "포맷이랑 다르다", "제품이랑 안 맞다", "뻔하다", "말투가 이상하다", "평점·후기 얘기", "궁금하지 않다"] as const;
const MAX_ACTIVE = 10;

export interface FeedbackItem {
  id: string;
  contentId: string;
  featureId: string;
  key: FeedbackKey;
  item: string;
  vote: "up" | "down";
  reasons: string[];
  note: string;
  why?: string;
  fixes?: string[];
  rule?: string;
  ruleId?: string | null;
  at: string;
}
export interface LearnedRule {
  id: string;
  key: FeedbackKey;
  text: string;
  on: boolean;
  fromFeedback: string | null;
  at: string;
}
interface Store {
  items: FeedbackItem[];
  rules: LearnedRule[];
}

const fileKey = (owner: string) => `${owner}/ai/feedback-learning.json`;
async function read(owner: string): Promise<Store> {
  const buf = await videoStorage.download(fileKey(owner)).catch(() => null);
  try {
    const s = buf ? (JSON.parse(buf.toString("utf8")) as Store) : null;
    return { items: s?.items ?? [], rules: s?.rules ?? [] };
  } catch {
    return { items: [], rules: [] };
  }
}
async function write(owner: string, s: Store) {
  await videoStorage.put(fileKey(owner), Buffer.from(JSON.stringify({ items: s.items.slice(0, 300), rules: s.rules.slice(0, 80) })), "application/json", "0");
}
const cleanKey = (v: unknown): FeedbackKey => {
  if (!FEEDBACK_KEYS.includes(v as FeedbackKey)) throw new AppError("VALIDATION", "피드백을 남길 수 없는 항목입니다.");
  return v as FeedbackKey;
};
const str = (v: unknown, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** 생성할 때 넣을 켜진 규칙 (항목별) */
export async function activeRules(owner: string): Promise<{ key: FeedbackKey; text: string }[]> {
  return (await read(owner).catch(() => ({ items: [], rules: [] }) as Store)).rules.filter((r) => r.on).map((r) => ({ key: r.key, text: r.text }));
}

function addRule(s: Store, key: FeedbackKey, text: string, fromFeedback: string | null): LearnedRule {
  const t = str(text, 200);
  if (!t) throw new AppError("VALIDATION", "규칙이 비어 있습니다.");
  const norm = (x: string) => x.replace(/\s+/g, "");
  const same = s.rules.find((r) => r.key === key && norm(r.text) === norm(t));
  if (same) {
    same.on = true;
    return same;
  }
  const rule: LearnedRule = { id: createId("rule"), key, text: t, on: true, fromFeedback, at: nowIso() };
  s.rules.unshift(rule);
  // 항목별 켜진 규칙은 최대 10개 — 넘으면 가장 오래된 것을 끈다
  const on = s.rules.filter((r) => r.key === key && r.on);
  for (const r of on.slice(MAX_ACTIVE)) r.on = false;
  return rule;
}

export const feedbackLearning = {
  async list() {
    const owner = await getCurrentUserId();
    const s = await read(owner);
    // 효과: 규칙을 만든 뒤 그 항목의 👎 비율 (전 / 후)
    const effect = s.rules.map((r) => {
      const same = s.items.filter((i) => i.key === r.key);
      const before = same.filter((i) => i.at < r.at);
      const after = same.filter((i) => i.at >= r.at);
      const rate = (l: FeedbackItem[]) => (l.length ? Math.round((l.filter((i) => i.vote === "down").length / l.length) * 100) : null);
      return { ruleId: r.id, before: rate(before), after: rate(after), afterN: after.length };
    });
    return { ...s, effect, reasons: DOWN_REASONS };
  },

  /** 👍 (이유 선택) */
  async up(input: { contentId?: unknown; key?: unknown; item?: unknown; note?: unknown }) {
    const owner = await getCurrentUserId();
    const content = await getRepositories().contents.get(String(input.contentId ?? ""));
    if (!content || content.userId !== owner) throw new AppError("NOT_FOUND", "콘텐츠를 찾을 수 없습니다.", 404);
    const s = await read(owner);
    const it: FeedbackItem = { id: createId("fb"), contentId: content.id, featureId: content.featureId, key: cleanKey(input.key), item: str(input.item, 1500), vote: "up", reasons: [], note: str(input.note, 300), at: nowIso() };
    s.items.unshift(it);
    await write(owner, s);
    return it;
  },

  /** 👎 + 이유 → [고치고 배우기] (AI 1번): 왜 + 고친 후보 3개 + 규칙 제안. 규칙은 아직 저장하지 않는다 */
  async critique(input: { contentId?: unknown; key?: unknown; item?: unknown; reasons?: unknown; note?: unknown }) {
    const owner = await getCurrentUserId();
    const repo = getRepositories();
    const content = await repo.contents.get(String(input.contentId ?? ""));
    if (!content || content.userId !== owner) throw new AppError("NOT_FOUND", "콘텐츠를 찾을 수 없습니다.", 404);
    const key = cleanKey(input.key);
    const item = str(input.item, 1500);
    if (!item) throw new AppError("VALIDATION", "피드백할 결과가 없습니다.");
    const reasons = (Array.isArray(input.reasons) ? input.reasons : []).map((r) => str(r, 40)).filter(Boolean).slice(0, 8);
    const note = str(input.note, 300);
    if (!reasons.length && !note) throw new AppError("VALIDATION", "무엇이 별로인지 하나 이상 골라 주세요.");
    const label = FEEDBACK_LABEL[key];
    const ctx = content.context;
    const why0 = ctx.quality?.reasons?.[key]?.[item] ?? null;
    const ref = key === "titles" || key === "hooks" ? (ctx.quality?.formatRefs?.[key]?.[item] ?? null) : null;
    const s = await read(owner);
    const rules = s.rules.filter((r) => r.on && r.key === key).map((r) => r.text);
    const ai = await getAIProvider();
    let out: { why: string; fixes: string[]; rule: string };
    if (ai.id === "mock") {
      out = { why: `${reasons[0] ?? "요청"} — 제품 사실을 앞세우느라 ${label}의 첫마디가 약했습니다.`, fixes: [1, 2, 3].map((n) => `${item.slice(0, 20)} (고친 ${n})`), rule: `${label}은 ${reasons[0] ?? note}지 않게 쓴다.` };
    } else {
      const r = await ai.generateStructured<{ why: string; fixes: string[]; rule: string }>({
        task: "feedback-critique",
        messages: [
          { role: "system", content: "당신은 한국 숏폼 원고 편집장이다. 사용자가 별로라고 한 결과를 보고 원인을 솔직하게 분석하고, 바로 쓸 수 있게 고치고, 다음에 같은 실수를 하지 않을 규칙 한 줄을 만든다. 답은 JSON 하나, 존댓말 한국어." },
          {
            role: "user",
            content: [
              `[항목] ${label}`,
              `[별로라고 한 결과] ${item}`,
              `[사용자가 고른 이유] ${reasons.join(", ") || "(없음)"}${note ? ` / 직접 적은 말: ${note}` : ""}`,
              ctx.product?.name ? `[제품] ${ctx.product.name}` : "",
              ctx.scriptFormat?.name ? `[쓴 대본 포맷] ${ctx.scriptFormat.name}${ref ? ` — 이 결과가 따라 한 포맷 원문: "${ref}"` : ""}` : "",
              ctx.workflow?.selected?.title ? `[고른 제목] ${ctx.workflow.selected.title}` : "",
              why0 ? `[만들 때 AI 가 적은 이유] ${why0}` : "",
              rules.length ? `[이미 배운 규칙 — 겹치지 않게] ${rules.join(" / ")}` : "",
              "",
              `1) why: 왜 이렇게 나왔는지 1~2문장 (프롬프트·포맷·키워드·제품 사실 중 무엇에 끌려갔는지 추측해서 구체적으로).`,
              `2) fixes: 이유를 고친 새 ${label} 3개 (같은 형식·길이, 제품 사실 범위 안, ${NO_RATING_RULE})${key === "script" ? " — 대본은 줄바꿈(\\n)으로 한 줄 = 한 컷" : ""}.`,
              `3) rule: 앞으로 ${label}을 만들 때 지킬 규칙 한 줄 (구체적으로, 30자 안팎, '~한다/~하지 않는다'). 이 결과 하나에만 맞는 말은 피한다.`,
            ]
              .filter(Boolean)
              .join("\n"),
          },
        ],
        outputKeys: ["why", "fixes", "rule"],
        jsonSchema: { type: "object", additionalProperties: false, required: ["why", "fixes", "rule"], properties: { why: { type: "string" }, fixes: { type: "array", items: { type: "string" } }, rule: { type: "string" } } },
        variables: { key, item },
        maxTokens: key === "script" ? 2500 : 900,
      });
      out = r.data;
    }
    const it: FeedbackItem = {
      id: createId("fb"),
      contentId: content.id,
      featureId: content.featureId,
      key,
      item,
      vote: "down",
      reasons,
      note,
      why: str(out.why, 400),
      fixes: (out.fixes ?? []).map((f) => String(f).replace(/\\n/g, "\n").trim().slice(0, key === "script" ? 3000 : 200)).filter(Boolean).slice(0, 3),
      rule: str(out.rule, 200),
      ruleId: null,
      at: nowIso(),
    };
    s.items.unshift(it);
    await write(owner, s);
    return it;
  },

  /** [이 규칙 배우기] (피드백에서 온 규칙 또는 직접 적은 규칙) */
  async learn(input: { feedbackId?: unknown; key?: unknown; text?: unknown }) {
    const owner = await getCurrentUserId();
    const s = await read(owner);
    const fb = input.feedbackId ? s.items.find((i) => i.id === String(input.feedbackId)) : undefined;
    const key = cleanKey(fb?.key ?? input.key);
    const rule = addRule(s, key, String(input.text ?? fb?.rule ?? ""), fb?.id ?? null);
    if (fb) fb.ruleId = rule.id;
    await write(owner, s);
    return rule;
  },

  async setRule(input: { id?: unknown; on?: unknown; text?: unknown; remove?: unknown }) {
    const owner = await getCurrentUserId();
    const s = await read(owner);
    const r = s.rules.find((x) => x.id === String(input.id ?? ""));
    if (!r) throw new AppError("NOT_FOUND", "규칙을 찾을 수 없습니다.", 404);
    if (input.remove === true) s.rules = s.rules.filter((x) => x.id !== r.id);
    else {
      if (typeof input.on === "boolean") {
        r.on = input.on;
        if (r.on) for (const x of s.rules.filter((y) => y.key === r.key && y.on && y.id !== r.id).slice(MAX_ACTIVE - 1)) x.on = false;
      }
      if (typeof input.text === "string" && str(input.text, 200)) r.text = str(input.text, 200);
    }
    await write(owner, s);
    return { ok: true };
  },

  async removeItem(input: { id?: unknown }) {
    const owner = await getCurrentUserId();
    const s = await read(owner);
    s.items = s.items.filter((i) => i.id !== String(input.id ?? ""));
    await write(owner, s);
    return { ok: true };
  },

  /** 자주 나오는 불만 묶기 (AI 1번): 최근 👎 를 보고 규칙 후보 */
  async cluster() {
    const owner = await getCurrentUserId();
    const s = await read(owner);
    const downs = s.items.filter((i) => i.vote === "down").slice(0, 60);
    if (downs.length < 3) throw new AppError("VALIDATION", "별로예요가 3개 이상 쌓이면 묶을 수 있습니다.");
    const ai = await getAIProvider();
    if (ai.id === "mock") return { suggestions: [{ key: downs[0].key, text: `${FEEDBACK_LABEL[downs[0].key]}은 더 짧게 쓴다.`, count: downs.length }] };
    const r = await ai.generateStructured<{ suggestions: { key: string; text: string; count: number }[] }>({
      task: "feedback-cluster",
      messages: [
        { role: "system", content: "당신은 한국 숏폼 원고 편집장이다. 사용자의 '별로예요' 기록에서 반복되는 불만을 찾아 규칙으로 만든다. 답은 JSON 하나." },
        {
          role: "user",
          content: `[별로예요 기록]\n${downs.map((d) => `- (${d.key}) "${d.item.slice(0, 120)}" — 이유: ${[...d.reasons, d.note].filter(Boolean).join(", ")}`).join("\n")}\n[이미 배운 규칙] ${s.rules.filter((x) => x.on).map((x) => `(${x.key}) ${x.text}`).join(" / ") || "(없음)"}\n\n반복되는 불만을 3~5개로 묶어 규칙 후보를 만든다. key 는 titles·hooks·ctas·script·thumbnailTitles 중 하나, text 는 규칙 한 줄(30자 안팎), count 는 그 불만이 나온 횟수. 이미 배운 규칙과 같은 것은 빼고, 2번 이상 나온 것만.`,
        },
      ],
      outputKeys: ["suggestions"],
      jsonSchema: { type: "object", additionalProperties: false, required: ["suggestions"], properties: { suggestions: { type: "array", items: { type: "object", additionalProperties: false, required: ["key", "text", "count"], properties: { key: { type: "string" }, text: { type: "string" }, count: { type: "integer" } } } } } },
      variables: { n: downs.length },
      maxTokens: 900,
    });
    return { suggestions: (r.data.suggestions ?? []).filter((x) => FEEDBACK_KEYS.includes(x.key as FeedbackKey)).slice(0, 5) };
  },
};
