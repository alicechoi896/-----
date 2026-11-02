import { describe, expect, it } from "vitest";
import { featureTable, featuresOf, hasLossWord, hasNumberTitle, isQuestion, median, openingOf, standouts, type AnalyticsVideo } from "@/lib/domain/analytics";

const v = (title: string, views: number, durationSec = 25, extra: Partial<AnalyticsVideo> = {}): AnalyticsVideo => ({
  videoId: title,
  url: `https://www.youtube.com/shorts/${title}`,
  title,
  publishedAt: "2026-10-05T01:00:00Z",
  durationSec,
  views,
  likes: null,
  comments: null,
  thumbnailUrl: null,
  contentId: null,
  hook: null,
  screenTitle: null,
  kind: null,
  kindBy: null,
  thumbTitle: null,
  formatName: null,
  productName: null,
  ...extra,
});

describe("성과 분석 (v0.9.151)", () => {
  it("첫 3초 말: 시작 시각이 3초 전인 컷 대사, 시각이 없으면 첫 컷", () => {
    expect(openingOf([{ narration: "이거 모르면 손해", start: 0 }, { narration: "두 번째", start: 1.8 }, { narration: "세 번째", start: 3.4 }])).toBe("이거 모르면 손해 두 번째");
    expect(openingOf([{ narration: "첫 컷" }, { narration: "둘째" }])).toBe("첫 컷");
    expect(openingOf([])).toBeNull();
  });

  it("주제 넓이는 특징이 된다", () => {
    expect(featuresOf(v("a", 1, 20, { kind: "narrow" }))["주제 넓이"]).toBe("좁게");
  });

  it("중앙값", () => {
    expect(median([])).toBe(0);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 10])).toBe(2.5);
  });

  it("제목 특징 판별", () => {
    expect(hasNumberTitle("청소기 고르는 3가지")).toBe(true);
    expect(hasNumberTitle("청소기 추천")).toBe(false);
    expect(isQuestion("왜 다들 이걸 살까?")).toBe(true);
    expect(hasLossWord("모르면 손해입니다")).toBe(true);
  });

  it("길이·요일(KST) 특징", () => {
    const f = featuresOf(v("a", 100, 14, { thumbTitle: "딱 이거" }));
    expect(f["영상 길이"]).toBe("15초 이하");
    expect(f["올린 요일"]).toBe("월요일"); // 2026-10-05 10:00 KST
    expect(f["올린 시간 (한국)"]).toBe("오전 6~12시");
    expect(f["섬네일 글자 수"]).toBe("6자 이하");
  });

  it("특징별 배수 = 그룹 중앙값 ÷ 전체 중앙값, 표본 3개 미만은 few", () => {
    const vids = [v("3가지 꿀팁", 3000), v("5가지 실수", 3200), v("2가지 비교", 2800), v("그냥 후기", 1000), v("일반 리뷰", 900), v("사용기", 1100)];
    const t = featureTable(vids);
    expect(t.overallMedian).toBe(1950);
    const num = t.rows.find((r) => r.group === "제목에 숫자" && r.label.startsWith("있음"))!;
    expect(num.n).toBe(3);
    expect(num.ratio).toBeCloseTo(3000 / 1950, 2);
    expect(num.few).toBe(false);
    expect(standouts(t.rows).some((r) => r.group === "제목에 숫자")).toBe(true);
    const loss = t.rows.find((r) => r.group === "손실 회피 단어" && r.label.startsWith("있음"));
    expect(loss?.few).toBe(true);
  });
});
