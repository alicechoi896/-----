import "server-only";
import type { ReferenceVideo } from "@/lib/types";
import { AppError } from "../http";
import { runWithoutPaidFallback } from "../automation/context";
import { resolveXiaohongshu, xhsNoteOf } from "../providers/video/xiaohongshu-resolver";
import { getCurrentUserId, getRepositories } from "../repositories";
import { videoStorage } from "./storage";

/**
 * 샤오홍슈 영구 링크 (v0.9.113) — 앱 [공유] 의 단축 링크 xhslink.com/… 는 몇 년이 지나도 살아 있고,
 * 열 때마다 샤오홍슈가 새 임시 열쇠(xsec_token)가 붙은 노트 주소로 넘겨 준다 → 받을 때마다 새로 열어 무료로 받는다 (2026-11-01 직접 확인).
 * 검색 결과로 가져온 긴 주소(xiaohongshu.com/explore/…?xsec_token=…)는 열쇠가 만료되면 열리지 않는다 → 같은 영상의 공유 링크로 바꾼다.
 * 원본 파일은 보관하지 않는다 (영상 제작이 쓰던 7일 임시 캐시 {owner}/src/{id}.mp4 만 그대로).
 */
export const isShortXhsLink = (url: string) => {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === "xhslink.com" || h.endsWith(".xhslink.com");
  } catch {
    return false;
  }
};

/** 7일 임시 캐시에 원본이 있는 영상 id */
export async function storedVideoIds(owner?: string): Promise<Set<string>> {
  const o = owner ?? (await getCurrentUserId());
  const out = new Set<string>();
  for (let offset = 0; offset < 20_000; offset += 1000) {
    const rows = await videoStorage.list(`${o}/src`, { limit: 1000, offset }).catch(() => []);
    for (const r of rows) {
      const name = r.key.split("/").pop() ?? "";
      if (name.endsWith(".mp4")) out.add(name.slice(0, -4));
    }
    if (rows.length < 1000) break;
  }
  return out;
}

/** 영상 제작에 쓸 수 있는가: 영구 링크(xhslink) 또는 임시 캐시에 원본이 있음 */
export const usableXhsVideo = (v: Pick<ReferenceVideo, "id" | "url" | "platform" | "shareUrl">, stored: Set<string>) => v.platform === "xiaohongshu" && (isShortXhsLink(v.shareUrl || v.url) || stored.has(v.id));

/**
 * 같은 영상의 공유 링크(xhslink)로 바꾸기. 같은 노트인지 확인하고, 실제로 열리는지 무료로 한 번 시험한다 (TikHub 안 씀).
 */
