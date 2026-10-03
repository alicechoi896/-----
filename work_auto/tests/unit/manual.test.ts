import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MANUAL_CHAPTERS } from "@/lib/manual/content";
import shotsJson from "@/lib/manual/shots.json";
import type { ManualShot } from "@/lib/manual/types";

const SHOTS = shotsJson as Record<string, ManualShot>;
const sections = MANUAL_CHAPTERS.flatMap((c) => c.sections.map((s) => ({ chapter: c.no, ...s })));

describe("사용 매뉴얼 (docs/MANUAL.md)", () => {
  it("절마다 스크린샷이 있고 파일도 있다", () => {
    for (const s of sections.filter((x) => x.shot)) {
      const shot = SHOTS[s.shot!];
      expect(shot, `${s.chapter} ${s.title}: ${s.shot}`).toBeTruthy();
      expect(existsSync(path.join(process.cwd(), "public", shot.file)), shot.file).toBe(true);
    }
  });

  it("단계 번호와 화면의 강조 번호가 같다", () => {
    for (const s of sections.filter((x) => x.shot)) {
      const boxes = SHOTS[s.shot!].boxes.map((b) => b.n).sort();
      const steps = s.steps.map((st) => st.n).sort();
      expect(boxes, `${s.chapter} ${s.title}`).toEqual(steps);
    }
  });

  it("강조 상자가 화면 안에 있다", () => {
    for (const [id, shot] of Object.entries(SHOTS)) {
      for (const b of shot.boxes) {
        expect(b.y + b.h, `${id} ${b.n}`).toBeLessThanOrEqual(shot.h + 8);
        expect(b.x + b.w, `${id} ${b.n}`).toBeLessThanOrEqual(shot.w + 8);
      }
    }
  });

  it("id 가 겹치지 않는다 (주소 #앵커)", () => {
    const ids = MANUAL_CHAPTERS.flatMap((c) => c.sections.map((s) => `${c.id}-${s.id}`));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
