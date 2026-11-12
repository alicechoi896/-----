import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getVisionProvider } from "../providers/registry";
import type { ChatContentPart } from "../providers/types";
import { runFfmpeg } from "./ffmpeg";

/**
 * v0.9.185 편집 프리셋 자동 검수 — 완성된 컷 화면을 AI 이미지 읽기로 보고 프리셋을 지켰는지 확인한다.
 * 프리셋 (사용자 기본 규칙, 모든 영상):
 *  1) 제품이 화면 정가운데, 잘리지 않게
 *  2) 원본 자막·로고는 확대로 가리거나 제품을 가리지 않게 블러 — 남아 보이면 안 됨
 *  3) 대사와 장면이 맞게 (배터리·성능처럼 보여 주기 어려운 말은 착용·사용 장면)
 *  4) 화질 선명 (흐림·초점 나감·흔들림 안 됨)
 *  5) 제품(기기 화면 포함)에 중국어가 보이면 안 됨
 * 검수에 걸린 컷은 렌더가 다른 장면으로 바꿔 다시 검수한다 (render.ts).
 */
export const EDIT_PRESET = [
  "제품이 화면 정가운데 (잘리지 않게)",
  "원본 자막·로고는 확대로 가리거나 제품을 가리지 않게 블러",
  "대사와 맞는 장면 (보여 주기 어려운 말은 착용·사용 장면)",
  "화질 선명",
  "제품·기기 화면에 중국어 없음",
] as const;

export interface CutVerdict {
  k: number;
  ok: boolean;
  centered: boolean;
  foreignText: boolean;
  chinese: boolean;
  sharp: boolean;
  /** 0 = 안 맞음, 1 = 무난(착용·사용 장면), 2 = 잘 맞음 */
  match: number;
  reason: string;
}

/** 컷 영상에서 검수용 프레임 2장 (35%·80%) */
export async function grabReviewFrames(file: string, dur: number, dir: string, key: string): Promise<string[]> {
  const out: string[] = [];
  for (const [i, at] of [0.35, 0.8].entries()) {
    const f = path.join(dir, `${key}_r${i}.jpg`);
    try {
      await runFfmpeg(["-ss", (dur * at).toFixed(2), "-i", file, "-frames:v", "1", "-vf", "scale=-2:720", "-q:v", "4", "-y", f], 30_000);
      out.push(f);
    } catch {
      /* 이 프레임은 건너뜀 */
    }
  }
  return out;
}

const PER_CALL = 8;
/** 실패한 묶음을 다시 볼 때 (작게) */
const PER_CALL_RETRY = 3;

/** 컷마다 프리셋 판정. AI 를 못 쓰면(데모·미연결) 빈 결과 (검수 없이 통과) */
export async function reviewCuts(items: { k: number; narration: string; frames: string[] }[], product: string): Promise<{ verdicts: Map<number, CutVerdict>; aiCalls: number }> {
  const first = await reviewOnce(items, product, PER_CALL);
  const missing = items.filter((it) => !first.verdicts.has(it.k));
  if (!missing.length) return first;
  // v0.9.194 판정이 빠진 컷은 작게 나눠 한 번 더 (AI 글 읽기만, 유료 생성 아님)
  console.warn("[VideoQA] retry", JSON.stringify({ missing: missing.length, of: items.length }));
  const again = await reviewOnce(missing, product, PER_CALL_RETRY);
  for (const [k, v] of again.verdicts) first.verdicts.set(k, v);
  return { verdicts: first.verdicts, aiCalls: first.aiCalls + again.aiCalls };
}

