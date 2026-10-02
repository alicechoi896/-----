import "server-only";
import type { AiProviderId, UserSettings, UserSettingsInput } from "@/lib/types";
import { nowIso } from "@/lib/utils";
import { AppError } from "../http";
import { getCurrentUserId, getRepositories } from "../repositories";

const AI_IDS: AiProviderId[] = ["openai", "claude"];

/** 사용자 설정 (한 사람당 1행, 없으면 기본값) */
export const settingsService = {
  async get(): Promise<UserSettings> {
    const userId = await getCurrentUserId();
    const found = await getRepositories().settings.get(userId);
    if (found) return found;
    const now = nowIso();
    return { id: userId, userId, preferredAi: null, createdAt: now, updatedAt: now };
  },

  /** 예시 콘텐츠 프로필을 만들었다고 기록 (설정 행이 없으면 만든다) */
  async markProfileSeeded(): Promise<void> {
    const userId = await getCurrentUserId();
    const repo = getRepositories();
    const now = nowIso();
    const existing = await repo.settings.get(userId);
    if (existing) await repo.settings.update(userId, { profileSeededAt: now, updatedAt: now });
    else await repo.settings.insert({ id: userId, userId, preferredAi: null, profileSeededAt: now, createdAt: now, updatedAt: now });
  },

  async update(input: UserSettingsInput): Promise<UserSettings> {
    const userId = await getCurrentUserId();
    if (input.preferredAi !== undefined && input.preferredAi !== null && !AI_IDS.includes(input.preferredAi)) {
      throw new AppError("VALIDATION", "알 수 없는 AI 입니다.");
    }
    const repo = getRepositories();
    const existing = await repo.settings.get(userId);
    const now = nowIso();
    if (existing) return (await repo.settings.update(userId, { ...input, updatedAt: now }))!;
    const created: UserSettings = { id: userId, userId, preferredAi: input.preferredAi ?? null, createdAt: now, updatedAt: now };
    return repo.settings.insert(created);
  },
};
