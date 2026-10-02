import "server-only";
import { getRepositories } from "../repositories";

/** 사용자별 생성 이력 보관 개수. 넘으면 오래된 것부터 지운다 */
export const HISTORY_LIMIT = 300;

/**
 * 생성 이력 정리: 최신 300건을 넘는 오래된 이력을 지운다.
 * ★ 우수 사례, 👍/👎 피드백이 달린 것, 성과가 입력된 것은 AI 학습 재료이므로 남긴다 (개수에도 세지 않는다).
 * 생성 직후 호출한다. 실패해도 생성 결과에는 영향을 주지 않는다.
 */
export async function pruneContentHistory(userId: string): Promise<number> {
  const repo = getRepositories();
  const mine = await repo.contents.list((c) => c.userId === userId);
  if (mine.length <= HISTORY_LIMIT) return 0;

  const ids = new Set(mine.map((c) => c.id));
  const [feedback, performance] = await Promise.all([
    repo.feedback.list((f) => ids.has(f.contentId)),
    repo.performance.list((m) => ids.has(m.contentId)),
  ]);
  const keep = new Set([...feedback.map((f) => f.contentId), ...performance.map((m) => m.contentId)]);
  const plain = mine
    .filter((c) => !c.isExemplar && c.rating == null && !keep.has(c.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  let removed = 0;
  for (const c of plain.slice(HISTORY_LIMIT)) if (await repo.contents.remove(c.id)) removed++;
  return removed;
}
