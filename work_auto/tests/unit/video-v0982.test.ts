import { describe, expect, it } from "vitest";
import { endingOf, endingProfile, endingRule } from "@/lib/script-format";
import { captionChunks } from "@/lib/video-production/config";
const { persistentBoxes, decideTreatment, boxesIn } = await import("@/lib/server/video/text-scan");

describe("v0.9.82 영상 자동 제작", () => {
  it("말끝 분포: 참고 대본이 '~다'·반말이면 '~요'를 거의 쓰지 말라고 한다", () => {
    expect(endingOf("이거 진짜 좋아요")).toBe("yo");
    expect(endingOf("이건 미쳤다.")).toBe("da");
    expect(endingOf("완전 강추함")).toBe("eum");
    expect(endingOf("이거 써봐")).toBe("banmal");
    expect(endingOf("합니다")).toBe("nida");
    const texts = ["이거 미쳤다\n가격 보고 놀람\n일단 써봐\n진짜 편하다\n이게 핵심이다", "솔직히 별로였음\n근데 이건 다르다\n한번 써보면 앎\n링크 확인해봐\n끝이다"];
    expect(endingProfile(texts).ratios.yo).toBe(0);
    const rule = endingRule(texts)!;
    expect(rule).toContain("가장 중요");
    expect(rule).toContain("'~요'로 거의 끝나지 않는다");
    expect(endingRule(["짧다"])).toBeNull();
  });
  it("자막 1줄 조각은 띄어쓰기에서만 나눈다 (낱말 중간 X)", () => {
    for (const c of captionChunks("사과인데 이거 하나면 주방 청소 화장실 청소 베란다 청소까지 끝")) expect(c.startsWith(" ") || c.endsWith(" ")).toBe(false);
    expect(captionChunks("사과인데 이거 하나면 주방 청소 화장실 청소 베란다 청소까지 끝").join(" ")).toBe("사과인데 이거 하나면 주방 청소 화장실 청소 베란다 청소까지 끝");
  });
  it("한 번이라도 보인 로고·자막은 다른 구간에서도 가린다 (확대)", () => {
    const scan = { checked: true, interval: 2, samples: [
      { t: 0.2, boxes: [] },
      { t: 10.2, boxes: [{ x: 0.75, y: 0.22, w: 0.2, h: 0.05 }] },
      { t: 20.2, boxes: [] },
      { t: 30.2, boxes: [{ x: 0.1, y: 0.82, w: 0.8, h: 0.06 }] },
      { t: 40.2, boxes: [] },
    ] };
    expect(boxesIn(scan, 20, 0.5)).toHaveLength(0);
    const tr = decideTreatment([...boxesIn(scan, 20, 0.5), ...persistentBoxes(scan)], true);
    expect(tr.kind).toBe("crop");
    expect(tr.crop!.y + tr.crop!.h).toBeLessThanOrEqual(0.82);
  });
});
