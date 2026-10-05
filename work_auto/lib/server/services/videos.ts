import "server-only";
import { resolveDouyin } from "../providers/douyin/douyin-resolver";
import type { ReferenceVideo } from "@/lib/types";
import { createId, nowIso } from "@/lib/utils";
import { AppError } from "../http";
import { detectPlatform, douyinId, xiaohongshuId } from "@/lib/video-links";
import { getYouTubeTrendProvider } from "../providers/registry";
import { resolveXiaohongshu } from "../providers/video/xiaohongshu-resolver";
import type { VideoMeta } from "../providers/types";
import { getCurrentUserId, getRepositories } from "../repositories";

const MAX_BATCH = 20;
/** 기존 참고 영상 한 번에 읽는 수 ([더 불러오기]마다 다음 페이지) */
export const VIDEO_PAGE_SIZE = 30;

/**
 * 검색 결과에서 가져올 때 화면이 넘기는 메타 (TikHub 검색 응답에 이미 있는 값).
 * 이 값이 있으면 상세·Resolver API 를 부르지 않고 그대로 저장한다 (docs/SOCIAL_VIDEO_SOURCING.md 비용 정책).
 * 재생 주소(만료되는 media URL)는 받지도 저장하지도 않는다.
 */
export interface ImportMetaHint {
  channelName?: string | null;
  durationSec?: number | null;
  thumbnailUrl?: string | null;
}

function cleanHint(raw: unknown): ImportMetaHint | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const thumb = typeof r.thumbnailUrl === "string" && /^https:\/\/[^\s]{1,900}$/.test(r.thumbnailUrl) ? r.thumbnailUrl : null;
  const dur = Number(r.durationSec);
  return {
    channelName: typeof r.channelName === "string" ? r.channelName.trim().slice(0, 80) || null : null,
    durationSec: Number.isFinite(dur) && dur > 0 && dur < 36_000 ? Math.round(dur) : null,
    thumbnailUrl: thumb,
  };
}

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

function douyinMeta(url: string, titleHint?: string): VideoMeta {
  const id = douyinId(url);
  return {
    url,
    platform: "douyin",
    title: titleHint?.trim() || `도우인 영상${id ? ` ${id.slice(-6)}` : ""}`,
    channelName: "도우인",
    durationSec: 0,
    thumbnailColor: "#e8e8f0",
  };
}

