/**
 * 프롬프트 버전별 성과표 (v0.9.34) — "프롬프트를 바꾼 뒤 실제로 좋아졌나"를 숫자로 본다. docs/PROMPT_STATS.md
 * 기존 데이터(생성 이력·피드백·업로드·성과)만으로 계산한다. DB 변경·저장 없음.
 */
export interface PromptStatsInput {
  contents: { id: string; featureId: string; promptId: string; promptVersion: string; createdAt: string; context: { userEdits?: Record<string, { ratio: number }>; quality?: { mode?: string } | null; workflow?: { stage?: number } | null } }[];
  feedback: { contentId: string; rating: "up" | "down"; createdAt: string }[];
  publications: { contentId: string | null }[];
  performance: { contentId: string; views: number | null }[];
}

export interface PromptVersionRow {
  promptId: string;
  version: string;
  mode: "fast" | "precise" | "two-stage";
  /** 생성 수 */
  count: number;
  /** 👍·👎 를 받은 수, 👍 비율 (0~1, 평가 없으면 null) */
  rated: number;
  upRate: number | null;
  /** 직접 수정한 결과 비율 · 고친 결과의 평균 수정 정도 (0~1) */
  editedRate: number;
  avgEditRatio: number | null;
  /** 업로드 등록한 비율 */
  uploadRate: number;
  /** 조회수가 있는 결과 수 · 평균 조회수 (결과마다 가장 큰 값) */
  viewed: number;
  avgViews: number | null;
  firstAt: string;
  lastAt: string;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);

export function promptVersionStats(input: PromptStatsInput): PromptVersionRow[] {
  // 결과마다 마지막 피드백만
  const lastRating = new Map<string, { rating: "up" | "down"; at: string }>();
  for (const f of input.feedback) {
    const prev = lastRating.get(f.contentId);
    if (!prev || f.createdAt > prev.at) lastRating.set(f.contentId, { rating: f.rating, at: f.createdAt });
  }
  const uploaded = new Set(input.publications.map((p) => p.contentId).filter(Boolean) as string[]);
  const maxViews = new Map<string, number>();
  for (const m of input.performance) if (m.views != null) maxViews.set(m.contentId, Math.max(maxViews.get(m.contentId) ?? 0, m.views));

  const groups = new Map<string, PromptStatsInput["contents"]>();
  for (const c of input.contents) {
    // v0.9.40: 2단계 생성(1단계 후보·2단계 대본)은 따로 묶는다
    const mode = c.context.workflow?.stage ? "two-stage" : c.context.quality?.mode === "precise" ? "precise" : "fast";
    const key = JSON.stringify([c.promptId, c.promptVersion, mode]);
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const rows: PromptVersionRow[] = [];
  for (const [key, list] of groups) {
    const [promptId, version, mode] = JSON.parse(key) as [string, string, "fast" | "precise" | "two-stage"];
    const ratings = list.map((c) => lastRating.get(c.id)?.rating).filter(Boolean);
    const edits = list.map((c) => Object.values(c.context.userEdits ?? {}).map((e) => e.ratio)).filter((r) => r.length);
    const views = list.map((c) => maxViews.get(c.id)).filter((v): v is number => v != null);
    const dates = list.map((c) => c.createdAt).sort();
    rows.push({
      promptId,
      version,
      mode,
      count: list.length,
      rated: ratings.length,
      upRate: ratings.length ? ratings.filter((r) => r === "up").length / ratings.length : null,
      editedRate: edits.length / list.length,
      avgEditRatio: avg(edits.map((r) => Math.max(...r))),
      uploadRate: list.filter((c) => uploaded.has(c.id)).length / list.length,
      viewed: views.length,
      avgViews: views.length ? Math.round(avg(views)!) : null,
      firstAt: dates[0],
      lastAt: dates[dates.length - 1],
    });
  }
  // 프롬프트별로 묶고, 최신 버전이 위로
  return rows.sort((a, b) => a.promptId.localeCompare(b.promptId) || b.version.localeCompare(a.version, undefined, { numeric: true }) || a.mode.localeCompare(b.mode));
}
