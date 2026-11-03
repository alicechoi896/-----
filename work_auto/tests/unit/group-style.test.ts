import { describe, expect, it, vi } from "vitest";
import { DEFAULT_GROUP_STYLES, applyGroupStyle, cleanGroupStyle } from "@/lib/video-production/config";
import { cleanGroup, groupOf } from "@/lib/types/product";

vi.mock("server-only", () => ({}));
const { TITLE_BAR_FRAC, decideTreatment } = await import("@/lib/server/video/text-scan");

const plan = (): { titleOff?: boolean; ending: boolean; scenes: { arrow: boolean }[]; captionStyle: { font: "jua"; color: string; stroke: string; size: "m"; position: "center" | "lower" | "bottom" } } => ({ ending: true, scenes: [{ arrow: true }, { arrow: false }], captionStyle: { font: "jua" as const, color: "#fff", stroke: "#000", size: "m" as const, position: "lower" } });

describe("분류별 영상 스타일 (v0.9.162) — 가전은 절대 그대로", () => {
  it("가전(스타일 없음)은 같은 계획을 그대로 돌려준다", () => {
    const p = plan();
    expect(applyGroupStyle(p, null)).toBe(p);
    expect(applyGroupStyle(p, undefined)).toBe(p);
    expect(p).toEqual(plan());
  });
  it("생활·잡화 기본: 상단 제목·끝 화면·화살표 없음, 자막 가운데", () => {
    const r = applyGroupStyle(plan(), DEFAULT_GROUP_STYLES.living);
    expect(r.titleOff).toBe(true);
    expect(r.ending).toBe(false);
    expect(r.scenes.every((x) => !x.arrow)).toBe(true);
    expect(r.captionStyle.position).toBe("center");
  });
  it("저장한 설정 정리 · 분류 값", () => {
    expect(cleanGroupStyle({ title: true, captionPosition: "x" }, DEFAULT_GROUP_STYLES.living)).toEqual({ ...DEFAULT_GROUP_STYLES.living, title: true });
    expect(cleanGroup("living")).toBe("living");
    expect(cleanGroup("??")).toBe("appliance");
    expect(groupOf({})).toBe("appliance");
  });
  it("글자 피하기: 기본(가전)은 위쪽 띠가 가린 글자를 무시 — 예전과 같다, 제목을 끈 계획만 위쪽 글자도 피한다", () => {
    const topLogo = [{ x: 0.05, y: 0.02, w: 0.2, h: 0.04 }];
    expect(decideTreatment(topLogo, true)).toEqual(decideTreatment(topLogo, true, 9 / 16, TITLE_BAR_FRAC));
    expect(decideTreatment(topLogo, true).kind).toBe("clean");
    expect(decideTreatment(topLogo, true, 9 / 16, 0).kind).not.toBe("clean");
  });
});
