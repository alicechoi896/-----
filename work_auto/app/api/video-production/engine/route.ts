import { ffmpegPath } from "@/lib/server/video/ffmpeg";

/**
 * GET /api/video-production/engine — 영상 편집 엔진(FFmpeg)·글자 그리기(canvas)가 배포에 들어 있는지만 알려 준다 (배포 확인용).
 * 경로·버전 등 다른 정보는 보내지 않는다. 받지 않는다(다운로드 없음).
 */
export async function GET() {
  let engine: "bundled" | "missing" = "missing";
  let text: "ok" | "missing" = "missing";
  try {
    ffmpegPath();
    engine = "bundled";
  } catch {
    /* 없으면 렌더할 때 /tmp 로 받는다 */
  }
  try {
    const { createCanvas } = await import("@napi-rs/canvas");
    createCanvas(4, 4).getContext("2d").fillRect(0, 0, 1, 1);
    text = "ok";
  } catch {
    /* 글자 그리기 불가 */
  }
  return Response.json({ engine, text }, { headers: { "cache-control": "no-store" } });
}
