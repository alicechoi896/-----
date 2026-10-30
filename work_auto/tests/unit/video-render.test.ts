import { describe, expect, it, vi } from "vitest";

/**
 * 영상 자동 제작 엔진 (v0.9.51) — 실제 FFmpeg(ffmpeg-static)로 데모 원본(시험 영상)을 렌더해 본다.
 * AI 음성·이미지 읽기는 없음(데모) → 음성 없이 자막 시간으로, 원본 글자 검사는 '검사 안 됨'.
 */
vi.mock("@/lib/server/providers/registry", () => ({
  getAIProvider: async () => ({ id: "mock", supportsVision: false }),
  getTTSProvider: async () => null,
}));

const { renderVideo } = await import("@/lib/server/video/render");
const { splitScript } = await import("@/lib/server/video/planner");
const { sfxSceneIndexes, arrowSceneIndexes } = await import("@/lib/video-production/config");
const { decideTreatment } = await import("@/lib/server/video/text-scan");

describe("영상 자동 제작", () => {
  it("대본 → 컷 (v0.9.82): 엔터로만 나눈다 — 긴 줄도 줄 중간에서 나누지 않음", () => {
    const s = splitScript("폰 고를 때 뭐부터 봐야할까요?\n\n이 3가지만 확인하세요\n먼저 화면이에요. 아이폰17은 120Hz로 화면이 아주 부드럽고 스크롤이 편해요");
    expect(s).toEqual(["폰 고를 때 뭐부터 봐야할까요?", "이 3가지만 확인하세요", "먼저 화면이에요. 아이폰17은 120Hz로 화면이 아주 부드럽고 스크롤이 편해요"]);
  });

  it("효과음·제품 보기 화살표 (v0.9.82): 3컷마다 같은 컷에, 첫 컷은 효과음, 마지막(엔딩) 컷은 빼고", () => {
    expect(arrowSceneIndexes(12)).toEqual([2, 5, 8]);
    expect(sfxSceneIndexes(12, [3, 4, 7])).toEqual([0, 2, 5, 8]);
    expect(arrowSceneIndexes(4)).toEqual([2]);
    expect(arrowSceneIndexes(3)).toEqual([]);
  });

  it("원본 글자 (v0.9.76): 자막·로고는 확대로 먼저 가리고, 안 되면 블러, 큰 글자는 제외", () => {
    expect(decideTreatment([], true).kind).toBe("clean");
    // 아래 자막 → 확대 (창 아래 끝이 자막 위)
    const bottom = decideTreatment([{ x: 0.1, y: 0.85, w: 0.8, h: 0.06 }], true);
    expect(bottom.kind).toBe("crop");
    expect(bottom.crop!.y + bottom.crop!.h).toBeLessThanOrEqual(0.85);
    expect(1 / bottom.crop!.w).toBeLessThanOrEqual(1.6);
    // 오른쪽 위 로고 → 확대
    const logo = decideTreatment([{ x: 0.78, y: 0.22, w: 0.18, h: 0.05 }], true);
    expect(logo.kind).toBe("crop");
    // 가운데 작은 글자 → 확대로 못 가려서 블러, 큰 글자 → 제외
    // v0.9.82: 최대 1.8배라 가운데 작은 글자도 확대로 가린다
    expect(decideTreatment([{ x: 0.4, y: 0.45, w: 0.2, h: 0.05 }], true).kind).toBe("crop");
    expect(decideTreatment([{ x: 0.3, y: 0.42, w: 0.4, h: 0.12 }], true).kind).toBe("blur");
    expect(decideTreatment([{ x: 0.05, y: 0.3, w: 0.9, h: 0.4 }], true).kind).toBe("rejected");
    // 상단 띠가 덮음
    expect(decideTreatment([{ x: 0.1, y: 0.02, w: 0.8, h: 0.08 }], true).kind).toBe("clean");
    // 가로 영상(16:9)은 꽉 채우기에서 양옆이 잘리므로 왼쪽 끝 로고는 이미 안 보임
    expect(decideTreatment([{ x: 0.02, y: 0.4, w: 0.12, h: 0.06 }], true, 16 / 9).kind).toBe("clean");
    // 검사 못 함 → 아래 자막 띠를 확대로 잘라 냄
    const un = decideTreatment([], false);
    expect(un.kind).toBe("unchecked");
    expect(un.crop!.y + un.crop!.h).toBeLessThanOrEqual(0.7);
  });

  it("렌더: 9:16 mp4 · 컷 길이 합 = 영상 길이 · 상단 제목·자막·엔딩", async () => {
    const stages: string[] = [];
    const job = {
      id: "vj_test",
      userId: "u",
      contentId: null,
      channelId: "youtube" as const,
      sourceMode: "xhs" as const,
      status: "queued" as const,
      plan: {
        contentId: null,
        channelId: "youtube" as const,
        selectedTitle: "아이폰 17 사기 전에 꼭 볼 3가지",
        topLine1: "Apple 아이폰 17",
        topLine2: "폰 고를 때 뭐부터 봐야할까요?",
        script: "",
        sourceMode: "xhs" as const,
        sourceVideoIds: ["v1", "v2"],
        scenes: ["폰 고를 때 뭐부터 봐야할까요?", "이 3가지만 확인하세요", "먼저 화면이에요", "아이폰17은 120Hz로", "할인링크 걸어두었어요"].map((narration, index) => ({
          index,
          narration,
          sfx: null,
          arrow: index === 3,
          sourceVideoId: index % 2 ? "v2" : "v1",
        })),
        ending: true,
        bgm: null,
        voice: "onyx",
        meme: false,
      },
      qa: { issues: [] },
      progress: 0,
      outputPath: null,
      error: null,
      claimedBy: null,
      claimedAt: null,
      createdAt: "",
      updatedAt: "",
    };
    const videos = ["v1", "v2"].map((id) => ({ id, userId: "u", url: `https://www.xiaohongshu.com/explore/${id}`, platform: "xiaohongshu" as const, title: id, channelName: "", durationSec: 10, thumbnailColor: "", note: null, createdAt: "" }));
    const out = await renderVideo(job, videos, { stage: async (s) => void stages.push(s) });
    if (process.env.VIDEO_OUT) (await import("node:fs")).writeFileSync(process.env.VIDEO_OUT, out.file);
    expect(out.file.length).toBeGreaterThan(10_000);
    expect(out.file.subarray(4, 8).toString()).toBe("ftyp"); // mp4
    expect(stages).toContain("rendering");
    expect(Math.abs((out.qa.durationSec ?? 0) - (out.qa.expectedDurationSec ?? 0))).toBeLessThan(0.5);
    expect(out.scenes.every((s) => s.textTreatment === "unchecked")).toBe(true);
    expect(out.qa.voice).toBe("none");
    // 같은 원본의 같은 구간을 반복하지 않는다
    const v1 = out.scenes.filter((s) => s.sourceVideoId === "v1").map((s) => s.sourceStart);
    expect(new Set(v1).size).toBe(v1.length);
  }, 180_000);

  it("음성·자막 끄기: 둘 다 없음도 만든다 (음성 off 는 검수 사유가 아님)", async () => {
    const videos = ["v1"].map((id) => ({ id, userId: "u", url: "https://www.xiaohongshu.com/explore/" + id, platform: "xiaohongshu" as const, title: id, channelName: "", durationSec: 10, thumbnailColor: "", note: null, createdAt: "" }));
    const job = {
      id: "vj_off", userId: "u", contentId: null, channelId: "naver-clip" as const, sourceMode: "xhs" as const, status: "queued" as const,
      plan: { contentId: null, channelId: "naver-clip" as const, selectedTitle: "t", topLine1: "제품", topLine2: "짧은 제목", script: "", sourceMode: "xhs" as const, sourceVideoIds: ["v1"],
        scenes: ["하나", "둘 셋", "넷"].map((narration, index) => ({ index, narration, sfx: null, arrow: false, sourceVideoId: "v1" })),
        ending: true, bgm: null, voice: "onyx", narrationOn: false, captions: false, meme: false },
      qa: { issues: [] }, progress: 0, outputPath: null, error: null, claimedBy: null, claimedAt: null, createdAt: "", updatedAt: "",
    };
    const out = await renderVideo(job, videos, { stage: async () => undefined });
    expect(out.qa.voice).toBe("off");
    expect(out.qa.issues.some((x) => x.includes("AI 음성"))).toBe(false);
    expect(out.file.subarray(4, 8).toString()).toBe("ftyp");
  }, 120_000);
});

