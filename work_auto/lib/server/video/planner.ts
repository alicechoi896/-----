import "server-only";
import type { GeneratedContent, ReferenceVideo } from "@/lib/types";
import type { VideoChannel, VideoPlan, VideoScene, VideoSourceMode } from "@/lib/types/video-production";
import { CAPTION_TEMPLATE, TOP_TITLE_TEMPLATE, VIDEO_RENDER_CONFIG, arrowSceneIndexes, sfxSceneIndexes } from "@/lib/video-production/config";
import { getAIProvider } from "../providers/registry";
import { videoAssets, sfxName } from "./assets";

/**
 * 컷 계획 (v0.9.51) — 2단계 결과(제목·Hook·CTA·대본)를 그대로 쓴다. 대본·제목을 AI 로 다시 만들지 않는다.
 * - 대본 → 컷: 한 줄(말 한 마디) = 한 컷 = 자막 한 줄 (브루에서 하던 방식). 긴 줄은 띄어쓰기에서 나눈다. 규칙으로만 (AI 0회)
 * - 상단 2줄: 1줄 = 제품명(짧게), 2줄 = 화면용 짧은 제목. 선택한 제목은 바꾸지 않고, 화면용만 AI 1회로 줄인다 (실패하면 규칙으로)
 * - 원본 영상 배치: 제품 연결 영상 먼저, 같은 원본이 이어지지 않게 돌아가며. 컷마다 [클립 교체] 가능
 * - 효과음: 약 2컷당 1회 (숫자·비교·장점·CTA 직전 컷 우선), 화살표: 4번째 컷 등, 엔딩: 마지막 컷
 */
const EMPHASIS = /\d|첫째|둘째|셋째|비교|차이|장점|핵심|가격|할인|최저|무게|배터리|카메라|진짜|꼭|반드시|링크|확인/;

/** 긴 줄 → 비슷한 길이 조각 n 개 (쉼표 뒤를 먼저, 없으면 띄어쓰기) */
function balancedSplit(line: string, max: number): string[] {
  const parts = Math.ceil(line.length / max);
  if (parts <= 1) return [line];
  const target = line.length / parts;
  const cuts: number[] = [];
  for (let k = 1; k < parts; k++) {
    const ideal = target * k;
    let best = -1;
    let bestScore = Infinity;
    for (let i = 1; i < line.length - 1; i++) {
      if (line[i] !== " ") continue;
      // 쉼표 바로 뒤는 자연스러운 끊는 곳 → 조금 더 멀어도 고른다
      const score = Math.abs(i - ideal) - (/[,，]/.test(line[i - 1]) ? 4 : 0);
      if (score < bestScore && (cuts.at(-1) ?? 0) < i) {
        bestScore = score;
        best = i;
      }
    }
    if (best > 0) cuts.push(best);
  }
  const out: string[] = [];
  let from = 0;
  for (const c of [...cuts, line.length]) {
    const piece = line.slice(from, c).trim();
    if (piece) out.push(piece);
    from = c;
  }
  return out;
}

export function splitScript(script: string): string[] {
  const max = CAPTION_TEMPLATE.maxCharsPerLine + 4;
  const lines = script
    .replace(/\r/g, "")
    .split(/\n+/)
    .flatMap((l) => l.split(/(?<=[.?!。！？])\s+/))
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const line of lines) {
    if (line.length <= max) {
      out.push(line);
      continue;
    }
    // 띄어쓰기에서 비슷한 길이로 나눈다 ('있어요'·'3가지'처럼 짧은 조각이 따로 남지 않게 쉼표·띄어쓰기 중 가운데에 가까운 곳)
    out.push(...balancedSplit(line, max));
  }
  return out.slice(0, VIDEO_RENDER_CONFIG.maxScenes);
}

