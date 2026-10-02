/**
 * 샤오홍슈 영상 → 소리 없는 mp4 (브라우저에서 처리).
 *  1) 서버에 영상 주소만 물어본다 (/api/videos/resolve)
 *  2) 브라우저가 샤오홍슈 영상 서버(xhscdn, CORS 허용)에서 직접 받는다
 *  3) ffmpeg.wasm 으로 소리 트랙만 뺀다 (재인코딩 없음, 화질 그대로)
 * 영상 파일은 우리 서버를 지나가지 않고 어디에도 저장되지 않는다.
 */
import { api } from "@/lib/api-client";
import { removeAudio } from "@/lib/video-mute";

export type XhsStage = "resolve" | "download" | "mute" | "done";

const safeName = (s: string) => (s.replace(/[\\/:*?"<>|\n\r\t]+/g, " ").replace(/\s+/g, " ").trim() || "샤오홍슈 영상").slice(0, 60);

async function fetchWithProgress(url: string, onProgress: (ratio: number) => void): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`영상 서버 응답 오류 (HTTP ${res.status})`);
  const total = Number(res.headers.get("content-length")) || 0;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total) onProgress(received / total);
  }
  return new Blob(chunks as BlobPart[], { type: "video/mp4" });
}

export async function downloadXhsMuted(
  url: string,
  onStage: (stage: XhsStage, progress?: number) => void,
): Promise<{ blob: Blob; name: string; title: string }> {
  onStage("resolve");
  const video = await api.videos.resolve(url);
  // h264 가 먼저 온다 (어느 편집 프로그램에서나 열린다). 실패하면 백업 주소 → 다른 형식 순서로 시도
  const candidates = video.streams.flatMap((s) => [s.url, ...s.backupUrls]);
  let source: Blob | null = null;
  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      onStage("download", 0);
      source = await fetchWithProgress(candidate, (p) => onStage("download", p));
      break;
    } catch (e) {
      lastError = e;
    }
  }
  if (!source) throw new Error(lastError instanceof Error ? lastError.message : "영상을 받지 못했습니다.");

  onStage("mute", 0);
  const muted = await removeAudio(new File([source], `${video.noteId}.mp4`, { type: "video/mp4" }), (p) => onStage("mute", p));
  onStage("done");
  return { blob: muted, name: `${safeName(video.title)}_음성없음.mp4`, title: video.title };
}
