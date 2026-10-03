import { requireAccess } from "@/lib/server/auth";
import { handle, readJson } from "@/lib/server/http";
import { after } from "next/server";
import { scheduleLearning } from "@/lib/server/services/learning";
import { youtubeStatsService } from "@/lib/server/services/youtube-stats";
import { publicationService } from "@/lib/server/services/publications";

export const maxDuration = 120; // 업로드 완료는 학습 신호 → 응답 후 학습 업데이트가 이어질 수 있다
import type { ContentPublicationInput } from "@/lib/types";

/** GET /api/publications?from=ISO&to=ISO — 기간 안의 업로드 기록 (팀 전체) */
export async function GET(request: Request) {
  return handle(async () => {
    const session = await requireAccess("uploads");
    const sp = new URL(request.url).searchParams;
    // 밀린 YouTube 1일·7일 성과를 응답 뒤에 채우고, 저장되면 학습 신호로 넘긴다
    after(async () => {
      const saved = await youtubeStatsService.collectDue().catch((e) => {
        console.error("[youtube-stats] collect failed", e instanceof Error ? e.message : e);
        return [] as string[];
      });
      for (const id of saved) scheduleLearning(id);
    });
    return publicationService.list(session, { from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined });
  });
}

/** POST /api/publications — 업로드 등록 */
export async function POST(request: Request) {
  return handle(async () => {
    const session = await requireAccess("uploads");
    const created = await publicationService.create(session, await readJson<Partial<ContentPublicationInput>>(request));
    if (created.status === "published") scheduleLearning(created.contentId);
    return created;
  });
}
