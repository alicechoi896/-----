import "server-only";
import { after } from "next/server";
import { LEARNING_PROFILES, LEARNING_PROFILE_OF, learningConfig, learningProfileId } from "@/lib/learning-config";
import { platformLabel } from "@/lib/publish-platforms";
import {
  LEARNING_CATEGORIES,
  type GeneratedContent,
  type GeneratedValue,
  type LearningInsight,
  type LearningProfile,
  type LearningProfileView,
  type LearningSummary,
} from "@/lib/types";
import { nowIso } from "@/lib/utils";
import { getSession } from "../auth";
import { AppError } from "../http";
import { getAIProvider } from "../providers/registry";
import { getCurrentUserId, getRepositories } from "../repositories";

/**
 * ★ Incremental Learning (docs/INCREMENTAL_LEARNING.md)
 *
 * 생성 결과 → 학습 신호(👍/👎·직접 수정·선택한 후보·★·업로드 완료·성과) → 새 신호가 10개 쌓이면
 * → 기존 학습 프로필 + 새 신호의 "요약본"만 AI 에 1번 보내 → 작은 Insight 목록으로 다시 압축 → 다음 생성에 경향으로 참고.
 *
 * - 팀 공통 프로필(채널·유형별 1행). 각 사용자는 RLS 로 자기 콘텐츠만 읽을 수 있으므로
 *   업데이트는 "그 사용자의 새 신호"로 공통 프로필을 고친다. 반영 시각은 사람마다 따로(userCursors) 둔다.
 * - 피드백이 없는 콘텐츠(테스트로 만들고 안 쓴 것)는 학습하지 않는다.
 * - 원문 전체를 보내지 않는다 (영상: 제목·Hook·구조·CTA / 블로그: 제목·도입부·소제목·마무리).
 * - 실패해도 생성 기능에는 영향이 없다 (호출하는 쪽에서 after() 로 돌리고 오류는 lastError 에만 남긴다).
 */

type Signal = { contentId: string; kind: "up" | "down" | "edit" | "pick" | "exemplar" | "published" | "performance"; at: string; detail?: string };

const PROFILE_KEYS = LEARNING_PROFILES.map((p) => learningProfileId(p.channelId, p.contentType));
const featuresOf = (id: string) => Object.entries(LEARNING_PROFILE_OF).filter(([, v]) => learningProfileId(v.channelId, v.contentType) === id).map(([f]) => f);
export const profileIdForFeature = (featureId: string) => {
  const p = LEARNING_PROFILE_OF[featureId];
  return p ? learningProfileId(p.channelId, p.contentType) : null;
};

/* ───────── 요약 (원문 대신) ───────── */

const asText = (v: GeneratedValue | undefined) => (Array.isArray(v) ? v.join(" / ") : (v ?? ""));
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

/** 사용자 수정본이 있으면 그것을 기준으로 본다 */
export function effectiveOutput(c: GeneratedContent): Record<string, GeneratedValue> {
  const out = { ...c.output };
  for (const [k, e] of Object.entries(c.context.userEdits ?? {})) out[k] = e.value;
  return out;
}

/** 콘텐츠 1개 요약 (학습·좋은 예시 공용) */
export function compressContent(c: GeneratedContent, maxChars = 600): string {
  const o = effectiveOutput(c);
  const firstOf = (v: GeneratedValue | undefined) => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));
  const picked = c.context.picks?.titles?.values?.[0];
  const title = picked ?? (firstOf(o.titles) || firstOf(o.title) || c.headline);
  const lines: string[] = [`제목: ${title}`];
  if (c.channelId === "naver-blog") {
    const body = String(o.body ?? "");
    lines.push(`도입부: ${cut(body.replace(/\s+/g, " ").trim(), 180)}`);
    if (o.headings) lines.push(`소제목: ${cut(asText(o.headings), 160)}`);
    const tail = body.trim().split("\n").filter(Boolean).slice(-2).join(" ");
    if (tail) lines.push(`마무리: ${cut(tail, 120)}`);
  } else {
    const hook = firstOf(o.hooks) || firstOf(o.hook);
    if (hook) lines.push(`Hook: ${cut(hook, 80)}`);
    const scripts = Array.isArray(o.script) ? o.script : o.script ? [String(o.script)] : [];
    const pickedScript = c.context.picks?.script?.values?.[0];
    const script = String(pickedScript ?? scripts[0] ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
    if (script.length) lines.push(`대본 흐름(${script.length}줄): ${cut(script.slice(0, 6).join(" / "), 220)}`);
    const cta = firstOf(o.ctas) || firstOf(o.cta);
    if (cta) lines.push(`CTA: ${cut(cta, 80)}`);
  }
  return cut(lines.join("\n"), maxChars);
}

