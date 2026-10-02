import "server-only";
import { AppError } from "../../http";

/**
 * 샤오홍슈(小红书) 노트 → 영상 주소 찾기.
 *
 * - 모바일 웹 페이지(iPhone 브라우저로 요청)에는 로그인 없이 영상 정보(__INITIAL_STATE__)가 들어 있다.
 *   (PC 브라우저로 요청하면 로그인 페이지로 보낸다 — 2026-10 확인)
 * - 영상 파일 서버(xhscdn)는 CORS 를 허용(Access-Control-Allow-Origin: *)해서, 파일은 사용자 브라우저가 직접 받는다.
 *   → 우리 서버는 "주소만" 찾고 영상 파일을 다루지 않는다 (저장·트래픽 비용 0)
 * - 링크의 xsec_token 이 있어야 열린다. 앱 "공유 → 링크 복사" 링크 또는 xhslink.com 단축 링크를 쓴다.
 * - 샤오홍슈가 페이지 구조를 바꾸면 이 파일만 고친다.
 */

const MOBILE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const TIMEOUT_MS = 8000;

export interface XhsStream {
  codec: string;
  width: number;
  height: number;
  size: number | null;
  url: string;
  backupUrls: string[];
}

export interface XhsVideo {
  noteId: string;
  title: string;
  author: string;
  durationSec: number;
  /** 재생 호환성이 좋은 순서 (h264 먼저) */
  streams: XhsStream[];
}

const https = (u: string) => u.replace(/^http:\/\//, "https://");

async function fetchText(url: string): Promise<{ text: string; finalUrl: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": MOBILE_UA, "Accept-Language": "zh-CN,zh;q=0.9,ko;q=0.8" },
      redirect: "follow",
      cache: "no-store",
      signal: ctrl.signal,
    });
    return { text: await res.text(), finalUrl: res.url };
  } catch {
    throw new AppError("XHS_FETCH", "샤오홍슈에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.", 502);
  } finally {
    clearTimeout(timer);
  }
}

/** 공유 링크·단축 링크 → 노트 ID 와 xsec_token */
const shortLinks = new Map<string, string>();

/** 샤오홍슈 도메인인지 (서버가 다른 주소로 접속하지 않게 주소의 도메인을 정확히 확인한다) */
function xhsHost(raw: string): "short" | "note" | null {
  let host: string;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    host = u.hostname.toLowerCase();
  } catch {
    return null;
  }
  const under = (d: string) => host === d || host.endsWith(`.${d}`);
  if (under("xhslink.com")) return "short";
  if (under("xiaohongshu.com")) return "note";
  return null;
}

const NOT_XHS = "샤오홍슈 노트 링크가 아닙니다. 앱에서 공유 → 링크 복사한 주소를 넣어 주세요.";