describe("주목 효과·엔딩 (v0.9.64)", async () => {
  const { attentionSceneIndexes, ATTENTION_CONFIG } = await import("@/lib/video-production/config");
  it("효과음 컷 중 첫·마지막·화살표 컷을 빼고 최대 4개", () => {
    expect(attentionSceneIndexes(12, [0, 2, 4, 6, 8, 11], [4])).toEqual([2, 6, 8]);
    expect(attentionSceneIndexes(20, [0, 2, 4, 6, 8, 10, 12, 14, 16], [])).toHaveLength(ATTENTION_CONFIG.maxPerVideo);
  });
});

describe("장면 고르기 (v0.9.67)", async () => {
  const { pickSegment, wordsOf } = await import("@/lib/server/video/text-scan");
  const scan = {
    checked: true,
    interval: 1,
    samples: [
      { t: 0.5, boxes: [], score: 2, desc: "인트로 로고 화면" },
      { t: 3, boxes: [], score: 6, desc: "제품 박스 클로즈업" },
      { t: 6, boxes: [], score: 9, desc: "청소기로 바닥 미는 손" },
      { t: 9, boxes: [], score: 5, desc: "사람 얼굴" },
    ],
  };
  it("대사와 맞는 장면을 먼저 (앞부분이 아니라)", () => {
    const r = pickSegment({ narration: "바닥 청소가 10분이면 끝나요", dur: 1.5, used: new Map(), sources: [{ id: "a", duration: 10, scan, assigned: true }] });
    expect(r!.start).toBeGreaterThan(4.5);
    expect(r!.start).toBeLessThan(7);
  });
  it("맞는 말이 없으면 쓸모 점수 높은 장면, 쓴 구간은 피한다", () => {
    const used = new Map([["a", [[5.5, 7.5]] as [number, number][]]]);
    const r = pickSegment({ narration: "가격도 착해요", dur: 1, used, sources: [{ id: "a", duration: 10, scan, assigned: true }] });
    expect(r!.start < 5.5 - 1 || r!.start >= 7.5).toBe(true);
    expect(r!.start).toBeGreaterThan(1);
  });
  it("조사 떼고 단어 뽑기", () => {
    expect(wordsOf("바닥을 청소기로 밀어요")).toEqual(expect.arrayContaining(["바닥", "청소기"]));
  });
});

