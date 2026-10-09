import { getCurrentUserId } from "@/lib/server/repositories";
import { videoStorage } from "@/lib/server/video/storage";

/** GET /api/video-jobs/file?key= — 데모(Supabase 미연결)에서만: 서버 메모리의 영상 (본인 것만) */
export async function GET(request: Request) {
  const key = new URL(request.url).searchParams.get("key") ?? "";
  const userId = await getCurrentUserId().catch(() => "");
  const file = userId && key.startsWith(`${userId}/`) ? videoStorage.memoryFile(key) : null;
  if (!file) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(file), { headers: { "content-type": "video/mp4", "content-disposition": `inline; filename="${key.split("/").pop()}"`, "cache-control": "private, no-store" } });
}