/* ───────── 신호 모으기 ───────── */

async function collectSignals(userId: string, profileId: string, since: string | null) {
  const repo = getRepositories();
  const features = new Set(featuresOf(profileId));
  const contents = await repo.contents.list((c) => c.userId === userId && features.has(c.featureId));
  const ids = new Set(contents.map((c) => c.id));
  const [feedback, publications, performance] = await Promise.all([
    repo.feedback.list((f) => ids.has(f.contentId)),
    repo.publications.list((p) => Boolean(p.contentId && ids.has(p.contentId)) && p.status === "published"),
    repo.performance.list((m) => ids.has(m.contentId)),
  ]);
  const after = (at: string) => !since || at > since;
  const signals: Signal[] = [];
  for (const f of feedback) if (after(f.createdAt)) signals.push({ contentId: f.contentId, kind: f.rating, at: f.createdAt, detail: f.reason ?? undefined });
  for (const p of publications) {
    const at = p.publishedAt ?? p.updatedAt;
    if (after(p.updatedAt)) signals.push({ contentId: p.contentId!, kind: "published", at, detail: platformLabel(p.platform) });
  }
  // 조회수는 같은 유형 콘텐츠끼리 비교한다 (콘텐츠별 최고 조회수의 중앙값 기준)
  const tier = performanceTiers(performance);
  for (const m of performance)
    if (after(m.measuredAt))
      signals.push({
        contentId: m.contentId,
        kind: "performance",
        at: m.measuredAt,
        detail: [m.views != null && `조회 ${m.views}`, tier.get(m.contentId), m.ctr != null && `CTR ${m.ctr}%`, m.conversions != null && `전환 ${m.conversions}`, m.source === "manual" && "직접 입력"]
          .filter(Boolean)
          .join(" "),
      });
  for (const c of contents) {
    for (const [k, e] of Object.entries(c.context.userEdits ?? {})) if (after(e.at)) signals.push({ contentId: c.id, kind: "edit", at: e.at, detail: `${k} ${Math.round(e.ratio * 100)}% 수정` });
    for (const [k, p] of Object.entries(c.context.picks ?? {})) if (after(p.at)) signals.push({ contentId: c.id, kind: "pick", at: p.at, detail: `${k}: ${p.values.join(" / ")}` });
    if (c.isExemplar && after(c.createdAt)) signals.push({ contentId: c.id, kind: "exemplar", at: c.createdAt });
  }
  return { signals, contents, feedback, performance };
}

const recencyWeight = (at: string) => {
  const days = (Date.now() - new Date(at).getTime()) / 86_400_000;
  const r = learningConfig.recency;
  return days <= r.recentDays ? r.recentWeight : days <= r.midDays ? r.midTermWeight : r.oldWeight;
};

/* ───────── 프로필 정리 ───────── */

function emptyProfile(channelId: string, contentType: "product" | "info"): LearningProfile {
  const now = nowIso();
  return {
    id: learningProfileId(channelId, contentType),
    channelId,
    contentType,
    summaryJson: {},
    previousSummaryJson: null,
    version: 0,
    sampleCount: 0,
    positiveCount: 0,
    negativeCount: 0,
    userCursors: {},
    lastProcessedAt: null,
    lastError: null,
    updatedBy: null,
    updatedByName: "",
    createdAt: now,
    updatedAt: now,
  };
}

