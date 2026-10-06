import "server-only";
import { AppError } from "../../http";
import { getXiaohongshuSearchProvider } from "../registry";
import { resolveXiaohongshu, xhsNoteOf, type XhsVideo } from "./xiaohongshu-resolver";

/**
 * 샤오홍슈 영상 주소 찾기 + 대체 경로 (v0.9.50).
 * 1) 샤오홍슈 모바일 페이지 (무료, xsec_source 3가지)
 * 2) 페이지가 막히면 (XHS_BLOCKED·XHS_PARSE) TikHub 노트 상세 1회 ($0.01) — 영상 검색처럼 서버가 업체에 노트 ID 를 보내 재생 주소를 받는다.
 *    같은 노트는 10분 기억, 동시 요청은 1번으로. TikHub 미연결이면 원래 안내를 그대로 보여 준다.
 * 영상 파일은 여전히 사용자 브라우저가 샤오홍슈 영상 서버(xhscdn)에서 직접 받는다 (서버 저장 0).
 */
const TTL = 10 * 60 * 1000;
const fallbackCache = new Map<string, { at: number; value: Promise<XhsVideo | null> }>();

export async function resolveXiaohongshuWithFallback(input: string): Promise<XhsVideo> {
  try {
    return await resolveXiaohongshu(input);
  } catch (e) {
    if (!(e instanceof AppError) || !["XHS_BLOCKED", "XHS_PARSE"].includes(e.code)) throw e;
    const { noteId, token } = await xhsNoteOf(input);
    const hit = fallbackCache.get(noteId);
    const value =
      hit && Date.now() - hit.at < TTL
        ? hit.value
        : (async () => {
            const provider = await getXiaohongshuSearchProvider().catch(() => null);
            if (!provider) return null;
            console.info("[XhsResolve]", JSON.stringify({ noteId, via: "tikhub-detail", reason: e.code }));
            const note = await provider.getVideoDetail(noteId, token).catch(() => null);
            if (!note?.previewUrl) return null;
            return {
              noteId,
              title: (note.title || note.desc || "샤오홍슈 영상").trim().slice(0, 100),
              author: note.author ?? "",
              durationSec: note.durationSec ?? 0,
              streams: [{ codec: "h264", width: 0, height: 0, size: null, url: note.previewUrl.replace(/^http:\/\//, "https://"), backupUrls: [] }],
            } satisfies XhsVideo;
          })();
    if (!hit || Date.now() - hit.at >= TTL) {
      fallbackCache.set(noteId, { at: Date.now(), value });
      value.then((v) => !v && fallbackCache.delete(noteId), () => fallbackCache.delete(noteId));
      if (fallbackCache.size > 500) fallbackCache.delete(fallbackCache.keys().next().value!);
    }
    const v = await value;
    if (v) return v;
    throw e;
  }
}
