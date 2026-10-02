import "server-only";
import type { ReferenceVideo } from "@/lib/types";
import { createId, nowIso } from "@/lib/utils";
import { AppError } from "../http";
import { detectPlatform, xiaohongshuId } from "@/lib/video-links";
import { getYouTubeTrendProvider } from "../providers/registry";
import { resolveXiaohongshu } from "../providers/video/xiaohongshu-resolver";
import type { VideoMeta } from "../providers/types";
import { getCurrentUserId, getRepositories } from "../repositories";

const MAX_BATCH = 20;

/** 내 제품인지 확인 (비우면 null) */
async function ownProductId(productId?: string | null): Promise<string | null> {
  if (!productId) return null;
  const userId = await getCurrentUserId();
  const p = await getRepositories().products.get(productId);
  if (!p || p.userId !== userId) throw new AppError("VALIDATION", "연결할 제품을 찾을 수 없습니다.");
  return p.id;
}

function xiaohongshuMeta(url: string, titleHint?: string): VideoMeta {
  const id = xiaohongshuId(url);
  return {
    url,
    platform: "xiaohongshu",
    title: titleHint?.trim() || `샤오홍슈 영상${id ? ` ${id.slice(-6)}` : ""}`,
    channelName: "샤오홍슈",
    durationSec: 0,
    thumbnailColor: "#ffe3e3",
  };
}

/** 영상 URL 가져오기 유스케이스 */
export const videoService = {
  async list(): Promise<ReferenceVideo[]> {
    const userId = await getCurrentUserId();
    return (await getRepositories().videos.list((v) => v.userId === userId)).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  },

  async import(url: string, note?: string, titleHint?: string, productId?: string | null): Promise<ReferenceVideo> {
    const trimmed = url?.trim();
    if (!trimmed || !/^https?:\/\//.test(trimmed)) throw new AppError("BAD_URL", "올바른 영상 URL 을 입력해 주세요.");
    const userId = await getCurrentUserId();
    const repo = getRepositories();
    const dup = await repo.videos.list((v) => v.userId === userId && v.url === trimmed);
    if (dup.length) throw new AppError("DUPLICATE", "이미 가져온 영상입니다.", 409);

    // 샤오홍슈: 모바일 웹 페이지에서 제목·작성자·길이를 읽는다
    const meta =
      detectPlatform(trimmed) === "xiaohongshu"
        ? await resolveXiaohongshu(trimmed).then(
            (v): VideoMeta => ({
              url: trimmed,
              platform: "xiaohongshu",
              title: v.title,
              channelName: v.author || "샤오홍슈",
              durationSec: v.durationSec,
              thumbnailColor: "#ffe3e3",
            }),
            () => xiaohongshuMeta(trimmed, titleHint), // 조회가 안 되면 공유 문구 제목으로 저장 (다운로드할 때 다시 시도)
          )
        : await (await getYouTubeTrendProvider()).getVideoMeta(trimmed);
    const video: ReferenceVideo = {
      id: createId("vid"),
      userId,
      ...meta,
      note: note?.trim() || null,
      productId: await ownProductId(productId),
      createdAt: nowIso(),
    };
    await repo.videos.insert(video);
    return video;
  },

  /**
   * 여러 URL 한 번에 가져오기 (줄바꿈으로 구분한 입력). 하나가 실패해도 나머지는 계속한다.
   * 한 번에 최대 20개. 같은 URL 이 여러 번 있으면 한 번만.
   */
  async importMany(
    items: (string | { url: string; titleHint?: string })[],
    note?: string,
    productId?: string | null,
  ): Promise<{ url: string; ok: boolean; video?: ReferenceVideo; error?: string }[]> {
    const product = await ownProductId(productId); // 잘못된 제품이면 여기서 한 번만 막는다
    const byUrl = new Map<string, string | undefined>();
    for (const it of Array.isArray(items) ? items : []) {
      const url = String(typeof it === "string" ? it : it?.url ?? "").trim();
      const hint = typeof it === "string" ? undefined : it?.titleHint ? String(it.titleHint).slice(0, 80) : undefined;
      if (url && !byUrl.has(url)) byUrl.set(url, hint);
    }
    const list = [...byUrl.keys()];
    if (!list.length) throw new AppError("BAD_URL", "영상 URL 을 입력해 주세요.");
    if (list.length > MAX_BATCH) throw new AppError("VALIDATION", `한 번에 ${MAX_BATCH}개까지 가져올 수 있습니다.`);
    const results: { url: string; ok: boolean; video?: ReferenceVideo; error?: string }[] = [];
    for (const url of list) {
      try {
        results.push({ url, ok: true, video: await this.import(url, note, byUrl.get(url), product) });
      } catch (e) {
        results.push({ url, ok: false, error: e instanceof AppError ? e.message : "가져오지 못했습니다." });
      }
    }
    return results;
  },

  /** 연관 제품 바꾸기 (null = 연결 해제) */
  async setProduct(id: string, productId: string | null): Promise<ReferenceVideo> {
    const userId = await getCurrentUserId();
    const repo = getRepositories();
    const video = await repo.videos.get(id);
    if (!video || video.userId !== userId) throw new AppError("NOT_FOUND", "영상을 찾을 수 없습니다.", 404);
    return (await repo.videos.update(id, { productId: await ownProductId(productId) }))!;
  },

  async remove(id: string) {
    await getRepositories().videos.remove(id);
  },
};
