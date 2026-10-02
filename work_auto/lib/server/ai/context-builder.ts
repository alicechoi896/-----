import "server-only";
import type { GeneratorConfig } from "@/lib/generators/types";
import type { ChannelId, ContextSummary } from "@/lib/types";
import { formatNumber } from "@/lib/utils";
import { AppError } from "../http";
import { getRepositories } from "../repositories";
import { normalizeStyle } from "../services/memory";
import { trendService } from "../services/trends";
import type { GenerationContext } from "./context-types";
import { buildStyleContext, styleSnapshot } from "./style-context";
import { learningConfig } from "@/lib/learning-config";
import { compressContent, learningService, profileIdForFeature, promptInsights } from "../services/learning";

/**
 * ★ ContextBuilder — AI Memory 를 "생성 1회분"의 Context 로 조립한다.
 *
 * 원칙: AI 는 절대 빈 Context 로 호출하지 않는다.
 *   모든 생성은 이 함수를 거치고, 무엇이 들어갔는지(summary)를 결과와 함께 저장한다.
 *
 * 조립 순서와 개수 제한 (토큰 예산 관리)
 *   0. Content Profile     — 무엇을 다루는가. 고른 스타일에 연결된 프로필 → 없으면 기본 프로필 (docs/CONTENT_PROFILE.md)
 *   1. Product Memory      — 선택한 제품의 현재 분석 1건
 *   2. Style Memory        — 생성 폼에서 고른 스타일 1건. 고르지 않으면 이 채널의 기본 스타일 (없으면 "모든 채널" 기본 스타일)
 *                            → buildStyleContext(): Hook·CTA·제목 패턴·자주 쓰는 표현은 10개 초과면 무작위 10개, 규칙·금지 표현은 전부 (docs/STYLE_CONTEXT.md)
 *   3. 좋은 예시           — 긍정 결과 무작위 3 + 일반 1 (요약본, 최근에 쓴 예시는 덜 고름) + 팀 공통 학습 프로필 (docs/INCREMENTAL_LEARNING.md)
 *   4. Feedback            — 같은 기능의 "별로예요" 최근 3건 (피해야 할 패턴)
 *   5. Performance         — 같은 채널 성과 상위 2건
 *   6. Trend / 참고 영상   — 사용자가 고른 것
 * (docs/AI_LEARNING_SYSTEM.md)
 */

export const CONTEXT_LIMITS = { avoid: 3, performance: 2 } as const;

interface BuildParams {
  userId: string;
  featureId: string;
  channelId: ChannelId;
  config: GeneratorConfig;
  input: Record<string, unknown>;
}

