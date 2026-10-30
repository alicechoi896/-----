import "server-only";
import { getAIProvider } from "../providers/registry";
import type { TextScan } from "./text-scan";

/**
 * 대본 줄 ↔ 비슷한 장면 매핑 (v0.9.78). 예: "충전이 빨라요" → 충전 케이블을 꽂는 장면.
 * 원본 글자 검사 때 AI 가 적어 둔 장면 설명(desc)을 모아, 연결된 AI(Claude/OpenAI) 글 1회로 줄마다 가장 맞는 장면을 고른다.
 * 이미지는 다시 보내지 않는다 (설명만). 설명이 없으면(데모·이미지 읽기 미연결) 부르지 않는다. 실패해도 다시 부르지 않고 기존 방식으로.
 */
export interface SceneWant {
  id: string;
  t: number;
}

const MAX_FRAMES = 160;

export async function matchScenes(narrations: string[], sources: { id: string; scan: TextScan }[]): Promise<{ wants: Map<number, SceneWant>; aiCalls: number }> {
  const wants = new Map<number, SceneWant>();
  const frames = sources.flatMap((s, si) => s.scan.samples.filter((x) => x.desc).map((x) => ({ id: s.id, si, t: x.t, desc: x.desc! }))).slice(0, MAX_FRAMES);
  if (!frames.length || !narrations.length) return { wants, aiCalls: 0 };
  const ai = await getAIProvider();
  if (typeof ai.generateText !== "function") return { wants, aiCalls: 0 };
  const prompt = [
    "쇼츠 제품 영상을 만든다. 대본 한 줄마다 아래 장면 목록에서 내용이 가장 잘 맞는 장면 번호를 고른다.",
    "예: '충전이 빨라요' → 충전 케이블을 꽂거나 충전 표시가 보이는 장면, '소음이 없어요' → 조용히 쓰는 장면, '가벼워요' → 한 손으로 드는 장면.",
    "뜻이 맞는 장면이 없으면 0. 같은 장면을 여러 줄에 쓰지 않도록 되도록 다른 장면을 고른다.",
    "",
    "[대본]",
    ...narrations.map((n, i) => `${i + 1}. ${n}`),
    "",
    "[장면] 번호. 영상 · 초: 설명",
    ...frames.map((f, i) => `${i + 1}. 영상${f.si + 1} · ${f.t}초: ${f.desc}`),
    "",
    '형식: JSON 만. {"m":[{"line":1,"scene":12},…]}',
  ].join("\n");
  try {
    const { text } = await ai.generateText({
      task: "video-scene-match",
      messages: [
        { role: "system", content: "당신은 영상 편집자다. 대사와 뜻이 맞는 장면을 고른다. JSON 만 답한다." },
        { role: "user", content: prompt },
      ],
      maxTokens: 1500,
    });
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { m?: { line?: number; scene?: number }[] };
    for (const r of json.m ?? []) {
      const line = Number(r.line) - 1;
      const f = frames[Number(r.scene) - 1];
      if (line >= 0 && line < narrations.length && f) wants.set(line, { id: f.id, t: f.t });
    }
  } catch (e) {
    console.warn("[SceneMatch] 실패 — 기존 방식으로", e instanceof Error ? e.message.slice(0, 120) : "");
  }
  return { wants, aiCalls: 1 };
}
