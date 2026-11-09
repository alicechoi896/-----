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

export async function matchScenes(narrations: string[], sources: { id: string; scan: TextScan }[], product = ""): Promise<{ wants: Map<number, SceneWant>; finds: Map<number, string>; aiCalls: number }> {
  const wants = new Map<number, SceneWant>();
  const finds = new Map<number, string>();
  // v0.9.185 제품 화면에 중국어가 보이는 장면·쓸모 낮은(흐림·제품 안 보임) 장면은 후보에서 뺀다
  const frames = sources
    .flatMap((s, si) => s.scan.samples.filter((x) => x.desc && !x.cn && (x.score ?? 5) >= 4).map((x) => ({ id: s.id, si, t: x.t, desc: x.desc!, score: x.score })))
    .slice(0, MAX_FRAMES);
  if (!frames.length || !narrations.length) return { wants, finds, aiCalls: 0 };
  const ai = await getAIProvider();
  if (typeof ai.generateText !== "function") return { wants, finds, aiCalls: 0 };
  const prompt = [
    "쇼츠 제품 영상을 만든다. 대본 한 줄마다 아래 장면 목록에서 내용이 가장 잘 맞는 장면 번호를 고른다.",
    "예: '충전이 빨라요' → 충전 케이블을 꽂거나 충전 표시가 보이는 장면, '소음이 없어요' → 조용히 쓰는 장면, '가벼워요' → 한 손으로 드는 장면, '수영·다이빙에도' → 물속·바다·수영장에서 차고 있는 장면, '터치가 부드러워요' → 손가락으로 화면을 터치하는 장면.",
    "같은 뜻이면 점수가 높은 장면(손으로 직접 쓰는 장면, 또렷한 장면)을 고른다.",
    "배터리·성능·가격처럼 눈으로 직접 보여 주기 어려운 기능은 제품을 손목에 차거나 손에 들고 쓰는 장면(점수 높은 것)을 고른다. 빈 상자·포장·배경·제품이 안 보이는 장면은 절대 고르지 않는다.",
    "대사에 나오는 특정 장소·동작(수영·바다·운동 등)이 장면 목록에 없으면 억지로 고르지 말고 0 (다른 줄에서 착용 장면으로 채운다).",
    "뜻이 맞는 장면이 없으면 0. 같은 장면을 여러 줄에 쓰지 않도록 되도록 다른 장면을 고른다.",
    "",
    "[대본]",
    ...narrations.map((n, i) => `${i + 1}. ${n}`),
    "",
    "[장면] 번호. 영상 · 초: 설명",
    ...frames.map((f, i) => `${i + 1}. 영상${f.si + 1} · ${f.t}초: ${f.desc}${f.score != null ? ` (점수 ${f.score})` : ""}`),
    "",
    `특정 장소·동작이 나오는데 맞는 장면이 없어 0 을 고른 줄은 find 에 그 장면을 찾을 짧은 한국어 검색어를 넣는다 (제품 이름 + 장면, 예: "${product || "애플워치 울트라"} 수영"). 다른 줄은 find 를 넣지 않는다.`,
    '형식: JSON 만. {"m":[{"line":1,"scene":12},{"line":3,"scene":0,"find":"…"},…]}',
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
    const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { m?: { line?: number; scene?: number; find?: string }[] };
    for (const r of json.m ?? []) {
      const line = Number(r.line) - 1;
      const f = frames[Number(r.scene) - 1];
      if (line >= 0 && line < narrations.length && f) wants.set(line, { id: f.id, t: f.t });
      const find = typeof r.find === "string" ? r.find.replace(/\s+/g, " ").trim().slice(0, 40) : "";
      if (line >= 0 && line < narrations.length && !f && find) finds.set(line, find);
    }
  } catch (e) {
    console.warn("[SceneMatch] 실패 — 기존 방식으로", e instanceof Error ? e.message.slice(0, 120) : "");
  }
  return { wants, finds, aiCalls: 1 };
}
