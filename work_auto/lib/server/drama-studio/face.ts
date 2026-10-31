import { sceneCast } from "@/lib/drama-studio/prompts";
import "server-only";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { AppError } from "../http";
import { getAIProvider } from "../providers/registry";
import type { ChatContentPart } from "../providers/types";
import { runFfmpeg } from "../video/ffmpeg";
import { videoStorage } from "../video/storage";
import { baseImages } from "./tasks";
import type { DramaProject, FaceCheck } from "@/lib/drama-studio/types";

/**
 * 얼굴 일관성 검사 (v0.9.93) — 스토리보드 사진·영상 클립(가운데 프레임)의 인물이 캐릭터 기준 이미지와 같은 사람인지 AI 이미지 읽기로 본다.
 * 장면(클립) 하나 = AI 1회. 버튼을 눌렀을 때만, 한 번에 최대 30개. 결과는 사진·클립에 저장해 '얼굴 다름'으로 표시한다.
 */
const MAX_ITEMS = 30;

async function jpeg(buf: Buffer, max = 512): Promise<string> {
  const img = await loadImage(buf);
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = createCanvas(Math.round(img.width * k), Math.round(img.height * k));
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toBuffer("image/jpeg", 85).toString("base64");
}

async function clipFrame(key: string, durationSec: number): Promise<Buffer | null> {
  const buf = await videoStorage.download(key);
  if (!buf) return null;
  const dir = await mkdtemp(path.join(os.tmpdir(), "ds_face_"));
  try {
    const src = path.join(dir, "c.mp4");
    const out = path.join(dir, "f.jpg");
    await writeFile(src, buf);
    await runFfmpeg(["-ss", Math.max(0, durationSec * 0.6).toFixed(2), "-i", src, "-frames:v", "1", "-update", "1", out], 60_000);
    return await readFile(out);
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function faceCheck(p: DramaProject, target: "frames" | "clips", ids?: string[]): Promise<{ checked: number; flagged: number; aiCalls: number }> {
  const ai = await getAIProvider();
  if (ai.id !== "mock" && !ai.supportsVision) throw new AppError("NO_VISION", "연결된 AI 가 이미지를 읽지 못합니다. API 연결 센터에서 Claude 또는 OpenAI 를 연결해 주세요.", 409);
  // 검사할 것: 인물이 나오고 그 인물의 기준 이미지가 있는 장면
  const castOf = (sceneIds: string[]) =>
    [...new Set(sceneIds.flatMap((id) => {
      const s = p.scenario.scenes.find((x) => x.id === id);
      return s ? sceneCast(s, p.characters) : [];
    }))].filter((c) => baseImages(p, c.id).length > 0);
  type Item = { set: (r: FaceCheck) => void; sceneIds: string[]; load: () => Promise<Buffer | null> };
  const items: Item[] = [];
  if (target === "frames") {
    for (const s of p.scenario.scenes) {
      const img = (p.storyboard[s.id] ?? []).find((f) => f.approved && !f.removed) ?? (p.storyboard[s.id] ?? []).filter((f) => !f.removed).at(-1);
      if (!img || (ids && !ids.includes(s.id)) || !castOf([s.id]).length) continue;
      items.push({ set: (r) => (img.faceCheck = r), sceneIds: [s.id], load: () => videoStorage.download(img.key) });
    }
  } else {
    for (const c of p.clips) {
      if ((ids && !ids.includes(c.id)) || !castOf(c.sceneIds).length || (!ids && !c.approved)) continue;
      items.push({ set: (r) => (c.faceCheck = r), sceneIds: c.sceneIds, load: () => clipFrame(c.key, c.durationSec) });
    }
  }
  if (!items.length) throw new AppError("VALIDATION", "검사할 것이 없습니다 (인물이 나오고 그 인물의 기준 이미지를 고정한 장면만 검사합니다).");
  const list = items.slice(0, MAX_ITEMS);
  let aiCalls = 0;
  let flagged = 0;
  const run = async (it: Item) => {
    const cast = castOf(it.sceneIds).slice(0, 3);
    const at = new Date().toISOString();
    if (ai.id === "mock") {
      it.set({ ok: true, score: 9, note: "데모: 검사하지 않음", at });
      return;
    }
    const target = await it.load();
    if (!target) return;
    const parts: ChatContentPart[] = [];
    const names: string[] = [];
    for (const c of cast) {
      const base = await videoStorage.download(baseImages(p, c.id)[0].key);
      if (!base) continue;
      parts.push({ type: "image", mediaType: "image/jpeg", data: await jpeg(base) });
      names.push(c.name);
    }
    if (!names.length) return;
    parts.push({ type: "image", mediaType: "image/jpeg", data: await jpeg(target, 768) });
    parts.push({
      type: "text",
      text: [
        `앞의 이미지 ${names.length}장은 기준 인물이다: ${names.map((n, i) => `${i + 1}번 = ${n}`).join(", ")}. 마지막 이미지는 영상의 한 장면이다.`,
        "마지막 이미지에 나오는 사람들이 기준 인물과 같은 사람(같은 얼굴형·눈·코·입·머리 모양·나이)인지 엄격하게 판단한다. 조명·각도·표정 차이는 괜찮지만 다른 사람처럼 보이면 다르다고 한다.",
        '형식: JSON 만. {"same":true|false,"score":0~10(같을수록 높음),"note":"다르면 누가 어떻게 다른지 한국어 한 문장, 같으면 빈 문자열"}',
      ].join("\n"),
    });
    try {
      aiCalls++;
      const { text } = await ai.generateText({ task: "drama-studio:face-check", messages: [{ role: "system", content: "당신은 영상 속 인물 동일성을 확인하는 검수자다. JSON 으로만 답한다." }, { role: "user", content: parts }], maxTokens: 300 });
      const j = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { same?: boolean; score?: number; note?: string };
      const score = Math.min(10, Math.max(0, Number(j.score) || 0));
      const ok = j.same !== false && score >= 6;
      if (!ok) flagged++;
      it.set({ ok, score, note: String(j.note ?? "").slice(0, 200), at });
    } catch {
      /* 이 항목은 건너뜀 */
    }
  };
  for (let i = 0; i < list.length; i += 4) await Promise.all(list.slice(i, i + 4).map(run));
  return { checked: list.length, flagged, aiCalls };
}