export async function buildGenerationContext({ userId, featureId, channelId, config, input }: BuildParams): Promise<GenerationContext> {
  const repo = getRepositories();
  const notes: string[] = [];

  // 서로 관계없는 조회는 한 번에 병렬로 실행한다 (DB 왕복 횟수만큼 기다리지 않도록)
  const productId = config.productField ? String(input[config.productField] ?? "") : "";
  const trendId = config.trendField ? String(input[config.trendField] ?? "") : "";
  const videoId = String(input.referenceVideoId ?? "");
  const styleId = String(input.styleId ?? "");
  const pickedProfileId = String(input.profileId ?? "");

  const [productRow, styles, featureContents, featureFeedback, channelContents, performance, trend, referenceVideo, profiles] = await Promise.all([
    productId ? repo.products.get(productId) : Promise.resolve(null),
    repo.styles.list((s) => s.userId === userId && (s.isDefault || s.id === styleId)),
    repo.contents.list((c) => c.userId === userId && c.featureId === featureId),
    repo.feedback.list((f) => f.userId === userId && f.featureId === featureId),
    repo.contents.list((c) => c.userId === userId && c.channelId === channelId),
    repo.performance.list((m) => m.views != null),
    trendId ? trendService.findOption(trendId) : Promise.resolve(null),
    videoId ? repo.videos.get(videoId) : Promise.resolve(null),
    repo.contentProfiles.list((p) => p.userId === userId && p.isActive),
  ]);

  // 1) Product Memory — 저장된 분석을 그대로 쓴다 (상세페이지 재분석 없음)
  let product: GenerationContext["product"] = null;
  if (productId) {
    if (!productRow || productRow.userId !== userId) throw new AppError("PRODUCT_NOT_FOUND", "선택한 제품을 찾을 수 없습니다.", 404);
    const analysis = await repo.productAnalyses.get(productRow.currentAnalysisId);
    if (!analysis) throw new AppError("ANALYSIS_NOT_FOUND", "제품 분석 데이터가 없습니다. 상세페이지 학습을 다시 진행해 주세요.", 404);
    product = { product: productRow, analysis };
  }

  // 2) Style Memory
  const userStyles = styles.map(normalizeStyle);
  const picked = styleId ? (userStyles.find((s) => s.id === styleId) ?? null) : null;
  if (styleId && !picked) throw new AppError("STYLE_NOT_FOUND", "선택한 스타일을 찾을 수 없습니다. 삭제되었을 수 있습니다.", 404);
  const style =
    picked ??
    userStyles.find((s) => s.isDefault && s.channelIds.includes(channelId)) ??
    userStyles.find((s) => s.isDefault && s.channelIds.length === 0) ??
    null;
  if (!style) notes.push("기본 스타일 없음 → AI 학습 관리 > 나의 스타일에서 등록하면 결과가 일정해집니다.");
  const styleContext = style ? buildStyleContext({ style, channelId }) : null;

  // 0) Content Profile — 생성 폼에서 고른 프로필 → 스타일에 연결된 프로필 → 기본 프로필
  if (pickedProfileId && !profiles.some((p) => p.id === pickedProfileId)) {
    throw new AppError("PROFILE_NOT_FOUND", "선택한 콘텐츠 프로필을 찾을 수 없습니다. 삭제되었거나 사용 중이 아닐 수 있습니다.", 404);
  }
  const contentProfile =
    (pickedProfileId ? profiles.find((p) => p.id === pickedProfileId) : undefined) ??
    (style?.profileId ? profiles.find((p) => p.id === style.profileId) : undefined) ??
    profiles.find((p) => p.isDefault) ??
    profiles[0] ??
    null;
  if (!contentProfile) notes.push("콘텐츠 프로필 없음 → AI 학습 관리 > 콘텐츠 프로필에서 만들면 관심분야에 맞게 생성됩니다.");

  // 3) 좋은 예시 — 긍정 결과(★·👍·선택·업로드 완료·거의 안 고친 수정) 중 무작위 3 + 일반 1, 최근에 쓴 예시는 덜 고른다. 요약본만 보낸다
  const up = new Set(featureFeedback.filter((f) => f.rating === "up").map((f) => f.contentId));
  const down = new Set(featureFeedback.filter((f) => f.rating === "down").map((f) => f.contentId));
  const featureIds = new Set(featureContents.map((c) => c.id));
  const published = new Set(
    (await repo.publications.list((p) => p.status === "published" && Boolean(p.contentId && featureIds.has(p.contentId)))).map((p) => p.contentId!),
  );
  const ordered = [...featureContents].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const recentlyUsed = new Set(ordered.slice(0, learningConfig.examples.recentWindow).flatMap((c) => c.context.goodExampleIds ?? []));
  const isPositive = (c: (typeof featureContents)[number]) =>
    !down.has(c.id) &&
    (c.isExemplar || up.has(c.id) || published.has(c.id) || Boolean(c.context.picks && Object.keys(c.context.picks).length) ||
      Object.values(c.context.userEdits ?? {}).some((e) => e.ratio < 0.3));
  const weightOf = (c: (typeof featureContents)[number]) =>
    (c.isExemplar ? 1.5 : up.has(c.id) ? 1.3 : 1) * (recentlyUsed.has(c.id) ? learningConfig.examples.recentPenalty : 1);
  const positivePool = featureContents.filter(isPositive);
  const generalPool = featureContents.filter((c) => !isPositive(c) && !down.has(c.id));
  const positivePicks = weightedSample(positivePool, learningConfig.examples.positive, weightOf);
  const generalPicks = weightedSample(generalPool, learningConfig.examples.general, (c) => (recentlyUsed.has(c.id) ? learningConfig.examples.recentPenalty : 1));
  const exemplars = positivePicks;
  const examples = [
    ...positivePicks.map((c) => ({ id: c.id, kind: "positive" as const, text: compressContent(c, learningConfig.examples.maxCharsEach) })),
    ...generalPicks.map((c) => ({ id: c.id, kind: "general" as const, text: compressContent(c, learningConfig.examples.maxCharsEach) })),
  ];

  // 학습 프로필 (팀 공통). 없거나 읽기에 실패하면 학습 없이 생성한다
  const learningId = profileIdForFeature(featureId);
  const learningProfile = learningId ? await learningService.get(learningId).catch(() => null) : null;
  const insights = promptInsights(learningProfile);
  const learning = learningProfile && insights.length ? { id: learningProfile.id, version: learningProfile.version, insights } : null;

  // 4) Feedback — 별로예요 사유와 수정본
  const avoid = featureFeedback
    .filter((f) => f.rating === "down")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, CONTEXT_LIMITS.avoid)
    .map((f) => ({ reason: f.reason ?? "사유 없음", edited: f.editedOutput }));

  // 5) Performance — 같은 채널 성과 상위
  const contentById = new Map(channelContents.map((c) => [c.id, c]));
  const performanceHints = performance
    .filter((m) => contentById.has(m.contentId))
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, CONTEXT_LIMITS.performance)
    .map((m) => {
      const c = contentById.get(m.contentId)!;
      return `"${c.headline}" — 조회 ${formatNumber(m.views ?? 0)}${m.ctr != null ? `, CTR ${m.ctr}%` : ""}`;
    });

  // 6) Trend / 참고 영상: 위에서 함께 조회함

  // 정직성 가드레일: 제품 콘텐츠인데 실제 경험이 없으면 활성화
  const experience = config.experienceField ? String(input[config.experienceField] ?? "").trim() : "";
  const honestyGuard = Boolean(product) && !experience;
  if (honestyGuard) notes.push("실제 경험 미입력 → 사용 후기 표현 금지");

  const summary: ContextSummary = {
    profile: contentProfile ? { id: contentProfile.id, name: contentProfile.name } : null,
    product: product ? { id: product.product.id, name: product.product.name, analysisVersion: product.analysis.version } : null,
    style: style ? { id: style.id, name: style.name } : null,
    exemplars: exemplars.map((e) => ({ id: e.id, label: e.headline })),
    avoidNotes: avoid.map((a) => a.reason),
    performanceHints,
    trend: trend ? { id: trend.id, title: trend.title } : null,
    notes,
    styleSamples: styleContext ? styleSnapshot(styleContext) : null,
    learningProfile: learning ? { id: learning.id, version: learning.version, insightCount: insights.length } : null,
    goodExampleIds: examples.map((e) => e.id),
  };

  return { contentProfile, product, style, styleContext, exemplars, examples, learning, avoid, performanceHints, trend, referenceVideo, honestyGuard, summary };
}

/** 가중치 무작위 뽑기 (중복 없이 n개) */
function weightedSample<T>(items: T[], n: number, weight: (x: T) => number): T[] {
  const pool = items.map((x) => ({ x, w: Math.max(0.01, weight(x)) }));
  const out: T[] = [];
  while (out.length < n && pool.length) {
    const total = pool.reduce((s, p) => s + p.w, 0);
    let r = Math.random() * total;
    const i = pool.findIndex((p) => (r -= p.w) <= 0);
    out.push(pool.splice(i < 0 ? pool.length - 1 : i, 1)[0].x);
  }
  return out;
}