async function normalize(input: string): Promise<{ noteId: string; token: string | null; source: string }> {
  // 공유 문구 전체를 붙여 넣어도 첫 번째 주소만 쓴다
  let url = input.trim().match(/https?:\/\/[^\s"'<>，。]+/i)?.[0] ?? input.trim();
  const kind = xhsHost(url);
  if (!kind) throw new AppError("XHS_URL", NOT_XHS, 400);
  if (kind === "short") {
    // 단축 링크는 실제 노트 주소로 이동한다 (같은 단축 링크는 다시 묻지 않는다)
    const known = shortLinks.get(url);
    if (known) url = known;
    else {
      const finalUrl = (await fetchText(url)).finalUrl;
      shortLinks.set(url, finalUrl);
      if (shortLinks.size > 1000) shortLinks.delete(shortLinks.keys().next().value!);
      url = finalUrl;
    }
  }
  // 단축 링크가 다른 곳으로 이동했으면 쓰지 않는다
  if (xhsHost(url) !== "note") throw new AppError("XHS_URL", NOT_XHS, 400);
  const noteId = new URL(url).pathname.match(/\/(?:explore|discovery\/item)\/([0-9a-f]{24})/i)?.[1];
  if (!noteId) throw new AppError("XHS_URL", NOT_XHS, 400);
  const q = new URL(url).searchParams;
  return { noteId, token: q.get("xsec_token"), source: q.get("xsec_source") ?? "app_share" };
}

function parseState(html: string): Record<string, unknown> | null {
  const marker = "window.__INITIAL_STATE__=";
  const start = html.indexOf(marker);
  if (start < 0) return null;
  const end = html.indexOf("</script>", start);
  try {
    return JSON.parse(html.slice(start + marker.length, end).replace(/\bundefined\b/g, "null")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});

/**
 * 같은 노트는 10분 동안 다시 묻지 않는다 (가져오기 → 다운로드 → 글자 흐리게 처럼 같은 영상을 여러 번 찾는다).
 * 동시에 같은 노트를 찾으면 한 번만 부른다. → 샤오홍슈에 가는 요청 수를 줄여 서버 IP 차단 위험을 낮춘다.
 * 영상 주소에는 서명(sign)이 붙어 있어 너무 오래 두지 않는다.
 */
const RESOLVE_TTL_MS = 10 * 60 * 1000;
const resolved = new Map<string, { at: number; value: Promise<XhsVideo> }>();

export async function resolveXiaohongshu(input: string): Promise<XhsVideo> {
  const norm = await normalize(input);
  const key = `${norm.noteId}:${norm.token ?? ""}`;
  const hit = resolved.get(key);
  if (hit && Date.now() - hit.at < RESOLVE_TTL_MS) return hit.value;
  const value = resolveNote(norm);
  resolved.set(key, { at: Date.now(), value });
  value.catch(() => resolved.delete(key)); // 실패는 기억하지 않는다
  if (resolved.size > 500) resolved.delete(resolved.keys().next().value!);
  return value;
}

async function resolveNote({ noteId, token, source }: { noteId: string; token: string | null; source: string }): Promise<XhsVideo> {
  const qs = new URLSearchParams({ ...(token ? { xsec_token: token } : {}), xsec_source: source });
  const { text, finalUrl } = await fetchText(`https://www.xiaohongshu.com/explore/${noteId}?${qs.toString()}`);
  if (/\/login|\/404/.test(finalUrl)) {
    throw new AppError(
      "XHS_BLOCKED",
      token
        ? "샤오홍슈가 이 링크를 열어 주지 않습니다. 링크가 만료되었을 수 있으니 앱에서 공유 링크를 새로 복사해 주세요."
        : "링크에 xsec_token 이 없습니다. 앱에서 공유 → 링크 복사한 주소를 그대로 넣어 주세요.",
      400,
    );
  }
  const state = parseState(text);
  const note = obj(obj(obj(obj(state).noteData).data).noteData);
  if (!note.noteId && !note.title) throw new AppError("XHS_PARSE", "샤오홍슈 페이지에서 노트 정보를 찾지 못했습니다. (페이지 구조가 바뀌었을 수 있습니다)", 502);
  if (note.type !== "video") throw new AppError("XHS_NOT_VIDEO", "영상이 아닌 노트입니다. (사진 노트는 받을 수 없습니다)", 400);

  const media = obj(obj(note.video).media);
  const streamMap = obj(media.stream);
  const streams: XhsStream[] = [];
  for (const key of ["h264", "h265", "h266", "av1"]) {
    const list = Array.isArray(streamMap[key]) ? (streamMap[key] as Json[]) : [];
    for (const s of list) {
      if (typeof s.masterUrl !== "string") continue;
      streams.push({
        codec: String(s.videoCodec ?? key),
        width: Number(s.width) || 0,
        height: Number(s.height) || 0,
        size: typeof s.size === "number" ? s.size : null,
        url: https(s.masterUrl),
        backupUrls: Array.isArray(s.backupUrls) ? (s.backupUrls as string[]).map(https) : [],
      });
    }
  }
  if (!streams.length) throw new AppError("XHS_NO_STREAM", "영상 주소를 찾지 못했습니다. 잠시 후 다시 시도해 주세요.", 502);

  return {
    noteId,
    title: String(note.title || note.desc || "샤오홍슈 영상").trim().slice(0, 100),
    author: String(obj(note.user).nickName ?? obj(note.user).nickname ?? ""),
    durationSec: Number(obj(media.video).duration) || 0,
    streams,
  };
}