/** 영상 URL 가져오기 유스케이스 */
export const videoService = {
  /** productId: 특정 제품 / "none" = 제품 연결 안 된 영상 / 없으면 전체 (생성 화면 참고 영상 선택용) */
  async list(filter: { productId?: string | null } = {}): Promise<ReferenceVideo[]> {
    const userId = await getCurrentUserId();
    const pid = filter.productId?.trim() || null;
    // 제품을 고른 경우는 그 제품 영상만 DB 에서 읽는다
    if (pid) return getRepositories().videos.listPage({ userId, productId: pid, limit: 500, offset: 0 });
    return (await getRepositories().videos.list((v) => v.userId === userId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  /** 기존 참고 영상 한 페이지 (영상 URL 가져오기 › 기존 참고 영상). 처음 열 때는 부르지 않는다 */
  async page(filter: { productId?: string | null; offset?: unknown }): Promise<{ items: ReferenceVideo[]; hasMore: boolean; nextOffset: number }> {
    const userId = await getCurrentUserId();
    const pid = filter.productId?.trim();
    const offset = Math.max(0, Math.min(100_000, Math.floor(Number(filter.offset) || 0)));
    // 한 개 더 읽어 다음 페이지가 있는지 안다
    const rows = await getRepositories().videos.listPage({ userId, productId: pid && pid !== "all" ? pid : null, limit: VIDEO_PAGE_SIZE + 1, offset });
    return { items: rows.slice(0, VIDEO_PAGE_SIZE), hasMore: rows.length > VIDEO_PAGE_SIZE, nextOffset: offset + Math.min(rows.length, VIDEO_PAGE_SIZE) };
  },

  async import(
    url: string,
    note?: string,
    titleHint?: string,
    productId?: string | null,
    opts: { hint?: ImportMetaHint | null; knownDuplicate?: boolean } = {},
  ): Promise<ReferenceVideo> {
    const trimmed = url?.trim();
    if (!trimmed || !/^https?:\/\//.test(trimmed)) throw new AppError("BAD_URL", "올바른 영상 URL 을 입력해 주세요.");
    const userId = await getCurrentUserId();
    const repo = getRepositories();
    const dup = opts.knownDuplicate ?? (await repo.videos.findUrls(userId, [trimmed])).length > 0;
    if (dup) throw new AppError("DUPLICATE", "이미 가져온 영상입니다.", 409);

    // 검색 결과에서 온 샤오홍슈·도우인: 검색 응답의 메타로 바로 저장 (상세·Resolver API 0회)
    // 링크만 붙여 넣은 경우: 샤오홍슈 = 모바일 웹 페이지, 도우인 = TikHub 공유 링크 API 1회, 그 밖 = YouTube
    const platform = detectPlatform(trimmed);
    const hint = opts.hint;
    const fromSearch = Boolean(hint && titleHint?.trim() && (platform === "douyin" || platform === "xiaohongshu"));
    const meta: VideoMeta = fromSearch
      ? {
          url: trimmed,
          platform: platform as "douyin" | "xiaohongshu",
          title: titleHint!.trim(),
          channelName: hint!.channelName || (platform === "douyin" ? "도우인" : "샤오홍슈"),
          durationSec: hint!.durationSec ?? 0,
          thumbnailColor: platform === "douyin" ? "#e8e8f0" : "#ffe3e3",
          ...(hint!.thumbnailUrl ? { thumbnailUrl: hint!.thumbnailUrl } : {}),
        }
      : platform === "douyin"
        ? await resolveDouyin(trimmed).then(
            (v): VideoMeta => ({
              url: trimmed,
              platform: "douyin",
              title: titleHint?.trim() || v.title,
              channelName: v.author || "도우인",
              durationSec: v.durationSec ?? 0,
              thumbnailColor: "#e8e8f0",
            }),
            () => douyinMeta(trimmed, titleHint), // TikHub 미연결·오류여도 저장 (다운로드할 때 다시 시도)
          )
        : platform === "xiaohongshu"
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
    items: (string | { url: string; titleHint?: string; meta?: ImportMetaHint })[],
    note?: string,
    productId?: string | null,
  ): Promise<{ url: string; ok: boolean; video?: ReferenceVideo; error?: string }[]> {
    const product = await ownProductId(productId); // 잘못된 제품이면 여기서 한 번만 막는다
    const byUrl = new Map<string, { title?: string; hint: ImportMetaHint | null }>();
    for (const it of Array.isArray(items) ? items : []) {
      const url = String(typeof it === "string" ? it : it?.url ?? "").trim();
      const title = typeof it === "string" ? undefined : it?.titleHint ? String(it.titleHint).slice(0, 80) : undefined;
      if (url && !byUrl.has(url)) byUrl.set(url, { title, hint: typeof it === "string" ? null : cleanHint(it?.meta) });
    }
    const list = [...byUrl.keys()];
    if (!list.length) throw new AppError("BAD_URL", "영상 URL 을 입력해 주세요.");
    if (list.length > MAX_BATCH) throw new AppError("VALIDATION", `한 번에 ${MAX_BATCH}개까지 가져올 수 있습니다.`);
    // 중복 확인은 한 번에 (영상마다 DB 를 읽지 않는다)
    const existing = new Set(await getRepositories().videos.findUrls(await getCurrentUserId(), list));
    const results: { url: string; ok: boolean; video?: ReferenceVideo; error?: string }[] = [];
    for (const url of list) {
      try {
        const it = byUrl.get(url)!;
        results.push({ url, ok: true, video: await this.import(url, note, it.title, product, { hint: it.hint, knownDuplicate: existing.has(url) }) });
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
