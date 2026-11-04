import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { loadImage, createCanvas } from "@napi-rs/canvas";
import ffmpegPath from "ffmpeg-static";
import { cleanEdit, cutWindows, frameAt, outputWindow, previewStyle, sequentialStart } from "@/lib/video-production/source-edit";
import { manualFilter } from "@/lib/server/video/edit-filter";

const run = promisify(execFile);

describe("영상 편집 설정 (v0.9.165) — 계산", () => {
  it("창 계산: 배율·중심 → 9:16 화면 창, 가장자리 밖으로 안 나감", () => {
    expect(outputWindow({ zoom: 2, x: 0.5, y: 0.5 })).toEqual({ x: 0.25, y: 0.25, w: 0.5, h: 0.5 });
    expect(outputWindow({ zoom: 2, x: 0, y: 1 })).toEqual({ x: 0, y: 0.5, w: 0.5, h: 0.5 });
    expect(outputWindow({ zoom: 1.5, x: 0.5, y: 0.5 }).w).toBeCloseTo(0.667, 3);
  });
  it("미리보기 CSS 는 같은 창을 보여 준다 (scale = 1/창, 원점 = 창 위치 비율)", () => {
    const f = { zoom: 2, x: 0.3, y: 0.7 };
    const w = outputWindow(f);
    const st = previewStyle(f)!;
    expect(st.transform).toBe(`scale(${1 / w.w})`);
    // CSS: 원점 o 에서 z 배 → 보이는 왼쪽 = o·(1 - 1/z) = 창 x
    const ox = Number(st.transformOrigin.split("%")[0]) / 100;
    expect(ox * (1 - w.w)).toBeCloseTo(w.x, 3);
    expect(previewStyle({ zoom: 1, x: 0.5, y: 0.5 })).toBeUndefined();
  });
  it("시간별 확대: 그 시간에만, 겹치면 나중 것, 밖이면 기본 화면", () => {
    const e = { frame: { zoom: 1.2, x: 0.5, y: 0.5 }, zooms: [{ from: 3, to: 5, zoom: 1.5, x: 0.5, y: 0.5 }, { from: 4, to: 4.5, zoom: 2, x: 0.2, y: 0.2 }] };
    expect(frameAt(e, 2.9)?.zoom).toBe(1.2);
    expect(frameAt(e, 3)?.zoom).toBe(1.5);
    expect(frameAt(e, 4.2)?.zoom).toBe(2);
    expect(frameAt(e, 5)?.zoom).toBe(1.2);
  });
  it("컷 안 시간으로 바꾸기: 원본 3~4.5초 확대, 컷이 원본 2초부터 3초 → 컷 안 1~2.5초", () => {
    const w = cutWindows({ zooms: [{ from: 3, to: 4.5, zoom: 2, x: 0.25, y: 0.25 }] }, 2, 3);
    expect(w.base).toBeNull();
    expect(w.segs).toEqual([{ a: 1, b: 2.5, win: { x: 0, y: 0, w: 0.5, h: 0.5 } }]);
    expect(cutWindows({ zooms: [{ from: 10, to: 12, zoom: 2, x: 0.5, y: 0.5 }] }, 2, 3).segs).toEqual([]);
  });
  it("시작 초부터 차례로 (끝 없음): 5초로 정하면 첫 컷 5초, 다음 컷은 이어서, 영상 끝을 넘으면 시작으로", () => {
    expect(sequentialStart({ from: 5 }, 0, 1.5, 30)).toBe(5);
    expect(sequentialStart({ from: 5 }, 1.5, 1.5, 30)).toBe(6.5);
    expect(sequentialStart({ from: 5 }, 3.2, 2.1, 30)).toBe(8.2);
    // 예전 데이터의 끝(to)은 쓰지 않는다
    expect(sequentialStart({ from: 5, to: 6 }, 3, 1.5, 30)).toBe(8);
    // 영상 10초, 시작 5초, 컷 2초 → 5, 7, (9는 넘침) → 다시 5 근처
    expect(sequentialStart({ from: 5 }, 4, 2, 10)).toBeLessThan(8.01);
  });
  it("저장 정리: 예전 형식(화면만)도 받는다, 비면 null", () => {
    expect(cleanEdit({ zoom: 1.6, x: 0.4, y: 0.6 })).toEqual({ frame: { zoom: 1.6, x: 0.4, y: 0.6 } });
    expect(cleanEdit({ range: { from: 0 } })).toBeNull();
    expect(cleanEdit({ range: { from: 5, to: 9 }, zooms: [{ from: 6, to: 7, zoom: 1.5, x: 0.5, y: 0.5 }] })).toEqual({ range: { from: 5 }, zooms: [{ from: 6, to: 7, zoom: 1.5, x: 0.5, y: 0.5 }] });
  });
});

/**
 * 실제 FFmpeg 로 확인: 원본 0~2초 빨강 · 2~4초 초록 · 4~6초 파랑, 왼쪽 위 1/4 은 늘 흰색.
 * 구간 2초부터 3초 컷 + 원본 3~4.5초 200% 확대(왼쪽 위) → 컷 0.5초: 가운데 초록(확대 없음), 1.5초: 가운데 흰색(확대), 2.8초: 가운데 파랑
 */
describe("영상 편집 설정 — 결과 영상에 정확히 반영 (FFmpeg)", () => {
  it("시작 시점 · 확대 시점 · 확대 위치가 결과와 같다", async () => {
    const ff = ffmpegPath as unknown as string;
    const dir = await mkdtemp(path.join(os.tmpdir(), "edit-"));
    try {
      const src = path.join(dir, "src.mp4");
      await run(ff, ["-y", "-f", "lavfi", "-i", "color=red:s=1080x1920:d=2:r=30", "-f", "lavfi", "-i", "color=green:s=1080x1920:d=2:r=30", "-f", "lavfi", "-i", "color=blue:s=1080x1920:d=2:r=30", "-filter_complex", "[0][1][2]concat=n=3:v=1[c];[c]drawbox=x=0:y=0:w=540:h=960:color=white:t=fill[v]", "-map", "[v]", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-g", "15", src]);
      const start = 2;
      const dur = 3;
      const win = cutWindows({ range: { from: 2, to: 6 }, zooms: [{ from: 3, to: 4.5, zoom: 2, x: 0.25, y: 0.25 }] }, start, dur);
      const out = path.join(dir, "out.mp4");
      await run(ff, ["-y", "-ss", String(start), "-t", String(dur), "-i", src, "-filter_complex", manualFilter(win), "-map", "[base]", "-c:v", "libx264", "-pix_fmt", "yuv420p", out]);
      const center = async (t: number) => {
        const png = path.join(dir, `f${t}.png`);
        await run(ff, ["-y", "-ss", String(t), "-i", out, "-frames:v", "1", png]);
        const img = await loadImage(await readFile(png));
        const c = createCanvas(img.width, img.height);
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const [r, g, b] = ctx.getImageData(Math.round(img.width / 2), Math.round(img.height / 2), 1, 1).data;
        return { r, g, b };
      };
      const a = await center(0.5);
      expect(a.g).toBeGreaterThan(100);
      expect(a.r).toBeLessThan(60);
      const z = await center(1.5);
      expect(Math.min(z.r, z.g, z.b)).toBeGreaterThan(200);
      const c = await center(2.8);
      expect(c.b).toBeGreaterThan(150);
      expect(c.g).toBeLessThan(60);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
});
