import "server-only";
import type { SessionInfo } from "@/lib/types";
import type { VideoJob } from "@/lib/types/video-production";
import { AppError } from "../http";
import { getUplikaProvider } from "../providers/registry";
import { UplikaError, type UplikaAccount, type UplikaPost } from "../providers/uplika";
import { getCurrentUserId, getRepositories } from "../repositories";
import { publicationService } from "../services/publications";
import { videoStorage } from "../video/storage";

/**
 * 업리카로 완성 영상 올리기 (v0.9.195) — 인스타그램 릴스 · 틱톡(앱의 임시 저장으로) · 스레드 · 페이스북.
 * 유튜브는 지금처럼 직접 올린다 (업리카의 유튜브는 모든 사용자가 하루 100개를 나눠 씀).
 * 1번 누르면 1번 (확인 창 + Idempotency-Key), 자동 재시도 없음. 올리면 업로드 관리에 기록 → 주소가 생기면 채움.
 */
export const UPLIKA_PLATFORMS = ["instagram", "tiktok", "threads", "facebook"] as const;
const PLATFORM_LABEL: Record<string, string> = { instagram: "인스타그램 릴스", tiktok: "틱톡 (앱 임시 저장)", threads: "스레드", facebook: "페이스북" };
const PUBLICATION_PLATFORM: Record<string, string> = { instagram: "instagram", tiktok: "tiktok", threads: "threads", facebook: "facebook" };

async function provider() {
  const p = await getUplikaProvider();
  if (!p) throw new AppError("UPLIKA_NOT_CONNECTED", "업리카가 연결되어 있지 않습니다. 설정 › API 연결 센터에서 업리카 API 키를 넣어 주세요.", 409);
  return p;
}
const friendly = (e: unknown) => (e instanceof UplikaError ? new AppError("UPLIKA_FAILED", e.status === 401 ? "업리카 API 키가 맞지 않습니다 (API 연결 센터)." : `업리카: ${e.message}`, e.status >= 500 ? 502 : 409) : e);

export async function uplikaAccounts(): Promise<{ accounts: (UplikaAccount & { label: string })[]; connectUrl: string | null }> {
  try {
    const r = await (await provider()).accounts();
    return {
      accounts: r.accounts.filter((a) => (UPLIKA_PLATFORMS as readonly string[]).includes(a.platform)).map((a) => ({ ...a, label: PLATFORM_LABEL[a.platform] ?? a.platform })),
      connectUrl: r.connectUrl,
    };
  } catch (e) {
    throw friendly(e);
  }
}

export interface UplikaPublishInput {
  jobId: string;
  accountIds: string[];
  caption: string;
  firstComment?: string;
  /** ISO, 10분 뒤 ~ 1년 (없으면 바로) */
  scheduledAt?: string | null;
  productId?: string | null;
  clientRequestId: string;
}

