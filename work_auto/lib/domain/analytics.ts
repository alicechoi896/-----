/**
 * 성과 분석 (v0.9.151) — 내 영상의 특징별 조회수 배수. 서버·화면·테스트에서 같이 쓰는 순수 함수.
 * 배수 = 그 특징을 가진 영상들의 조회수 중앙값 ÷ 전체 중앙값 (튀는 영상 하나에 흔들리지 않게 평균 대신 중앙값)
 * 표본(n)이 3개보다 적으면 "표본 적음" 으로 표시해 과신하지 않게 한다.
 */
export interface AnalyticsVideo {
  videoId: string;
  url: string;
  title: string;
  publishedAt: string;
  durationSec: number;
  views: number | null;
  likes: number | null;
  comments: number | null;
  thumbnailUrl: string | null;
  /** 우리 시스템에서 만든 콘텐츠면 연결 (Hook·섬네일 제목·대본 포맷·제품) */
  contentId: string | null;
  hook: string | null;
  thumbTitle: string | null;
  formatName: string | null;
  productName: string | null;
}

export interface FeatureRow {
  group: string;
  label: string;
  n: number;
  medianViews: number;
  /** 전체 중앙값 대비 배수 */
  ratio: number;
  few: boolean;
}

export const MIN_SAMPLE = 3;
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** KST 기준 요일·시간 */
function kst(iso: string): { day: number; hour: number } {
  const d = new Date(Date.parse(iso) + 9 * 3_600_000);
  return { day: d.getUTCDay(), hour: d.getUTCHours() };
}

export const hasNumberTitle = (t: string) => /\d+\s*(가지|개|위|단계|초|분|일|원|%|배|만)/.test(t);
export const isQuestion = (t: string) => /\?|왜 |어떻게|뭘까|뭐가|일까|할까|있을까|아시나요|아세요/.test(t);
export const hasLossWord = (t: string) => /손해|후회|모르면|절대|하지 ?마|실수|속지|낭비|버리|망하|최악|조심|주의/.test(t);

/** 영상 하나의 특징 (그룹 이름 → 값 라벨) */
export function featuresOf(v: AnalyticsVideo): Record<string, string> {
  const text = `${v.title} ${v.hook ?? ""}`;
  const f: Record<string, string> = {};
  const s = v.durationSec;
  f["영상 길이"] = s <= 0 ? "알 수 없음" : s <= 15 ? "15초 이하" : s <= 30 ? "16~30초" : s <= 45 ? "31~45초" : s <= 60 ? "46~60초" : "1분 넘음";
  f["제목에 숫자"] = hasNumberTitle(v.title) ? "있음 (예: 3가지)" : "없음";
  f["질문형 제목·Hook"] = isQuestion(text) ? "질문형" : "질문 아님";
  f["손실 회피 단어"] = hasLossWord(text) ? "있음 (손해·후회·모르면…)" : "없음";
  if (v.thumbTitle) {
    const n = v.thumbTitle.replace(/\s/g, "").length;
    f["섬네일 글자 수"] = n <= 6 ? "6자 이하" : n <= 10 ? "7~10자" : "11자 이상";
  }
  if (v.hook) {
    const n = v.hook.replace(/\s/g, "").length;
    f["Hook 길이"] = n <= 15 ? "15자 이하" : n <= 25 ? "16~25자" : "26자 이상";
  }
  if (v.publishedAt) {
    const { day, hour } = kst(v.publishedAt);
    f["올린 요일"] = `${WEEK[day]}요일`;
    f["올린 시간 (한국)"] = hour < 6 ? "새벽 0~6시" : hour < 12 ? "오전 6~12시" : hour < 18 ? "오후 12~18시" : "저녁 18~24시";
  }
  if (v.formatName) f["대본 포맷"] = v.formatName;
  return f;
}

/** 특징 × 배수 표. 그룹 안에서 배수 높은 순 */
export function featureTable(videos: AnalyticsVideo[]): { overallMedian: number; rows: FeatureRow[] } {
  const counted = videos.filter((v) => v.views != null);
  const overall = median(counted.map((v) => v.views!));
  const buckets = new Map<string, { group: string; label: string; views: number[] }>();
  for (const v of counted) {
    for (const [group, label] of Object.entries(featuresOf(v))) {
      const k = `${group}\u0000${label}`;
      const b = buckets.get(k) ?? { group, label, views: [] };
      b.views.push(v.views!);
      buckets.set(k, b);
    }
  }
  const rows = [...buckets.values()].map((b) => {
    const m = median(b.views);
    return { group: b.group, label: b.label, n: b.views.length, medianViews: Math.round(m), ratio: overall > 0 ? Math.round((m / overall) * 100) / 100 : 0, few: b.views.length < MIN_SAMPLE };
  });
  const order = [...new Set(rows.map((r) => r.group))];
  rows.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || b.ratio - a.ratio);
  return { overallMedian: Math.round(overall), rows };
}

/** 표에서 눈에 띄는 것: 표본이 충분하고 배수가 1.3 이상이거나 0.7 이하 */
export function standouts(rows: FeatureRow[]): FeatureRow[] {
  return rows.filter((r) => !r.few && (r.ratio >= 1.3 || r.ratio <= 0.7)).sort((a, b) => Math.abs(Math.log(b.ratio || 0.01)) - Math.abs(Math.log(a.ratio || 0.01)));
}

/** 주간 7개 계획 (넓게 3 · 좁게 3 · 실험 1) — 개요 탭에서 보여 주는 기본 틀 */
export const WEEKLY_PLAN = [
  { kind: "넓게", count: 3, desc: "많은 사람이 공감하는 주제 (조회수·구독 유입)" },
  { kind: "좁게", count: 3, desc: "살 사람(불스아이 고객)만 콕 집는 주제 (문의·구매)" },
  { kind: "실험", count: 1, desc: "패턴 찾기에서 나온 가설 하나를 시험" },
] as const;
