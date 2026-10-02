import "server-only";
import type {
  GeneratedContent,
  PerformanceMetric,
  UserFeedback,
  UserFeedbackInput,
  UserStyle,
  UserStyleInput,
} from "@/lib/types";
import { createId, nowIso } from "@/lib/utils";
import { AppError, notFound } from "../http";
import { getCurrentUserId, getRepositories } from "../repositories";

/**
 * AI Memory 관리 유스케이스 (AI 학습 관리 화면).
 * Style / Content History / Feedback / Performance 의 조회와 변경.
 */
export const memoryService = {
  /* ── Content History ── */
  async listContents(filter: { featureId?: string; productId?: string } = {}): Promise<GeneratedContent[]> {
    const userId = await getCurrentUserId();
    const rows = await getRepositories().contents.list(
      (c) =>
        c.userId === userId &&
        (!filter.featureId || c.featureId === filter.featureId) &&
        (!filter.productId || c.productId === filter.productId),
    );
    return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  /** "좋은 결과로 저장" 토글 → 다음 생성의 few-shot 예시 후보가 된다 */
  async setExemplar(contentId: string, isExemplar: boolean): Promise<GeneratedContent> {
    const repo = getRepositories();
    const userId = await getCurrentUserId();
    const content = await repo.contents.get(contentId);
    if (!content || content.userId !== userId) notFound("콘텐츠");
    return (await repo.contents.update(contentId, { isExemplar }))!;
  },

  /* ── Feedback ── */
  async addFeedback(input: UserFeedbackInput): Promise<UserFeedback> {
    const repo = getRepositories();
    const userId = await getCurrentUserId();
    const content = await repo.contents.get(input.contentId);
    if (!content || content.userId !== userId) notFound("콘텐츠");
    if (input.rating !== "up" && input.rating !== "down") throw new AppError("VALIDATION", "평가 값이 올바르지 않습니다.");

    const feedback: UserFeedback = {
      id: createId("fb"),
      userId,
      contentId: content.id,
      featureId: content.featureId,
      rating: input.rating,
      reason: input.reason?.trim() || null,
      editedOutput: input.editedOutput ?? null,
      createdAt: nowIso(),
    };
    await repo.feedback.insert(feedback);
    await repo.contents.update(content.id, { rating: input.rating });
    return feedback;
  },

  async listFeedback(): Promise<UserFeedback[]> {
    const userId = await getCurrentUserId();
    return (await getRepositories().feedback.list((f) => f.userId === userId)).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  },

  /* ── Style ── */
  async listStyles(): Promise<UserStyle[]> {
    const userId = await getCurrentUserId();
    return getRepositories().styles.list((s) => s.userId === userId);
  },

  async createStyle(input: UserStyleInput): Promise<UserStyle> {
    if (!input.name?.trim()) throw new AppError("VALIDATION", "스타일 이름을 입력해 주세요.");
    const repo = getRepositories();
    const userId = await getCurrentUserId();
    const now = nowIso();
    const style: UserStyle = { ...input, id: createId("sty"), userId, createdAt: now, updatedAt: now };
    if (style.isDefault) await this.clearDefault(style.channelId);
    await repo.styles.insert(style);
    return style;
  },

  async setDefaultStyle(id: string): Promise<UserStyle> {
    const repo = getRepositories();
    const style = await repo.styles.get(id);
    if (!style) notFound("스타일");
    await this.clearDefault(style.channelId);
    return (await repo.styles.update(id, { isDefault: true, updatedAt: nowIso() }))!;
  },

  async removeStyle(id: string): Promise<void> {
    await getRepositories().styles.remove(id);
  },

  /** 채널당 기본 스타일은 1개 */
  async clearDefault(channelId: UserStyle["channelId"]) {
    const repo = getRepositories();
    const userId = await getCurrentUserId();
    for (const s of await repo.styles.list((x) => x.userId === userId && x.channelId === channelId && x.isDefault)) {
      await repo.styles.update(s.id, { isDefault: false });
    }
  },

  /* ── Performance ── */
  async listPerformance(): Promise<(PerformanceMetric & { headline: string })[]> {
    const repo = getRepositories();
    const contents = await this.listContents();
    const byId = new Map(contents.map((c) => [c.id, c]));
    const metrics = await repo.performance.list((m) => byId.has(m.contentId));
    return metrics.map((m) => ({ ...m, headline: byId.get(m.contentId)!.headline }));
  },

  /* ── Overview ── */
  async overview() {
    const userId = await getCurrentUserId();
    const repo = getRepositories();
    const [products, styles, contents, feedback, performance] = await Promise.all([
      repo.products.list((p) => p.userId === userId),
      repo.styles.list((s) => s.userId === userId),
      repo.contents.list((c) => c.userId === userId),
      repo.feedback.list((f) => f.userId === userId),
      this.listPerformance(),
    ]);
    return {
      counts: {
        products: products.length,
        styles: styles.length,
        contents: contents.length,
        exemplars: contents.filter((c) => c.isExemplar).length,
        feedback: feedback.length,
        performance: performance.length,
      },
    };
  },
};
