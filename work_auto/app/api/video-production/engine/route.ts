import { ffmpegPath } from "@/lib/server/video/ffmpeg";

/**
 * GET /api/video-production/engine — 영상 편집 엔진(FFmpeg)이 배포에 들어 있는지만 알려 준다 (배포 확인용).
 * 경로·버전 등 다른 정보는 보내지 않는다. 받지 않는다(다운로드 없음).
 */
export async function GET() {
  let engine: "bundled" | "missing" = "missing";
  try {
    ffmpegPath();
    engine = "bundled";
  } catch {
    /* 없으면 렌더할 때 /tmp 로 받는다 */
  }
  return Response.json({ engine }, { headers: { "cache-control": "no-store" } });
}
