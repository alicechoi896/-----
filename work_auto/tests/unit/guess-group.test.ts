import { describe, expect, it } from "vitest";
import { cleanGroup, guessGroup } from "@/lib/types/product";

describe("guessGroup (v0.9.168 학습 저장 때 분류 미리 고르기)", () => {
  it("카테고리 글자로 분류를 고른다", () => {
    expect(guessGroup("가전디지털 > 생활가전 > 청소기")).toBe("appliance");
    expect(guessGroup("패션의류 > 여성 원피스")).toBe("fashion");
    expect(guessGroup("여행 > 국내 숙박 > 펜션")).toBe("stay");
    expect(guessGroup("주방용품 > 수납")).toBe("living");
  });
  it("모르면 가전 (기존 동작 그대로)", () => {
    expect(guessGroup("")).toBe("appliance");
    expect(guessGroup("기타")).toBe("appliance");
    expect(cleanGroup(undefined)).toBe("appliance");
  });
});
