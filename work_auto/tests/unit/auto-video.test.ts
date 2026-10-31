import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { preferFormat, splitScriptLines, tidyDescription } = await import("@/lib/server/automation/auto-video");

describe("제품 영상 자동 제작 (v0.9.117)", () => {
  it("한 덩어리 대본은 문장마다 줄로 나눈다 (한 줄 = 한 컷)", () => {
    const one = "이거 모르고 사면 손해입니다. 380g이라 가방에 쏙 들어가요! 소음도 거의 없죠. 지금 링크 확인해 보세요.";
    const out = splitScriptLines(one).split("\n");
    expect(out.length).toBe(4);
    expect(out[1]).toBe("380g이라 가방에 쏙 들어가요!");
    const ready = "첫 줄\n둘째 줄\n셋째 줄\n넷째 줄";
    expect(splitScriptLines(ready)).toBe(ready);
  });
  it("Hook·CTA 는 대본 포맷 문장과 닮은 후보만 (없으면 전체)", () => {
    const format = ["이거 모르고 사면 무조건 후회합니다", "고정 댓글 링크에서 최저가 확인하세요"];
    const cands = ["이 마사지건 모르고 사면 무조건 후회합니다", "요즘 가장 핫한 아이템", "오늘의 꿀템 소개"];
    expect(preferFormat(cands, format)).toEqual(["이 마사지건 모르고 사면 무조건 후회합니다"]);
    expect(preferFormat(cands, [])).toEqual(cands);
    expect(preferFormat(["전혀 다른 문장"], format)).toEqual(["전혀 다른 문장"]);
  });
  it("설명: 문장마다 줄, 해시태그는 맨 아래", () => {
    const d = tidyDescription("가방에 쏙 들어가는 미니 마사지건. 저소음이라 사무실에서도 좋아요. #마사지건 #꿀템");
    expect(d).toBe("가방에 쏙 들어가는 미니 마사지건.\n저소음이라 사무실에서도 좋아요.\n\n#마사지건 #꿀템");
  });
});