describe("말 사이 무음 없애기 (v0.9.72)", async () => {
  const { removePauses } = await import("@/lib/server/video/pauses");
  const { execFileSync, spawnSync } = await import("node:child_process");
  const { mkdtempSync } = await import("node:fs");
  const os = await import("node:os");
  const pathMod = await import("node:path");
  const ffmpeg = (await import("ffmpeg-static")).default as unknown as string;
  const durOf = (file: string) => {
    const log = spawnSync(ffmpeg, ["-i", file, "-f", "null", "-"], { encoding: "utf8" }).stderr ?? "";
    const m = [...log.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)].at(-1);
    return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
  };
  it("앞 0.3초 · 중간 0.8초 쉼 · 끝 0.5초 무음을 모두 줄인다 (소리 2초는 그대로)", async () => {
    const dir = mkdtempSync(pathMod.join(os.tmpdir(), "pause_"));
    const src = pathMod.join(dir, "a.wav");
    const out = pathMod.join(dir, "b.wav");
    // 0~0.3 무음, 0.3~1.3 소리, 1.3~2.1 무음, 2.1~3.1 소리, 3.1~3.6 무음
    execFileSync(ffmpeg, ["-y", "-f", "lavfi", "-i", "sine=f=300:d=3.6", "-af", "volume='if(lt(t,0.3)+between(t,1.3,2.1)+gt(t,3.1),0,1)':eval=frame", src], { stdio: "ignore" });
    await removePauses(src, out, { thresholdDb: -35, maxPause: 0.2, dir, key: "t" });
    expect(durOf(src)).toBeGreaterThan(3.5);
    const after = durOf(out);
    expect(after).toBeGreaterThan(1.9);
    expect(after).toBeLessThan(2.2);
  });
});

describe("영상 크기 읽기 (v0.9.74)", async () => {
  const { videoSize } = await import("@/lib/server/video/ffmpeg");
  const { execFileSync } = await import("node:child_process");
  const { mkdtempSync } = await import("node:fs");
  const os = await import("node:os");
  const pathMod = await import("node:path");
  const ffmpeg = (await import("ffmpeg-static")).default as unknown as string;
  it("세로 영상 크기를 읽는다 (예전엔 0×0 → 블러·확대가 빠졌다)", async () => {
    const f = pathMod.join(mkdtempSync(pathMod.join(os.tmpdir(), "vs_")), "a.mp4");
    execFileSync(ffmpeg, ["-y", "-f", "lavfi", "-i", "testsrc2=s=720x1280:d=1", "-c:v", "libx264", "-preset", "ultrafast", f], { stdio: "ignore" });
    expect(await videoSize(f)).toEqual({ width: 720, height: 1280 });
  });
});
