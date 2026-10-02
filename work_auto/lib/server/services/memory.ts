import "server-only";
import type {
  ChannelId,
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
import { contentProfileService } from "./content-profiles";

/**
 * AI Memory 관리 유스케이스 (AI 학습 관리 화면).
 * Style / Content History / Feedback / Performance 의 조회와 변경.
 */
const STYLE_CHANNELS: ChannelId[] = ["youtube", "naver-clip", "naver-blog"];
const strList = (v: unknown, max: number, len = 200) =>
  Array.isArray(v) ? [...new Set(v.map((x) => String(x).trim().slice(0, len)).filter(Boolean))].slice(0, max) : [];

/** 예전 형식(channelId 하나, Hook·CTA 없음)도 새 형식으로 맞춘다 */
export function normalizeStyle(row: UserStyle): UserStyle {
  const { channelId: legacy, ...rest } = row as UserStyle & { channelId?: string | null };
  const channelIds = rest.channelIds?.length ? rest.channelIds : legacy && legacy !== "all" ? [legacy as ChannelId] : [];
  return {
    ...rest,
    channelIds,
    rules: rest.rules ?? [],
    examplePhrases: rest.examplePhrases ?? [],
    bannedPhrases: rest.bannedPhrases ?? [],
    hooks: rest.hooks ?? [],
    ctas: rest.ctas ?? [],
    profileId: rest.profileId ?? null,
  };
}

function cleanStyleInput(input: UserStyleInput): UserStyleInput {
  const name = input?.name?.trim().slice(0, 40);
  if (!name) throw new AppError("VALIDATION", "스타일 이름을 입력해 주세요.");
  return {
    name,
    channelIds: (Array.isArray(input.channelIds) ? input.channelIds : []).filter((c): c is ChannelId => STYLE_CHANNELS.includes(c)),
    tone: String(input.tone ?? "").trim().slice(0, 200),
    description: String(input.description ?? "").trim().slice(0, 500),
    rules: strList(input.rules, 20),
    examplePhrases: strList(input.examplePhrases, 20),
    bannedPhrases: strList(input.bannedPhrases, 30, 60),
    hooks: strList(input.hooks, 20),
    ctas: strList(input.ctas, 20),
    profileId: typeof input.profileId === "string" && input.profileId ? input.profileId : null,
    isDefault: Boolean(input.isDefault),
  };
}

/** 연결할 콘텐츠 프로필이 내 것인지 확인 */
async function assertOwnProfile(profileId: string | null | undefined) {
  if (!profileId) return;
  if (!(await contentProfileService.get(profileId))) throw new AppError("VALIDATION", "연결할 콘텐츠 프로필을 찾을 수 없습니다.");
}

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
    const rows = await getRepositories().styles.list((s) => s.userId === userId);
    return rows.map(normalizeStyle).sort((x, y) => Number(y.isDefault) - Number(x.isDefault) || y.updatedAt.localeCompare(x.updatedAt));
  },

  async createStyle(input: UserStyleInput): Promise<UserStyle> {
    const clean = cleanStyleInput(input);
    await assertOwnProfile(clean.profileId);
    const repo = getRepositories();
    const userId = await getCurrentUserId();
    const now = nowIso();
    const style: UserStyle = { ...clean, id: createId("sty"), userId, createdAt: now, updatedAt: now };
    if (style.isDefault) await this.clearDefault(style.channelIds, style.id);
    await repo.styles.insert(style);
    return style;
  },

  async updateStyle(id: string, input: UserStyleInput): Promise<UserStyle> {
    const repo = getRepositories();
    const userId = await getCurrentUserId();
    const existing = await repo.styles.get(id);
    if (!existing || existing.userId !== userId) notFound("스타일");
    const clean = cleanStyleInput(input);
    await assertOwnProfile(clean.profileId);
    if (clean.isDefault) await this.clearDefault(clean.channelIds, id);
    return normalizeStyle((await repo.styles.update(id, { ...clean, updatedAt: nowIso() }))!);
  },

  async setDefaultStyle(id: string): Promise<UserStyle> {
    const repo = getRepositories();
    const userId = await getCurrentUserId();
    const row = await repo.styles.get(id);
    if (!row || row.userId !== userId) notFound("스타일");
    const style = normalizeStyle(row);
    await this.clearDefault(style.channelIds, id);
    return normalizeStyle((await repo.styles.update(id, { isDefault: true, updatedAt: nowIso() }))!);
  },

  async removeStyle(id: string): Promise<void> {
    await getRepositories().styles.remove(id);
  },

  /**
   * 기본 스타일은 채널마다 1개.
   * 적용 채널이 겹치는 다른 기본 스타일을 해제한다 (모든 채널 스타일끼리도 겹침으로 본다).
   */
  async clearDefault(channelIds: UserStyle["channelIds"], exceptId?: string) {
    const repo = getRepositories();
    const userId = await getCurrentUserId();
    const others = (await repo.styles.list((x) => x.userId === userId && x.isDefault && x.id !== exceptId)).map(normalizeStyle);
    for (const s of others) {
      const overlap =
        channelIds.length === 0 ? s.channelIds.length === 0 : s.channelIds.some((c) => channelIds.includes(c));
      if (overlap) await repo.styles.update(s.id, { isDefault: false });
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
    const [profiles, products, styles, contents, feedback, performance] = await Promise.all([
      repo.contentProfiles.list((p) => p.userId === userId),
      repo.products.list((p) => p.userId === userId),
      repo.styles.list((s) => s.userId === userId),
      repo.contents.list((c) => c.userId === userId),
      repo.feedback.list((f) => f.userId === userId),
      this.listPerformance(),
    ]);
    return {
      counts: {
        profiles: profiles.length,
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
