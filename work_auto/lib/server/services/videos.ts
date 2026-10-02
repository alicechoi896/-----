import "server-only";
import type { ReferenceVideo } from "@/lib/types";
import { createId, nowIso } from "@/lib/utils";
import { AppError } from "../http";
import { getYouTubeTrendProvider } from "../providers/registry";
import { getCurrentUserId, getRepositories } from "../repositories";

/** 영상 URL 가져오기 유스케이스 */
export const videoService = {
  async list(): Promise<ReferenceVideo[]> {
    const userId = await getCurrentUserId();
    return (await getRepositories().videos.list((v) => v.userId === userId)).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  },

  async import(url: string, note?: string): Promise<ReferenceVideo> {
    const trimmed = url?.trim();
    if (!trimmed || !/^https?:\/\//.test(trimmed)) throw new AppError("BAD_URL", "올바른 영상 URL 을 입력해 주세요.");
    const userId = await getCurrentUserId();
    const repo = getRepositories();
    const dup = await repo.videos.list((v) => v.userId === userId && v.url === trimmed);
    if (dup.length) throw new AppError("DUPLICATE", "이미 가져온 영상입니다.", 409);

    const meta = await (await getYouTubeTrendProvider()).getVideoMeta(trimmed);
    const video: ReferenceVideo = { id: createId("vid"), userId, ...meta, note: note?.trim() || null, createdAt: nowIso() };
    await repo.videos.insert(video);
    return video;
  },

  async remove(id: string) {
    await getRepositories().videos.remove(id);
  },
};
