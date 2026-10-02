import "server-only";
import type { GeneratorConfig } from "@/lib/generators/types";
import type { ChannelId, ContextSummary } from "@/lib/types";
import { formatNumber } from "@/lib/utils";
import { AppError } from "../http";
import { getRepositories } from "../repositories";
import { trendService } from "../services/trends";
import type { GenerationContext } from "./context-types";

/**
 * ★ ContextBuilder — AI Memory 를 "생성 1회분"의 Context 로 조립한다.
 *
 * 원칙: AI 는 절대 빈 Context 로 호출하지 않는다.
 *   모든 생성은 이 함수를 거치고, 무엇이 들어갔는지(summary)를 결과와 함께 저장한다.
 *
 * 조립 순서와 개수 제한 (토큰 예산 관리)
 *   1. Product Memory      — 선택한 제품의 현재 분석 1건
 *   2. Style Memory        — 채널 기본 스타일 1건 (없으면 "all" 기본 스타일)
 *   3. Content History     — 같은 기능의 "좋은 결과" 최근 2건 (few-shot)
 *   4. Feedback            — 같은 기능의 "별로예요" 최근 3건 (피해야 할 패턴)
 *   5. Performance         — 같은 채널 성과 상위 2건
 *   6. Trend / 참고 영상   — 사용자가 고른 것
 * (docs/AI_LEARNING_SYSTEM.md)
 */

export const CONTEXT_LIMITS = { exemplars: 2, avoid: 3, performance: 2 } as const;

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

  // 1) Product Memory — 저장된 분석을 그대로 쓴다 (상세페이지 재분석 없음)
  let product: GenerationContext["product"] = null;
  const productId = config.productField ? String(input[config.productField] ?? "") : "";
  if (productId) {
    const p = await repo.products.get(productId);
    if (!p || p.userId !== userId) throw new AppError("PRODUCT_NOT_FOUND", "선택한 제품을 찾을 수 없습니다.", 404);
    const analysis = await repo.productAnalyses.get(p.currentAnalysisId);
    if (!analysis) throw new AppError("ANALYSIS_NOT_FOUND", "제품 분석 데이터가 없습니다. 상세페이지 학습을 다시 진행해 주세요.", 404);
    product = { product: p, analysis };
  }

  // 2) Style Memory
  const styles = await repo.styles.list((s) => s.userId === userId && s.isDefault);
  const style = styles.find((s) => s.channelId === channelId) ?? styles.find((s) => s.channelId === "all") ?? null;
  if (!style) notes.push("기본 스타일 없음 → AI 학습 관리 > 나의 스타일에서 등록하면 결과가 일정해집니다.");

  // 3) Content History — 좋은 결과 (few-shot 예시)
  const exemplars = (await repo.contents.list((c) => c.userId === userId && c.featureId === featureId && c.isExemplar))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, CONTEXT_LIMITS.exemplars);

  // 4) Feedback — 별로예요 사유와 수정본
  const avoid = (await repo.feedback.list((f) => f.userId === userId && f.featureId === featureId && f.rating === "down"))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, CONTEXT_LIMITS.avoid)
    .map((f) => ({ reason: f.reason ?? "사유 없음", edited: f.editedOutput }));

  // 5) Performance — 같은 채널 성과 상위
  const channelContents = await repo.contents.list((c) => c.userId === userId && c.channelId === channelId);
  const contentById = new Map(channelContents.map((c) => [c.id, c]));
  const performanceHints = (await repo.performance.list((m) => contentById.has(m.contentId) && m.views != null))
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, CONTEXT_LIMITS.performance)
    .map((m) => {
      const c = contentById.get(m.contentId)!;
      return `"${c.headline}" — 조회 ${formatNumber(m.views ?? 0)}${m.ctr != null ? `, CTR ${m.ctr}%` : ""}`;
    });

  // 6) Trend / 참고 영상
  const trendId = config.trendField ? String(input[config.trendField] ?? "") : "";
  const trend = trendId ? await trendService.findOption(trendId) : null;
  const videoId = String(input.referenceVideoId ?? "");
  const referenceVideo = videoId ? await repo.videos.get(videoId) : null;

  // 정직성 가드레일: 제품 콘텐츠인데 실제 경험이 없으면 활성화
  const experience = config.experienceField ? String(input[config.experienceField] ?? "").trim() : "";
  const honestyGuard = Boolean(product) && !experience;
  if (honestyGuard) notes.push("실제 경험 미입력 → 사용 후기 표현 금지");

  const summary: ContextSummary = {
    product: product ? { id: product.product.id, name: product.product.name, analysisVersion: product.analysis.version } : null,
    style: style ? { id: style.id, name: style.name } : null,
    exemplars: exemplars.map((e) => ({ id: e.id, label: e.headline })),
    avoidNotes: avoid.map((a) => a.reason),
    performanceHints,
    trend: trend ? { id: trend.id, title: trend.title } : null,
    notes,
  };

  return { product, style, exemplars, avoid, performanceHints, trend, referenceVideo, honestyGuard, summary };
}
