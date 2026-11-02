import "server-only";
import { AppError } from "../http";
import type { SessionInfo } from "@/lib/types";
import { publicationService } from "../services/publications";
import { getCurrentUserId, getRepositories } from "../repositories";
import { decryptSecret, encryptSecret } from "../security/crypto";
import { videoStorage } from "../video/storage";
import type { VideoJob } from "@/lib/types/video-production";

/**
 * 유튜브 자동 업로드 (v0.9.150) — 구글 계정 연결(OAuth, youtube.upload 권한) 후 완성 영상을 내 채널에 올린다.
 * - 열쇠(refresh token)는 암호화해 서버 저장소({owner}/youtube/oauth.enc)에만. 브라우저·로그로 내보내지 않는다.
 * - 예약: privacyStatus=private + publishAt (유튜브가 그 시각에 공개). 바로 공개도 가능.
 * - 올리면 업로드 관리 기록(주소 포함)을 만든다 → 1일·7일 성과 자동 수집으로 이어진다.
 * 필요한 환경변수(Vercel): GOOGLE_OAUTH_CLIENT_ID · GOOGLE_OAUTH_CLIENT_SECRET (사용자가 직접 넣음)
 * 주의: 구글 검수(감사)를 받지 않은 API 프로젝트로 올린 영상은 유튜브가 '비공개'로 고정한다.
 */
const SCOPE = "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly";
const tokenKey = (owner: string) => `${owner}/youtube/oauth.enc`;

export const youtubeUploadConfigured = () => Boolean(process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET);
const redirectUri = (origin: string) => `${origin}/api/youtube/oauth/callback`;

export function authUrl(origin: string, state: string): string {
  if (!youtubeUploadConfigured()) throw new AppError("NOT_CONFIGURED", "유튜브 업로드 연결이 준비되지 않았습니다 (Vercel 환경변수 GOOGLE_OAUTH_CLIENT_ID·GOOGLE_OAUTH_CLIENT_SECRET).", 409);
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!,
    redirect_uri: redirectUri(origin),
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
}

interface Stored {
  refreshToken: string;
  channelTitle: string | null;
  channelId: string | null;
  connectedAt: string;
}

async function readStored(owner: string): Promise<Stored | null> {
  const buf = await videoStorage.download(tokenKey(owner)).catch(() => null);
  if (!buf) return null;
  try {
    return JSON.parse(decryptSecret(buf.toString("utf8"))) as Stored;
  } catch {
    return null;
  }
}

async function tokenRequest(body: Record<string, string>): Promise<{ access_token?: string; refresh_token?: string; error?: string; error_description?: string }> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_OAUTH_CLIENT_ID!, client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET!, ...body }).toString(),
    cache: "no-store",
  });
  return (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error?: string; error_description?: string };
}

async function channelOf(accessToken: string): Promise<{ id: string | null; title: string | null }> {
  const res = await fetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" });
  const j = (await res.json().catch(() => ({}))) as { items?: { id: string; snippet?: { title?: string } }[] };
  return { id: j.items?.[0]?.id ?? null, title: j.items?.[0]?.snippet?.title ?? null };
}

/** 구글이 돌려준 code → 열쇠 저장 */
export async function finishConnect(origin: string, code: string): Promise<{ channelTitle: string | null }> {
  const owner = await getCurrentUserId();
  const t = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: redirectUri(origin) });
  if (!t.refresh_token || !t.access_token) throw new AppError("OAUTH_FAILED", `구글 연결에 실패했습니다 (${t.error_description ?? t.error ?? "열쇠를 받지 못함"}).`, 400);
  const ch = await channelOf(t.access_token);
  const stored: Stored = { refreshToken: t.refresh_token, channelTitle: ch.title, channelId: ch.id, connectedAt: new Date().toISOString() };
  await videoStorage.put(tokenKey(owner), Buffer.from(encryptSecret(JSON.stringify(stored))), "application/octet-stream", "0");
  console.info("[YouTubeUpload] connected", JSON.stringify({ channel: ch.title }));
  return { channelTitle: ch.title };
}

export async function connectionStatus(): Promise<{ configured: boolean; connected: boolean; channelTitle: string | null; connectedAt: string | null }> {
  const owner = await getCurrentUserId();
  const s = await readStored(owner);
  return { configured: youtubeUploadConfigured(), connected: Boolean(s), channelTitle: s?.channelTitle ?? null, connectedAt: s?.connectedAt ?? null };
}

export async function disconnect(): Promise<void> {
  const owner = await getCurrentUserId();
  await videoStorage.remove(tokenKey(owner)).catch(() => undefined);
}

