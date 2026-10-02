/**
 * 샤오홍슈 영상 → 소리 없는 mp4 (브라우저에서 처리).
 *  1) 서버에 영상 주소만 물어본다 (/api/videos/resolve)
 *  2) 브라우저가 샤오홍슈 영상 서버(xhscdn, CORS 허용)에서 직접 받는다
 *  3) ffmpeg.wasm 으로 소리 트랙만 뺀다 (재인코딩 없음, 화질 그대로)
 * 영상 파일은 우리 서버를 지나가지 않고 어디에도 저장되지 않는다.
 *
 * 형식 선택 (2026-10 확인): 같은 노트라도
 *  - H.265(hevc) 스트림에는 샤오홍슈 워터마크(로고·작성자 이름)가 없고
 *  - H.264 스트림에는 화면 아래에 워터마크가 들어 있다
 * → 기본은 H.265 를 먼저 받는다. H.265 가 없으면 H.264.
 */
import { api } from "@/lib/api-client";
import { blurAndMute, sampleFrames, toBlurBoxes } from "@/lib/video-edit";
import { removeAudio } from "@/lib/video-mute";

export type XhsStage = "resolve" | "download" | "mute" | "analyze" | "blur" | "done";

const safeName = (s: string) => (s.replace(/[\\/:*?"<>|\n\r\t]+/g, " ").replace(/\s+/g, " ").trim() || "샤오홍슈 영상").slice(0, 60);
const isHevc = (codec: string) => /hevc|h265|hvc/i.test(codec);

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

export interface XhsSource {
  blob: Blob;
  title: string;
  noteId: string;
  codec: string;
  /** 워터마크 없는 스트림인가 (H.265) */
  clean: boolean;
}

/** 원본 영상 받기 (소리 포함). 워터마크 없는 H.265 → 백업 주소 → H.264 순서로 시도 */
export async function fetchXhsSource(url: string, onStage: (stage: XhsStage, progress?: number) => void): Promise<XhsSource> {
  onStage("resolve");
  const video = await api.videos.resolve(url);
  const ordered = [...video.streams].sort((a, b) => Number(isHevc(b.codec)) - Number(isHevc(a.codec)));
  let lastError: unknown = null;
  for (const s of ordered) {
    for (const candidate of [s.url, ...s.backupUrls]) {
      try {
        onStage("download", 0);
        const blob = await fetchWithProgress(candidate, (p) => onStage("download", p));
        return { blob, title: video.title, noteId: video.noteId, codec: s.codec, clean: isHevc(s.codec) };
      } catch (e) {
        lastError = e;
      }
    }
  }
  throw new Error(lastError instanceof Error ? lastError.message : "영상을 받지 못했습니다.");
}

export function mutedName(title: string, suffix = "음성없음"): string {
  return `${safeName(title)}_${suffix}.mp4`;
}

export async function downloadXhsMuted(
  url: string,
  onStage: (stage: XhsStage, progress?: number) => void,
): Promise<{ blob: Blob; name: string; title: string; clean: boolean }> {
  const src = await fetchXhsSource(url, onStage);
  onStage("mute", 0);
  const muted = await removeAudio(new File([src.blob], `${src.noteId}.mp4`, { type: "video/mp4" }), (p) => onStage("mute", p), {
    hevc: isHevc(src.codec),
  });
  onStage("done");
  return { blob: muted, name: mutedName(src.title), title: src.title, clean: src.clean };
}

/**
 * 글자 자동 흐리게: 워터마크 없는 원본 받기 → 화면 뽑기 → AI 가 덧씌운 글자 위치 찾기 → 그 구간만 흐리게 + 소리 제거 → H.264
 * 원작자에게 사용과 로고·자막 제거 허락을 받은 영상에만 쓴다 (화면에서 확인).
 */
export async function downloadXhsBlurred(
  url: string,
  onStage: (stage: XhsStage, progress?: number) => void,
): Promise<{ blob: Blob; name: string; title: string; found: number }> {
  const src = await fetchXhsSource(url, onStage);
  onStage("analyze");
  const sampled = await sampleFrames(src.blob);
  const detected = await api.videos.detectText(sampled.frames);
  const boxes = toBlurBoxes(detected.frames, sampled.width, sampled.height, sampled.duration);
  onStage("blur", 0);
  const blob = await blurAndMute(src.blob, boxes, sampled, (p) => onStage("blur", p));
  onStage("done");
  return { blob, name: mutedName(src.title, "글자흐리게"), title: src.title, found: boxes.length };
}
