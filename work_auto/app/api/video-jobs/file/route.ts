import { getCurrentUserId } from "@/lib/server/repositories";
import { videoStorage } from "@/lib/server/video/storage";

// v0.9.81: 드라마 스튜디오 이미지·음악도 (데모)
const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", json: "application/json" };

/** GET /api/video-jobs/file?key= — 데모(Supabase 미연결)에서만: 서버 메모리의 영상 (본인 것만) */
export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key") ?? "";
  const userId = await getCurrentUserId().catch(() => "");
  const file = userId && key.startsWith(`${userId}/`) ? videoStorage.memoryFile(key) : null;
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file), { headers: { "content-type": TYPES[key.split(".").pop()?.toLowerCase() ?? ""] ?? "video/mp4", "content-disposition": new URL(request.url).searchParams.get("download") ? `attachment; filename*=UTF-8''${encodeURIComponent(new URL(request.url).searchParams.get("download")!)}` : `inline; filename="${key.split("/").pop()}"`, "cache-control": "private, no-store" } });
}
