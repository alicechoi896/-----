import { readFile } from "node:fs/promises";
import { CAPTION_FONTS } from "@/lib/video-production/config";
import { videoAssets } from "@/lib/server/video/assets";

export const runtime = "nodejs";

/**
 * GET /api/video-production/font/:key — 제목·자막 미리보기용 글꼴 파일 (v0.9.78).
 * 영상에 쓰는 것과 같은 파일(assets/video/fonts, 없으면 프리텐다드)을 그대로 보내 미리보기와 영상 글꼴을 맞춘다. 외부 호출 0
 */
export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const key = (await ctx.params).key;
  if (!CAPTION_FONTS.some((f) => f.value === key)) return new Response("Not found", { status: 404 });
  const f = videoAssets.font(key);
  try {
    const buf = await readFile(f.file);
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": f.file.toLowerCase().endsWith(".otf") ? "font/otf" : "font/ttf",
        "cache-control": "public, max-age=86400",
        "x-font-fallback": f.fallback ? "1" : "0",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