async function reviewOnce(items: { k: number; narration: string; frames: string[] }[], product: string, perCall: number): Promise<{ verdicts: Map<number, CutVerdict>; aiCalls: number }> {
  const verdicts = new Map<number, CutVerdict>();
  const ai = await getVisionProvider();
  if (!ai.supportsVision || !items.length) return { verdicts, aiCalls: 0 };
  let aiCalls = 0;
  const batches: (typeof items)[] = [];
  for (let i = 0; i < items.length; i += perCall) batches.push(items.slice(i, i + perCall));
  await Promise.all(
    batches.map(async (batch) => {
      const parts: ChatContentPart[] = [];
      for (const [n, it] of batch.entries()) {
        parts.push({ type: "text", text: `[컷 ${n + 1}] 대사: "${it.narration || "(대사 없음)"}"` });
        for (const f of it.frames) parts.push({ type: "image", mediaType: "image/jpeg", data: (await readFile(f)).toString("base64") });
      }
      parts.push({
        type: "text",
        text: [
          `위는 쇼츠 제품 영상(제품: ${product || "영상 속 주인공 제품"})의 컷 ${batch.length}개다. 컷마다 화면 2장.`,
          "무시할 것: 맨 위 검은 띠의 제목, 화면 가운데·아래쪽의 흰 글자+검은 테두리 한국어 자막(우리가 넣은 것), 움직이는 스티커·화살표.",
          "컷마다 판정:",
          "- centered: 제품 본체가 화면 가로·세로 가운데쯤에 있고 가장자리에 잘리지 않으면 true. 제품이 안 보이거나 한쪽에 치우치거나 잘리면 false.",
          "- foreignText: 위 '무시할 것' 말고 원본 영상 위에 덧붙인 글자·제목·자막·워터마크·계정 ID(중국어·영어 등)가 읽을 수 있게 보이면 true — 제품 이름이 들어 있어도 덧붙인 글자면 true. 제품 본체·상자 표면·기기 화면 속의 제품 이름·로고·모델명만 괜찮다(false). 흐리게 블러된 곳도 false.",
          "- productVisible 은 따로 없다: 제품이 안 보이면(음식·옷걸이·풍경만) centered=false, match=0.",
          "- chinese: 기기 화면(디스플레이)이나 제품 위 설명 글자에 중국어(한자) 문장이 보이면 true. 영어·숫자 제품 이름·로고는 false.",
          "- sharp: 화면이 또렷하면 true, 흐림·초점 나감·심한 흔들림·뭉개짐이면 false.",
          "- match: 대사와 장면이 잘 맞으면 2, 대사가 배터리·성능처럼 보여 주기 어려운 내용이라 착용·사용 장면이면 1, 대사와 상관없는 장면(빈 상자·바닥·배경·다른 기능)이면 0.",
          "- reason: 문제가 있으면 한국어 20자 안 (없으면 빈 문자열).",
          '형식: JSON 만. {"cuts":[{"i":1,"centered":true,"foreignText":false,"chinese":false,"sharp":true,"match":2,"reason":""},…]}',
        ].join("\n"),
      });
      try {
        aiCalls++;
        const { text } = await ai.generateText({
          task: "video-cut-review",
          messages: [
            { role: "system", content: "당신은 깐깐한 쇼츠 영상 검수자다. 기준에 조금이라도 어긋나면 엄격하게 false 로 판정한다. JSON 만 답한다." },
            { role: "user", content: parts },
          ],
          maxTokens: 1500,
        });
        const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)) as { cuts?: { i?: number; centered?: boolean; foreignText?: boolean; chinese?: boolean; sharp?: boolean; match?: number; reason?: string }[] };
        for (const [n, it] of batch.entries()) {
          const r = json.cuts?.find((x) => Number(x.i) === n + 1);
          if (!r) continue;
          const v: CutVerdict = {
            k: it.k,
            centered: r.centered !== false,
            foreignText: r.foreignText === true,
            chinese: r.chinese === true,
            sharp: r.sharp !== false,
            match: Number.isFinite(Number(r.match)) ? Number(r.match) : 1,
            reason: String(r.reason ?? "").slice(0, 60),
            ok: true,
          };
          v.ok = v.centered && !v.foreignText && !v.chinese && v.sharp && v.match > 0;
          verdicts.set(it.k, v);
        }
      } catch (e) {
        // 검수 실패: 이유를 남긴다 (v0.9.194 — 실패가 조용히 묻혀 검수가 0번 돌았다)
        console.warn("[VideoQA] review fail", JSON.stringify({ provider: ai.id, model: ai.model, cuts: batch.length, error: e instanceof Error ? e.message.slice(0, 200) : String(e) }));
      }
    }),
  );
  return { verdicts, aiCalls };
}

/** 검수 결과를 사람이 읽는 말로 */
export function verdictText(v: CutVerdict): string {
  const why = [!v.centered && "제품이 가운데가 아님", v.foreignText && "원본 글자 보임", v.chinese && "제품에 중국어", !v.sharp && "흐림", v.match === 0 && "대사와 안 맞음"].filter(Boolean).join(", ");
  return why || v.reason || "기준 미달";
}