export async function uplikaPublishJob(input: UplikaPublishInput, session: SessionInfo): Promise<{ post: UplikaPost; publicationIds: string[] }> {
  const owner = await getCurrentUserId();
  const p = await provider();
  const job = (await getRepositories().videoJobs.get(String(input.jobId))) as VideoJob | null;
  if (!job || job.userId !== owner || !job.outputPath) throw new AppError("NOT_FOUND", "올릴 영상을 찾지 못했습니다 (완성 영상 파일이 없거나 지워졌습니다).", 404);
  const reqId = String(input.clientRequestId ?? "").trim();
  if (!/^[\w-]{8,80}$/.test(reqId)) throw new AppError("VALIDATION", "요청 번호가 없습니다. 화면을 새로 고쳐 주세요.");
  const { accounts } = await p.accounts().catch((e) => {
    throw friendly(e);
  });
  const picked = accounts.filter((a) => input.accountIds.includes(a.id) && (UPLIKA_PLATFORMS as readonly string[]).includes(a.platform));
  if (!picked.length) throw new AppError("VALIDATION", "올릴 계정을 골라 주세요.");
  const caption = String(input.caption ?? "").trim().slice(0, 2200);
  if (!caption) throw new AppError("VALIDATION", "올릴 글(캡션)을 써 주세요.");
  const at = input.scheduledAt ? Date.parse(input.scheduledAt) : NaN;
  const scheduledAt = Number.isFinite(at) ? (at > Date.now() + 10 * 60_000 ? new Date(at).toISOString() : null) : null;
  if (input.scheduledAt && !scheduledAt) throw new AppError("VALIDATION", "예약은 지금부터 10분 뒤 이후로 정해 주세요.");
  const file = await videoStorage.download(job.outputPath).catch(() => null);
  if (!file) throw new AppError("NOT_FOUND", "완성 영상 파일이 정리되어 없습니다. 다시 만들어 주세요.", 404);
  const platforms = new Set(picked.map((a) => a.platform));
  const options: Record<string, unknown> = {};
  if (platforms.has("instagram")) options.instagram = { contentType: "reel", ...(input.firstComment?.trim() ? { firstComment: input.firstComment.trim().slice(0, 2200) } : {}) };
  // 틱톡은 공개 범위를 계정마다 골라야 해서, 앱의 임시 저장으로 보낸다 (앱에서 마무리해 게시)
  if (platforms.has("tiktok")) options.tiktok = { postMode: "draft" };
  let post: UplikaPost;
  try {
    const mediaId = await p.uploadVideo(file, `${job.id}.mp4`);
    post = await p.publish({ content: caption, accountIds: picked.map((a) => a.id), mediaIds: [mediaId], options, scheduledAt }, `wa-${reqId}`);
  } catch (e) {
    throw friendly(e);
  }
  console.info("[Uplika] publish", JSON.stringify({ jobId: job.id, post: post.id, platforms: [...platforms], scheduled: Boolean(scheduledAt) }));
  // 업로드 관리 기록 (계정마다)
  const publicationIds: string[] = [];
  for (const a of picked) {
    try {
      const row = await publicationService.create(session, {
        contentId: job.contentId ?? job.plan.contentId ?? null,
        productId: input.productId ?? null,
        platform: PUBLICATION_PLATFORM[a.platform] ?? "other",
        accountName: a.handle ? `@${a.handle}` : a.displayName,
        title: (job.plan.selectedTitle || caption).slice(0, 100),
        contentType: "제품 홍보 영상",
        status: scheduledAt ? "scheduled" : "draft",
        scheduledAt,
        publishedAt: null,
        platformUrl: "",
        note: `업리카 게시 ${post.id}${a.platform === "tiktok" ? " (틱톡 앱 임시 저장)" : ""}`,
      });
      publicationIds.push(row.id);
    } catch (e) {
      console.warn("[Uplika] publication", e instanceof Error ? e.message : e);
    }
  }
  return { post, publicationIds };
}

/** 게시 상태 확인 (무료). 주소가 생기면 업로드 관리 기록을 '업로드 완료'로 */
export async function uplikaPostStatus(postId: string, publicationIds: string[], session: SessionInfo): Promise<UplikaPost> {
  const p = await provider();
  let post: UplikaPost;
  try {
    post = await p.post(String(postId));
  } catch (e) {
    throw friendly(e);
  }
  const done = post.targets.filter((t) => t.status === "published" && t.url);
  if (done.length) {
    const rows = await publicationService.list(session).catch(() => []);
    for (const t of done) {
      const row = rows.find((r) => publicationIds.includes(r.id) && r.platform === (PUBLICATION_PLATFORM[t.platform] ?? "other") && !r.platformUrl);
      if (row) await publicationService.update(session, row.id, { status: "published", publishedAt: new Date().toISOString(), platformUrl: t.url! }).catch(() => undefined);
    }
  }
  return post;
}
