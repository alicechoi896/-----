import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { fillSectionPhotos } = await import("@/lib/server/detail-page/service");

const sec = (kind: "hero" | "photo" | "text" | "spec" | "cta", photoKey: string | null = null) => ({ kind, title: "t", body: "b", photoKey });

describe("fillSectionPhotos (v0.9.169 상세페이지 사진 없는 섹션 채우기)", () => {
  it("첫 화면·사진·마무리의 빈 칸을 아직 안 쓴 사진으로 채우고, 글·표는 그대로", () => {
    const out = fillSectionPhotos([sec("hero"), sec("text"), sec("photo", "b"), sec("photo"), sec("spec"), sec("cta")], ["a", "b", "c"]);
    expect(out.map((x) => x.photoKey)).toEqual(["a", null, "b", "c", null, "a"]);
  });
  it("사진이 없으면 그대로", () => {
    const list = [sec("hero"), sec("photo")];
    expect(fillSectionPhotos(list, [])).toEqual(list);
  });
});