const normKey = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** AI 결과를 믿지 않고 다시 정리: 길이·숫자 범위·중복·개수 제한 */
export function sanitizeSummary(raw: unknown, previous: LearningSummary): LearningSummary {
  const out: LearningSummary = {};
  const data = (raw ?? {}) as Record<string, unknown>;
  const now = nowIso();
  for (const cat of LEARNING_CATEGORIES) {
    const prevByKey = new Map((previous[cat] ?? []).map((i) => [normKey(i.text), i]));
    const list = Array.isArray(data[cat]) ? (data[cat] as Record<string, unknown>[]) : [];
    const seen = new Set<string>();
    const cleaned: LearningInsight[] = [];
    for (const item of list) {
      const text = String(item?.text ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
      const key = normKey(text);
      if (!text || seen.has(key)) continue;
      seen.add(key);
      const num = (v: unknown) => Math.max(0, Math.min(10_000, Math.round(Number(v) || 0)));
      const support = Math.max(1, num(item.support_count));
      // 근거가 1개뿐이면 강한 Insight 로 만들지 않는다
      const conf = Math.max(0, Math.min(support < 2 ? 0.4 : 1, Number(item.confidence) || 0));
      cleaned.push({
        text,
        support_count: support,
        positive_count: num(item.positive_count),
        negative_count: num(item.negative_count),
        confidence: Math.round(conf * 100) / 100,
        last_seen_at: prevByKey.has(key) && item.updated === false ? prevByKey.get(key)!.last_seen_at : now,
      });
    }
    cleaned.sort((a, b) => b.confidence * recencyWeight(b.last_seen_at) - a.confidence * recencyWeight(a.last_seen_at));
    if (cleaned.length) out[cat] = cleaned.slice(0, learningConfig.maxInsightsPerCategory);
  }
  return out;
}

const insightCount = (s: LearningSummary) => LEARNING_CATEGORIES.reduce((n, c) => n + (s[c]?.length ?? 0), 0);

/** 생성 프롬프트에 넣을 Insight (근거·신뢰도 기준을 넘는 것만, 글자 수 제한) */
export function promptInsights(p: LearningProfile | null): { category: string; text: string; confidence: number }[] {
  if (!p) return [];
  const all = LEARNING_CATEGORIES.flatMap((cat) =>
    (p.summaryJson[cat] ?? [])
      .filter((i) => i.support_count >= learningConfig.minSupportForPrompt && i.confidence >= learningConfig.minConfidenceForPrompt)
      .map((i) => ({ category: cat, text: i.text, confidence: i.confidence * recencyWeight(i.last_seen_at) })),
  ).sort((a, b) => b.confidence - a.confidence);
  const picked: typeof all = [];
  let chars = 0;
  for (const i of all) {
    if (chars + i.text.length + 20 > learningConfig.promptCharLimit) break;
    picked.push(i);
    chars += i.text.length + 20;
  }
  return picked;
}

const LEARNING_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [...LEARNING_CATEGORIES],
  properties: Object.fromEntries(
    LEARNING_CATEGORIES.map((c) => [
      c,
      {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["text", "support_count", "positive_count", "negative_count", "confidence", "updated"],
          properties: {
            text: { type: "string" },
            support_count: { type: "number" },
            positive_count: { type: "number" },
            negative_count: { type: "number" },
            confidence: { type: "number" },
            updated: { type: "boolean" },
          },
        },
      },
    ]),
  ),
};

const LEARNING_SYSTEM = [
  "당신은 콘텐츠 성과 분석가다. 기존 학습 프로필과 새로 쌓인 학습 신호를 보고, 다음 콘텐츠 생성에 참고할 '경향'을 작은 JSON 으로 정리한다.",
  "규칙:",
  `1. 각 항목(title_insights, hook_insights, structure_insights, cta_insights, keyword_insights, positive_traits, negative_traits, style_adjustments)은 최대 ${learningConfig.maxInsightsPerCategory}개. 문장은 60자 이내로 짧고 구체적으로.`,
  "2. 기존 Insight 와 비슷한 것은 새로 추가하지 말고 합친다 (support_count·positive_count·negative_count 를 더하고 confidence 를 조정, updated=true). 새 신호와 관계없는 기존 Insight 는 그대로 두고 updated=false.",
  "3. 콘텐츠 1개에서만 보인 패턴은 confidence 0.4 이하. 여러 콘텐츠에서 반복될수록 confidence 를 높인다 (0~1).",
  "4. 신호의 강도: 직접 수정본 > 선택한 후보 > 👍·★·업로드 완료 > 성과 수치. 👎 와 그 사유는 negative_traits 로. 수정량이 적을수록 원래 결과가 잘 맞았다는 뜻이다.",
  "5. 성과(조회수 등)는 제품·시즌 영향이 있으니 한 콘텐츠의 수치만으로 강한 결론을 내리지 않는다. 다만 '잘된 영상'(같은 유형 중앙값의 2배 이상)으로 표시된 콘텐츠의 제목·Hook·대본 구조·CTA 는 강한 긍정 근거로, '반응 낮음'은 약한 부정 근거로 본다. 잘된 영상과 반응 낮은 영상의 차이를 positive_traits / negative_traits 에 적는다.",
  "6. 특정 제품명·수치 같은 사실은 넣지 않는다. 다른 콘텐츠에도 적용할 수 있는 일반적인 경향만 쓴다.",
  "7. 오래되고 근거가 약한 Insight 부터 지워 개수 제한을 지킨다. 응답은 지정된 JSON 형식으로만 한다.",
].join("\n");

