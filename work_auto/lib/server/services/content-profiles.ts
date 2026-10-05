import "server-only";
import { YOUTUBE_COUNTRIES } from "@/lib/domain/youtube";
import { EXAMPLE_PROFILE, toTrendScope, type ContentProfile, type ContentProfileInput, type TrendScope } from "@/lib/types";
import { createId, nowIso } from "@/lib/utils";
import { AppError, notFound } from "../http";
import { getCurrentUserId, getRepositories } from "../repositories";
import { settingsService } from "./settings";

const MAX_PROFILES = 10;
export const TREND_PERIODS = [7, 14, 21, 30, 90] as const;

const strList = (v: unknown, max: number, len = 40) =>
  Array.isArray(v) ? [...new Set(v.map((x) => String(x).trim().slice(0, len)).filter(Boolean))].slice(0, max) : [];

function clean(input: Partial<ContentProfileInput>): ContentProfileInput {
  const name = String(input?.name ?? "").trim().slice(0, 40);
  if (!name) throw new AppError("VALIDATION", "프로필 이름을 입력해 주세요.");
  const mainCategory = String(input.mainCategory ?? "").trim().slice(0, 40);
  if (!mainCategory) throw new AppError("VALIDATION", "대표 카테고리를 입력해 주세요. (예: 가전)");
  const period = Number(input.defaultTrendPeriod);
  return {
    name,
    description: String(input.description ?? "").trim().slice(0, 300),
    audience: String(input.audience ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
    mainCategory,
    subCategories: strList(input.subCategories, 12),
    seedKeywords: strList(input.seedKeywords, 20),
    excludeKeywords: strList(input.excludeKeywords, 20),
    defaultTrendPeriod: (TREND_PERIODS as readonly number[]).includes(period) ? period : 21,
    country: YOUTUBE_COUNTRIES.some((c) => c.code === input.country) ? String(input.country) : "KR",
    isDefault: Boolean(input.isDefault),
    isActive: input.isActive !== false,
  };
}

const byDefaultThenNewest = (a: ContentProfile, b: ContentProfile) =>
  Number(b.isDefault) - Number(a.isDefault) || b.updatedAt.localeCompare(a.updatedAt);

/**
 * 콘텐츠 프로필 ("무엇을 다룰 것인가").
 * 지금은 기본 프로필 1개를 자동 적용하는 흐름이 중심이고, 여러 개를 만들면 트렌드 화면에서 전환할 수 있다.
 */
export const contentProfileService = {
  async list(): Promise<ContentProfile[]> {
    const userId = await getCurrentUserId();
    return (await getRepositories().contentProfiles.list((p) => p.userId === userId)).sort(byDefaultThenNewest);
  },

  /** 자동 적용할 프로필: 사용 중인 기본 프로필 → 없으면 사용 중인 첫 프로필 */
  async getActive(): Promise<ContentProfile | null> {
    const list = (await this.list()).filter((p) => p.isActive);
    return list.find((p) => p.isDefault) ?? list[0] ?? null;
  },

  /** 내 프로필 1개 (다른 사람 것은 없는 것으로 본다) */
  async get(id: string): Promise<ContentProfile | null> {
    const userId = await getCurrentUserId();
    const p = await getRepositories().contentProfiles.get(id);
    return p && p.userId === userId ? p : null;
  },

  /**
   * 트렌드 조회에 쓸 조사 범위.
   * profileId 가 "none" 이면 프로필 없이, 비어 있으면 자동 적용 프로필, 그 밖에는 그 프로필.
   */
  async resolveScope(profileId?: string | null): Promise<TrendScope | null> {
    if (profileId === "none") return null;
    const p = profileId ? await this.get(profileId) : await this.getActive();
    return p ? toTrendScope(p) : null;
  },

  async create(input: Partial<ContentProfileInput>): Promise<ContentProfile> {
    const data = clean(input);
    const existing = await this.list();
    if (existing.length >= MAX_PROFILES) throw new AppError("LIMIT", `콘텐츠 프로필은 ${MAX_PROFILES}개까지 만들 수 있습니다.`);
    // 첫 프로필은 자동으로 기본
    if (existing.length === 0) data.isDefault = true;
    if (data.isDefault) await this.clearDefault(existing);
    const now = nowIso();
    return getRepositories().contentProfiles.insert({ ...data, id: createId("prf"), userId: await getCurrentUserId(), createdAt: now, updatedAt: now });
  },

  /**
   * 처음 들어온 사용자: 프로필이 하나도 없고 아직 예시를 만든 적이 없으면 "가전 콘텐츠" 예시를 자동으로 만든다.
   * - 한 번만 만든다 (user_settings.profile_seeded_at). 사용자가 지우면 다시 만들지 않는다.
   * - 화면 여러 곳이 동시에 불러도 하나만 생기도록 ID 를 사용자별로 고정한다.
   */
  async ensureStarter(): Promise<void> {
    const list = await this.list();
    if (list.length) return;
    const settings = await settingsService.get().catch(() => null);
    if (settings?.profileSeededAt) return;
    const userId = await getCurrentUserId();
    const repo = getRepositories();
    const id = `prf_start_${userId.replace(/-/g, "").slice(0, 12)}`;
    if (!(await repo.contentProfiles.get(id))) {
      const now = nowIso();
      await repo.contentProfiles.insert({ ...EXAMPLE_PROFILE, id, userId, createdAt: now, updatedAt: now }).catch(() => undefined);
    }
    // 설정 컬럼이 아직 없으면(schema.sql 재실행 전) 기록만 건너뛴다 — ID 가 고정이라 중복 생성은 없다
    await settingsService.markProfileSeeded().catch(() => undefined);
  },

  /** 처음 시작할 때 예시(가전 콘텐츠)로 만들기 */
  async createExample(): Promise<ContentProfile> {
    return this.create(EXAMPLE_PROFILE);
  },

  async update(id: string, input: Partial<ContentProfileInput>): Promise<ContentProfile> {
    const target = await this.get(id);
    if (!target) notFound("콘텐츠 프로필");
    const data = clean({ ...target, ...input });
    if (data.isDefault) await this.clearDefault((await this.list()).filter((p) => p.id !== id));
    return (await getRepositories().contentProfiles.update(id, { ...data, updatedAt: nowIso() }))!;
  },

  async setDefault(id: string): Promise<ContentProfile> {
    const target = await this.get(id);
    if (!target) notFound("콘텐츠 프로필");
    await this.clearDefault((await this.list()).filter((p) => p.id !== id));
    return (await getRepositories().contentProfiles.update(id, { isDefault: true, isActive: true, updatedAt: nowIso() }))!;
  },

  async remove(id: string) {
    const target = await this.get(id);
    if (!target) return;
    await getRepositories().contentProfiles.remove(id);
    // 기본 프로필을 지우면 남은 것 중 하나를 기본으로
    if (target.isDefault) {
      const next = (await this.list()).find((p) => p.isActive);
      if (next) await getRepositories().contentProfiles.update(next.id, { isDefault: true });
    }
  },

  async clearDefault(profiles: ContentProfile[]) {
    const repo = getRepositories();
    await Promise.all(profiles.filter((p) => p.isDefault).map((p) => repo.contentProfiles.update(p.id, { isDefault: false })));
  },
};