/** 화면용 짧은 제목 (AI 1회, 의미를 바꾸지 않는다). 실패하면 규칙으로 자른다 */
async function shortTitles(title: string, productName: string | null, hook: string): Promise<{ line1: string; line2: string; aiCalls: number }> {
  const max1 = TOP_TITLE_TEMPLATE.line1.maxChars;
  const max2 = TOP_TITLE_TEMPLATE.line2.maxChars;
  const fallback = () => ({
    line1: (productName ?? title.split(/[,，:·]/)[0]).slice(0, max1),
    line2: (hook || title).replace(/\s+/g, " ").slice(0, max2),
    aiCalls: 0,
  });
  try {
    const ai = await getAIProvider();
    const { data } = await ai.generateStructured<{ line1?: string; line2?: string }>({
      task: "video-display-title",
      messages: [
        { role: "system", content: "당신은 쇼츠 썸네일 카피 편집자다. 원래 제목의 의미를 바꾸지 않고 짧게 줄인다." },
        {
          role: "user",
          content: [
            `[선택한 제목] ${title}`,
            productName ? `[제품명] ${productName}` : "",
            hook ? `[Hook] ${hook}` : "",
            `line1: 제품명 또는 주제 (${max1}자 이내, 브랜드+모델처럼 짧게)`,
            `line2: 시청자가 끝까지 보게 만드는 질문·약속 (${max2}자 이내, 제목·Hook 의 의미 그대로)`,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      outputKeys: ["line1", "line2"],
      jsonSchema: {
        type: "object",
        additionalProperties: false,
        required: ["line1", "line2"],
        properties: { line1: { type: "string" }, line2: { type: "string" } },
      },
      variables: { title, productName, hook },
    });
    const line1 = String(data.line1 ?? "").trim().slice(0, max1 + 2);
    const line2 = String(data.line2 ?? "").trim().slice(0, max2 + 2);
    return line1 && line2 ? { line1, line2, aiCalls: 1 } : fallback();
  } catch {
    return fallback();
  }
}

/** 컷마다 원본 영상: 제품 연결 영상 먼저, 같은 원본이 이어지지 않게 */
export function assignSources(scenes: VideoScene[], videos: ReferenceVideo[], productId: string | null): VideoScene[] {
  const ordered = [...videos].sort((a, b) => Number(b.productId === productId) - Number(a.productId === productId));
  if (!ordered.length) return scenes.map((s) => ({ ...s, sourceVideoId: s.pinned ? s.sourceVideoId : null }));
  let k = 0;
  return scenes.map((s, i) => {
    if (s.pinned && s.sourceVideoId) return s;
    let v = ordered[k % ordered.length];
    if (ordered.length > 1 && i > 0 && scenes[i - 1].sourceVideoId === v.id) v = ordered[++k % ordered.length];
    k++;
    return { ...s, sourceVideoId: v.id };
  });
}

export async function buildPlan(input: {
  content: GeneratedContent;
  scriptIndex: number;
  channelId: VideoChannel;
  sourceMode: VideoSourceMode;
  videos: ReferenceVideo[];
  voice: string;
  narrationOn?: boolean;
  captions?: boolean;
}): Promise<{ plan: VideoPlan; aiCalls: number }> {
  const { content } = input;
  const scripts = (content.context.userEdits?.script?.value ?? content.output.script) as string[] | string | undefined;
  const list = Array.isArray(scripts) ? scripts : scripts ? [scripts] : [];
  const script = list[Math.max(0, Math.min(list.length - 1, input.scriptIndex))] ?? "";
  const phrases = splitScript(script);
  const wf = content.context.workflow;
  const title = wf?.selected?.title || content.headline;
  const hook = wf?.selected?.hook || "";
  const productName = content.context.product?.name ?? null;
  const { line1, line2, aiCalls } = await shortTitles(title, productName, hook);
  const emphasis = phrases.map((p, i) => (EMPHASIS.test(p) ? i : -1)).filter((i) => i >= 0);
  emphasis.push(phrases.length - 2); // CTA 직전
  const sfxFiles = videoAssets.sfx();
  const sfxAt = new Set(sfxSceneIndexes(phrases.length, emphasis));
  const arrowAt = new Set(arrowSceneIndexes(phrases.length));
  let sfxTurn = 0;
  const scenes: VideoScene[] = phrases.map((narration, index) => ({
    index,
    narration,
    // 같은 효과음이 연달아 나오지 않게 돌아가며
    sfx: sfxAt.has(index) && sfxFiles.length ? sfxName(sfxFiles[sfxTurn++ % sfxFiles.length]) : null,
    arrow: arrowAt.has(index),
    sourceVideoId: null,
  }));
  const bgm = videoAssets.bgm();
  const plan: VideoPlan = {
    contentId: content.id,
    channelId: input.channelId,
    selectedTitle: title,
    topLine1: line1,
    topLine2: line2,
    script,
    sourceMode: input.sourceMode,
    sourceVideoIds: input.videos.map((v) => v.id),
    scenes: assignSources(scenes, input.videos, content.productId),
    ending: true,
    bgm: bgm.length ? sfxName(bgm[Math.floor(Math.random() * bgm.length)]) : null,
    voice: input.voice,
    narrationOn: input.narrationOn !== false,
    captions: input.captions !== false,
    meme: false,
  };
  return { plan, aiCalls };
}