/** 콘텐츠별 최고 조회수 → 같은 묶음 안의 상대 위치 (콘텐츠 2개 이상일 때만) */
export function performanceTiers(rows: { contentId: string; views: number | null }[]): Map<string, string> {
  const best = new Map<string, number>();
  for (const r of rows) if (r.views != null) best.set(r.contentId, Math.max(best.get(r.contentId) ?? 0, r.views));
  const out = new Map<string, string>();
  if (best.size < 2) return out;
  const sorted = [...best.values()].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 1;
  for (const [id, v] of best) {
    const ratio = v / median;
    out.set(id, ratio >= 2 ? `(잘된 영상 · 중앙값의 ${ratio.toFixed(1)}배)` : ratio <= 0.5 ? `(반응 낮음 · 중앙값의 ${ratio.toFixed(1)}배)` : "(보통)");
  }
  return out;
}

/**
 * 학습 신호가 생긴 뒤(피드백·★·직접 수정·선택·업로드 완료) 응답을 보낸 다음에 학습 여부를 확인한다.
 * 생성·저장 응답을 늦추거나 실패시키지 않는다.
 */
export function scheduleLearning(contentId: string | null | undefined) {
  if (!contentId) return;
  try {
    after(async () => {
      const c = await getRepositories().contents.get(contentId);
      if (c) await learningService.maybeUpdate(c.featureId);
    });
  } catch {
    /* 요청 밖(테스트 등)에서는 건너뛴다 */
  }
}

/* ───────── 서비스 ───────── */

