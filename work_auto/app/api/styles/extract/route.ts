import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { rateLimit } from "@/lib/server/rate-limit";
import { styleExtractor } from "@/lib/server/services/style-extractor";
import type { ChannelId } from "@/lib/types";

export const maxDuration = 60;

/** POST /api/styles/extract { text, channelIds } — 참고 자료로 스타일 초안 만들기 (AI). 원문은 저장하지 않는다 */
export async function POST(request: Request) {
  return handle(async () => {
    await requireAccess("ai-learning");
    await rateLimit("ai-generate");
    return styleExtractor.extract(await readJson<{ text: string; channelIds: ChannelId[] }>(request));
  });
}