async function accessToken(owner: string): Promise<string> {
  const s = await readStored(owner);
  if (!s) throw new AppError("NOT_CONNECTED", "유튜브 계정이 연결되어 있지 않습니다. 설정 › API 연결 센터에서 [유튜브 업로드 연결]을 해 주세요.", 409);
  const t = await tokenRequest({ refresh_token: s.refreshToken, grant_type: "refresh_token" });
  if (!t.access_token) throw new AppError("OAUTH_EXPIRED", `유튜브 연결이 만료되었습니다. 다시 연결해 주세요 (${t.error ?? "열쇠 만료"}).`, 409);
  return t.access_token;
}

export interface UploadInput {
  jobId: string;
  title: string;
  description?: string;
  tags?: string[];
  /** ISO — 있으면 그 시각에 공개(예약, 비공개로 올렸다가 유튜브가 공개) */
  publishAt?: string | null;
  privacy?: "public" | "unlisted" | "private";
  productId?: string | null;
}

/** 완성 영상을 유튜브에 올린다 (1번 누르면 1번) → 업로드 관리 기록 */
export async function uploadToYouTube(input: UploadInput, session: SessionInfo): Promise<{ videoId: string; url: string; publicationId: string | null }> {
  const owner = await getCurrentUserId();
  const job = (await getRepositories().videoJobs.get(input.jobId)) as VideoJob | null;
  if (!job || job.userId !== owner || !job.outputPath) throw new AppError("NOT_FOUND", "올릴 영상을 찾지 못했습니다 (완성 영상 파일이 없거나 지워졌습니다).", 404);
  const file = await videoStorage.download(job.outputPath).catch(() => null);
  if (!file) throw new AppError("NOT_FOUND", "완성 영상 파일이 정리되어 없습니다. 다시 만들어 주세요.", 404);
  const token = await accessToken(owner);
  const publishAt = input.publishAt && Date.parse(input.publishAt) > Date.now() + 60_000 ? new Date(input.publishAt).toISOString() : null;
  const meta = {
    snippet: {
      title: input.title.replace(/[<>]/g, "").slice(0, 100) || job.plan.selectedTitle.slice(0, 100),
      description: (input.description ?? "").replace(/[<>]/g, "").slice(0, 4900),
      tags: (input.tags ?? []).map((t) => t.replace(/^#/, "").slice(0, 30)).filter(Boolean).slice(0, 30),
      categoryId: "22",
    },
    status: { privacyStatus: publishAt ? "private" : (input.privacy ?? "private"), ...(publishAt ? { publishAt } : {}), selfDeclaredMadeForKids: false },
  };
  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": String(file.length) },
    body: JSON.stringify(meta),
    cache: "no-store",
  });
  const loc = init.headers.get("location");
  if (!init.ok || !loc) {
    const e = (await init.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new AppError("UPLOAD_FAILED", `유튜브가 업로드를 받지 않았습니다 (${e.error?.message?.slice(0, 160) ?? `HTTP ${init.status}`}).`, 502);
  }
  const put = await fetch(loc, { method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Length": String(file.length) }, body: new Uint8Array(file), cache: "no-store" });
  const done = (await put.json().catch(() => ({}))) as { id?: string; error?: { message?: string } };
  if (!put.ok || !done.id) throw new AppError("UPLOAD_FAILED", `업로드하지 못했습니다 (${done.error?.message?.slice(0, 160) ?? `HTTP ${put.status}`}).`, 502);
  const url = `https://www.youtube.com/shorts/${done.id}`;
  console.info("[YouTubeUpload] uploaded", JSON.stringify({ jobId: job.id, videoId: done.id, scheduled: Boolean(publishAt) }));
  // 업로드 관리 기록 (주소가 있어 1일·7일 성과가 자동으로 모인다)
  let publicationId: string | null = null;
  try {
    const row = await publicationService.create(session, {
      contentId: job.contentId ?? job.plan.contentId ?? null,
      productId: input.productId ?? null,
      platform: "youtube",
      accountName: "",
      title: meta.snippet.title,
      contentType: "제품 홍보 영상",
      status: publishAt ? "scheduled" : "published",
      scheduledAt: publishAt,
      publishedAt: publishAt ? null : new Date().toISOString(),
      platformUrl: url,
      note: "유튜브 자동 업로드",
    });
    publicationId = row.id;
  } catch (e) {
    console.warn("[YouTubeUpload] publication", e instanceof Error ? e.message : e);
  }
  return { videoId: done.id, url, publicationId };
}