export const learningService = {
  async get(profileId: string): Promise<LearningProfile | null> {
    return (await getRepositories().learningProfiles.get(profileId)) ?? null;
  },

  /** 화면: 6개 프로필 + 내 새 학습 데이터 수 */
  async list(): Promise<LearningProfileView[]> {
    const userId = await getCurrentUserId();
    const rows = await getRepositories().learningProfiles.list();
    return Promise.all(
      LEARNING_PROFILES.map(async (def) => {
        const id = learningProfileId(def.channelId, def.contentType);
        const p = rows.find((r) => r.id === id) ?? emptyProfile(def.channelId, def.contentType);
        const { signals } = await collectSignals(userId, id, p.userCursors?.[userId] ?? null);
        return { ...p, label: def.label, myPending: signals.length, threshold: learningConfig.updateThreshold };
      }),
    );
  },

  /** 생성·피드백 등이 끝난 뒤(after) 호출: 새 신호가 기준을 넘으면 업데이트. 실패해도 조용히 lastError 에만 */
  async maybeUpdate(featureId: string): Promise<void> {
    const profileId = profileIdForFeature(featureId);
    if (!profileId) return;
    try {
      const userId = await getCurrentUserId();
      const p = await this.get(profileId);
      const { signals } = await collectSignals(userId, profileId, p?.userCursors?.[userId] ?? null);
      if (signals.length >= learningConfig.updateThreshold) await this.update(profileId);
    } catch (e) {
      console.error("[learning] maybeUpdate failed", profileId, e instanceof Error ? e.message : e);
    }
  },

  /** 학습 업데이트 (자동 또는 [지금 학습 업데이트]). AI 1회 */
  async update(profileId: string): Promise<LearningProfile> {
    if (!PROFILE_KEYS.includes(profileId)) throw new AppError("NOT_FOUND", "학습 프로필을 찾을 수 없습니다.", 404);
    const repo = getRepositories();
    const session = await getSession();
    if (!session) throw new AppError("UNAUTHORIZED", "로그인이 필요합니다.", 401);
    const userId = session.user.id;
    const [channelId, contentType] = profileId.split(":") as [string, "product" | "info"];
    const current = (await this.get(profileId)) ?? emptyProfile(channelId, contentType);
    const since = current.userCursors?.[userId] ?? null;
    const { signals, contents } = await collectSignals(userId, profileId, since);
    if (!signals.length) throw new AppError("NO_SIGNALS", "새 학습 데이터가 없습니다. 결과에 👍/👎, 직접 수정, 제목 선택, 업로드 완료를 남기면 쌓입니다.");

    // 콘텐츠별로 신호를 묶고 최근 것부터 최대 N개 (요약본만)
    const byContent = new Map<string, Signal[]>();
    for (const s of signals) byContent.set(s.contentId, [...(byContent.get(s.contentId) ?? []), s]);
    const contentById = new Map(contents.map((c) => [c.id, c]));
    const samples = [...byContent.entries()]
      .map(([id, list]) => ({ c: contentById.get(id)!, list, at: list.map((s) => s.at).sort().at(-1)! }))
      .filter((x) => x.c)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, learningConfig.maxSamplesPerUpdate);
    const LABEL: Record<Signal["kind"], string> = { up: "👍", down: "👎", edit: "직접 수정", pick: "선택", exemplar: "★ 좋은 결과", published: "업로드 완료", performance: "성과" };
    const sampleText = samples
      .map((x, i) => {
        const sig = x.list.map((s) => `${LABEL[s.kind]}${s.detail ? `(${cut(s.detail, 100)})` : ""}`).join(", ");
        return `#${i + 1} [가중치 ${recencyWeight(x.at)}] 신호: ${sig}\n${compressContent(x.c)}`;
      })
      .join("\n\n");

    const ai = await getAIProvider();
    const result = await ai.generateStructured<Record<string, unknown>>({
      task: "learning-update",
      messages: [
        { role: "system", content: LEARNING_SYSTEM },
        {
          role: "user",
          content: [
            `[학습 프로필] ${profileId} (현재 v${current.version})`,
            "[기존 Insight]",
            JSON.stringify(current.summaryJson).slice(0, 6000),
            `[새 학습 신호 — 콘텐츠 ${samples.length}개, 신호 ${signals.length}개]`,
            sampleText,
          ].join("\n"),
        },
      ],
      outputKeys: [...LEARNING_CATEGORIES],
      jsonSchema: LEARNING_SCHEMA as unknown as Record<string, unknown>,
      variables: { profileId, previous: current.summaryJson, samples: samples.map((x) => ({ kinds: x.list.map((s) => s.kind), summary: compressContent(x.c) })) },
      maxTokens: 3000,
    });
    const summary = sanitizeSummary(result.data, current.summaryJson);

    // 그 사이 다른 사람이 업데이트했으면 이번 것은 버리고 다음에 다시 (덮어쓰기 방지)
    const latest = await this.get(profileId);
    if (latest && latest.version !== current.version) {
      throw new AppError("CONFLICT", "다른 팀원이 방금 학습 프로필을 업데이트했습니다. 잠시 후 다시 시도해 주세요.", 409);
    }
    const now = nowIso();
    const pos = signals.filter((s) => s.kind === "up" || s.kind === "exemplar" || s.kind === "published" || s.kind === "pick").length;
    const neg = signals.filter((s) => s.kind === "down").length;
    const next: LearningProfile = {
      ...current,
      summaryJson: summary,
      previousSummaryJson: current.version > 0 ? current.summaryJson : null,
      version: current.version + 1,
      sampleCount: current.sampleCount + samples.length,
      positiveCount: current.positiveCount + pos,
      negativeCount: current.negativeCount + neg,
      userCursors: { ...(current.userCursors ?? {}), [userId]: now },
      lastProcessedAt: now,
      lastError: null,
      updatedBy: userId,
      updatedByName: session.user.name,
      updatedAt: now,
    };
    if (latest) await repo.learningProfiles.update(profileId, next);
    else await repo.learningProfiles.insert(next);
    return next;
  },

  /** 직전 버전으로 되돌리기 (관리자) */
  async rollback(profileId: string): Promise<LearningProfile> {
    const session = await getSession();
    if (session?.role !== "admin") throw new AppError("FORBIDDEN", "관리자만 되돌릴 수 있습니다.", 403);
    const p = await this.get(profileId);
    if (!p?.previousSummaryJson) throw new AppError("VALIDATION", "되돌릴 이전 버전이 없습니다.");
    const updated = await getRepositories().learningProfiles.update(profileId, {
      summaryJson: p.previousSummaryJson,
      previousSummaryJson: null,
      version: p.version + 1,
      updatedBy: session.user.id,
      updatedByName: `${session.user.name} (되돌림)`,
      updatedAt: nowIso(),
    });
    return updated!;
  },

  insightCount,
};
