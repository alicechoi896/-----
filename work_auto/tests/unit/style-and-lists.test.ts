import { describe, expect, it } from "vitest";
import { buildStyleContext, renderStyleBlocks, sampleItems, styleSnapshot } from "@/lib/server/ai/style-context";
import { NAVER_LIST_COUNTS, buildTrendIdeas, relatedFirst, seasonOf, seasonalCandidates } from "@/lib/domain/naver-trend-lists";
import { dayKey, publicationDate, platformForChannel } from "@/lib/publish-platforms";
import { escapeCsvCell, styleToCsv } from "@/lib/style-csv";
import type { UserStyle } from "@/lib/types";

const range = (n: number, p: string) => Array.from({ length: n }, (_, i) => `${p} ${i + 1}`);
const style: UserStyle = {
  id: "sty1",
  userId: "u1",
  name: "테스트",
  channelIds: [],
  tone: "친근",
  description: "결론부터",
  rules: range(30, "규칙"),
  examplePhrases: range(15, "표현"),
  bannedPhrases: range(40, "금지"),
  hooks: range(12, "훅"),
  ctas: range(3, "CTA"),
  titlePatterns: range(14, "[제품] 패턴"),
  isDefault: false,
  createdAt: "",
  updatedAt: "",
};

describe("나의 스타일 → 생성 지시 (Style Context)", () => {
  it("10개 이하면 전부, 많으면 서로 다른 10개 (원래 순서 유지)", () => {
    expect(sampleItems(range(7, "a"), 10)).toEqual(range(7, "a"));
    const s = sampleItems(range(25, "h"), 10);
    expect(new Set(s).size).toBe(10);
    const idx = s.map((x) => Number(x.split(" ")[1]));
    expect([...idx].sort((a, b) => a - b)).toEqual(idx);
  });

  it("규칙·금지 표현은 항상 전부, 나머지는 표본", () => {
    const v = buildStyleContext({ style, channelId: "youtube" });
    expect(v.rules).toHaveLength(30);
    expect(v.bannedPhrases).toHaveLength(40);
    expect(v.hooks).toHaveLength(10);
    expect(v.ctas).toHaveLength(3);
    expect(v.titlePatterns).toHaveLength(10);
    expect(styleSnapshot(v).totals.hooks).toBe(12);
  });

  it("블로그는 Hook·CTA·제목을 블로그용으로 재해석하라고 지시한다", () => {
    const blog = renderStyleBlocks(buildStyleContext({ style, channelId: "naver-blog" })).map((b) => b.title + b.lines.join(" ")).join(" ");
    const video = renderStyleBlocks(buildStyleContext({ style, channelId: "naver-clip" })).map((b) => b.title + b.lines.join(" ")).join(" ");
    expect(blog).toContain("블로그 도입 문장으로 바꿔");
    expect(blog).toContain("검색형 블로그 제목");
    expect(video).toContain("영상 첫 3초 Hook");
    expect(video).not.toContain("블로그 도입");
  });
});

describe("NAVER 트렌드 목록 규칙", () => {
  it("계절: 3~5 봄 · 6~8 여름 · 9~11 가을 · 12~2 겨울", () => {
    expect(seasonOf(new Date("2026-04-10"))).toBe("spring");
    expect(seasonOf(new Date("2026-07-10"))).toBe("summer");
    expect(seasonOf(new Date("2026-10-03"))).toBe("autumn");
    expect(seasonOf(new Date("2026-01-15"))).toBe("winter");
  });

  it("시즌 키워드는 프로필 분야 묶음을 앞에", () => {
    const list = seasonalCandidates("가전", new Date("2026-12-10"));
    expect(list.slice(0, 3)).toEqual(["전기요", "온수매트", "가습기"]);
    expect(list.length).toBeGreaterThanOrEqual(NAVER_LIST_COUNTS.seasonalKeywords);
  });

  it("관련 검색어는 검색어가 들어간 것을 먼저", () => {
    const sorted = relatedFirst([{ text: "냉장고" }, { text: "세탁기 추천" }, { text: "에어컨" }, { text: "드럼세탁기" }], "세탁기");
    expect(sorted.map((x) => x.text)).toEqual(["세탁기 추천", "드럼세탁기", "냉장고", "에어컨"]);
  });

  it("아이디어는 겹치지 않게 30개까지", () => {
    const kw = (t: string) => ({ text: t, source: "naver" as const });
    const ideas = buildTrendIdeas("세탁기", ["건조기", "통돌이", "드럼"].map(kw), [], [], "가전");
    expect(new Set(ideas).size).toBe(ideas.length);
    expect(ideas.length).toBe(NAVER_LIST_COUNTS.contentIdeas);
  });
});

describe("업로드 관리 날짜·플랫폼", () => {
  it("캘린더 날짜 = 실제 업로드일 → 예약일 → 등록일 (한국 시간)", () => {
    expect(publicationDate({ publishedAt: "2026-10-02T16:00:00Z", scheduledAt: "2026-10-05T00:00:00Z", createdAt: "2026-10-01T00:00:00Z" })).toBe("2026-10-02T16:00:00Z");
    expect(dayKey("2026-10-02T16:00:00Z")).toBe("2026-10-03"); // UTC 16시 = 한국 다음날 1시
    expect(platformForChannel("naver-clip")).toBe("naver-clip");
    expect(platformForChannel("모름")).toBe("other");
  });
});

describe("나의 스타일 CSV", () => {
  it("수식 주입 방지 · 따옴표 이스케이프 · 엑셀용 BOM", () => {
    expect(escapeCsvCell("=SUM(A1)")).toBe(`"'=SUM(A1)"`);
    expect(escapeCsvCell('따옴표 "강조"')).toBe(`"따옴표 ""강조"""`);
    const csv = styleToCsv({ hooks: ["훅"], ctas: [], titlePatterns: [], rules: [], examplePhrases: [], bannedPhrases: ["@멘션"] });
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain(`banned_phrase,"'@멘션"`);
  });
});