export async function relinkVideo(videoId: string, url: string): Promise<ReferenceVideo> {
  const owner = await getCurrentUserId();
  const video = await getRepositories().videos.get(String(videoId));
  if (!video || video.userId !== owner) throw new AppError("NOT_FOUND", "영상을 찾을 수 없습니다.", 404);
  if (video.platform !== "xiaohongshu") throw new AppError("VALIDATION", "샤오홍슈 영상만 바꿀 수 있습니다.");
  const link = url.trim().match(/https?:\/\/[^\s"'<>，。]+/i)?.[0] ?? "";
  if (!isShortXhsLink(link)) throw new AppError("BAD_URL", "샤오홍슈 앱에서 [공유] → 링크 복사한 xhslink.com 주소를 넣어 주세요 (공유 문구를 통째로 붙여 넣어도 됩니다).");
  const [a, b] = await Promise.all([xhsNoteOf(video.url).catch(() => null), xhsNoteOf(link).catch(() => null)]);
  if (!b) throw new AppError("BAD_URL", "이 공유 링크가 열리지 않습니다. 앱에서 다시 복사해 주세요.");
  if (a && a.noteId !== b.noteId) throw new AppError("VALIDATION", "다른 영상의 공유 링크입니다. 같은 영상의 링크를 넣어 주세요.");
  // 실제로 영상 주소가 나오는지 (무료, TikHub 로 넘어가지 않음)
  await runWithoutPaidFallback(() => resolveXiaohongshu(link)).catch((e) => {
    throw new AppError("XHS_BLOCKED", `공유 링크는 맞지만 지금 영상을 열지 못했습니다 (${e instanceof Error ? e.message.slice(0, 80) : "알 수 없음"}). 잠시 후 다시 시도해 주세요.`, 400);
  });
  console.info("[XhsLink] relink", JSON.stringify({ videoId: video.id, noteId: b.noteId }));
  // v0.9.114: 처음 가져온 주소(url)는 그대로 두고 영구 링크 칸(share_url)에
  return (await getRepositories().videos.update(video.id, { shareUrl: link }))!;
}

/* ───── v0.9.114 TikHub 로 영구 공유 링크 받기 (확인 후, 하루 한도) ───── */
export const TIKHUB_DAILY = { usd: 0.5, perCallUsd: 0.01 } as const;
const kst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const usageKey = (owner: string) => `${owner}/auto/tikhub/${kst()}.json`;

export async function tikhubUsageToday(owner?: string): Promise<{ calls: number; limit: number }> {
  const o = owner ?? (await getCurrentUserId());
  const buf = await videoStorage.download(usageKey(o)).catch(() => null);
  let calls = 0;
  try {
    calls = buf ? Number((JSON.parse(buf.toString("utf8")) as { calls?: number }).calls) || 0 : 0;
  } catch {
    calls = 0;
  }
  return { calls, limit: Math.floor(TIKHUB_DAILY.usd / TIKHUB_DAILY.perCallUsd) };
}

const SHORT_RE = /https?:\/\/(?:[a-z0-9-]+\.)*xhslink\.(?:com|cn)\/[^\s"'<>，。]+/gi;

/** 응답 안의 xhslink 주소 · 공유 관련 값 (어떤 모양이 오는지 화면에 보여 줄 수 있게, 열쇠 값은 가린다) */
export function findShareLinks(body: unknown): { short: string[]; others: string[] } {
  const short = new Set<string>();
  const others = new Set<string>();
  const walk = (x: unknown, key: string, depth: number) => {
    if (depth > 8 || x == null) return;
    if (typeof x === "string") {
      for (const m of x.match(SHORT_RE) ?? []) short.add(m);
      if (/share|link/i.test(key) && /^https?:\/\//.test(x) && others.size < 6) others.add(`${key}: ${x.replace(/xsec_token=[^&]+/, "xsec_token=…").slice(0, 160)}`);
      return;
    }
    if (Array.isArray(x)) x.slice(0, 50).forEach((y) => walk(y, key, depth + 1));
    else if (typeof x === "object") for (const [k, v] of Object.entries(x as Record<string, unknown>)) walk(v, k, depth + 1);
  };
  walk(body, "", 0);
  return { short: [...short], others: [...others] };
}

/**
 * TikHub 노트 상세 1회로 영구 공유 링크(xhslink) 찾기 → 같은 노트인지 확인하고 share_url 에 저장.
 * 확인 창을 거친 요청만 (route 에서 confirmed), 하루 TIKHUB_DAILY.usd 달러 한도, 자동 재시도 없음.
 */
export async function fetchShareLinkViaTikhub(videoId: string): Promise<{ saved: string | null; found: string[]; others: string[]; usage: { calls: number; limit: number } }> {
  const owner = await getCurrentUserId();
  const video = await getRepositories().videos.get(String(videoId));
  if (!video || video.userId !== owner) throw new AppError("NOT_FOUND", "영상을 찾을 수 없습니다.", 404);
  if (video.platform !== "xiaohongshu") throw new AppError("VALIDATION", "샤오홍슈 영상만 됩니다.");
  if (video.shareUrl && isShortXhsLink(video.shareUrl)) return { saved: video.shareUrl, found: [video.shareUrl], others: [], usage: await tikhubUsageToday(owner) };
  const usage = await tikhubUsageToday(owner);
  if (usage.calls >= usage.limit) throw new AppError("BUDGET", `오늘 TikHub 한도(${usage.limit}회 ≈ $${TIKHUB_DAILY.usd})를 다 썼습니다. 내일 다시 눌러 주세요.`, 429);
  const note = await xhsNoteOf(video.url).catch(() => null);
  if (!note) throw new AppError("BAD_URL", "이 영상 주소에서 노트 ID 를 찾지 못했습니다.");
  const { getXiaohongshuSearchProvider } = await import("../providers/registry");
  const provider = await getXiaohongshuSearchProvider().catch(() => null);
  if (!provider?.getVideoDetailRaw) throw new AppError("TIKHUB_NOT_CONNECTED", "TikHub 가 연결되어 있지 않습니다. 설정 › API 연결 센터에서 TikHub 키를 넣어 주세요.", 409);
  // 호출 전에 횟수부터 센다 (실패해도 비용이 들 수 있어서)
  await videoStorage.put(usageKey(owner), Buffer.from(JSON.stringify({ calls: usage.calls + 1 })), "application/json", "0");
  const body = await provider.getVideoDetailRaw(note.noteId).catch((e: Error) => {
    throw new AppError("TIKHUB_ERROR", `TikHub 상세를 받지 못했습니다 (${e.message.slice(0, 100)}).`, 502);
  });
  const { short, others } = findShareLinks(body);
  let saved: string | null = null;
  for (const link of short.slice(0, 3)) {
    // 같은 노트인지 (단축 링크를 열어 확인 — 샤오홍슈, 무료). 데모 링크는 열 수 없어 그대로
    const same = link.includes("/o/demo") || (await xhsNoteOf(link).then((n) => n.noteId === note.noteId).catch(() => false));
    if (!same) continue;
    await getRepositories().videos.update(video.id, { shareUrl: link });
    saved = link;
    break;
  }
  console.info("[XhsLink] tikhub", JSON.stringify({ videoId: video.id, noteId: note.noteId, found: short.length, saved: Boolean(saved) }));
  return { saved, found: short, others, usage: { calls: usage.calls + 1, limit: usage.limit } };
}

