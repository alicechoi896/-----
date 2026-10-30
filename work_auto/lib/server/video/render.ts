import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ReferenceVideo } from "@/lib/types";
import type { TextTreatment, VideoJob, VideoQa, VideoScene } from "@/lib/types/video-production";
import {
  ARROW_PLACEMENT,
  CAPTION_TEMPLATE,
  ENDING_ARROW_PLACEMENT,
  ATTENTION_CONFIG,
  ENDING_TEMPLATE,
  VIDEO_RENDER_CONFIG as C,
  atempoFor,
  captionChunks,
  cleanPause,
  cleanTarget,
  playTempo,
  cleanCaptionStyle,
  cleanTitleStyle,
  voiceInstructions,
} from "@/lib/video-production/config";
import { getTTSProvider } from "../providers/registry";
import { videoAssets } from "./assets";
import { mediaDuration, runFfmpeg, videoSize } from "./ffmpeg";
import { SourceError, fetchSource, type LocalSource } from "./source";
import { removePauses } from "./pauses";
import { TypecastTTSProvider } from "../providers/tts/typecast";
import { groupLines, splitByChars, splitBySilence } from "@/lib/video-production/voice-split";
import { parseSilences } from "@/lib/silence-cut";
import { aiClipService } from "./ai-clips";
import { isAiSource } from "@/lib/types/video-production";
import { pickSegment, scanText, type Treatment, type TextScan } from "./text-scan";
import { captionY, endingY, renderCaption, renderEnding, renderSticker, renderTitleBar } from "./text-image";

/**
 * 영상 렌더 엔진 (v0.9.51) — Vercel 함수 1번 안에서 끝낸다 (임시 폴더에서 만들고 지운다).
 * 순서: 원본 받기 → 원본 글자 검사 → AI 음성(마디마다, 앞뒤 무음 정리) → 컷마다 구간 고르기·크롭·블러 → 컷 잇기
 *      → 상단 제목·자막·화살표·엔딩 → 배경음악·효과음 → mp4 → 자동 검사
 * 외부 호출: AI(이미지 읽기·음성)만. TikHub 검색·Bright Data·YouTube·NAVER = 0 (샤오홍슈 재생 주소가 막힐 때만 TikHub 상세 1회).
 */
export interface RenderHooks {
  stage: (status: VideoJob["status"], progress: number) => Promise<void>;
}

export interface RenderOutput {
  file: Buffer;
  scenes: VideoScene[];
  qa: VideoQa;
  aiCalls: number;
}

const W = C.width;
const H = C.height;

export async function renderVideo(job: VideoJob, videos: ReferenceVideo[], hooks: RenderHooks): Promise<RenderOutput> {
  const dir = path.join(os.tmpdir(), `vj_${job.id.replace(/[^\w-]/g, "")}`);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const issues: string[] = [];
  let aiCalls = 0;
  try {
    const plan = job.plan;
    const scenes = plan.scenes.map((s) => ({ ...s }));
    if (!scenes.length) throw new Error("대본에서 컷을 만들지 못했습니다.");

    // 2) AI 음성 (마디마다) → 앞뒤 무음 정리 → 속도 → 길이. v0.9.67: 원본 받기·글자 검사와 동시에, 8개씩
    // 음성 끄기(자막만·둘 다 없음)를 고르면 TTS 를 부르지 않는다
    const wantVoice = plan.narrationOn !== false;
    const engine = plan.ttsEngine === "typecast" ? "typecast" : "openai";
    const tts = wantVoice ? await getTTSProvider(engine) : null;
    if (wantVoice && !tts) issues.push(`AI 음성이 연결되지 않아(${engine === "typecast" ? "타입캐스트" : "OpenAI"}) 음성 없이 자막 시간으로 만들었습니다.`);
    let voiceTempo = 1;
    const audioPromise = (async () => {
    const audio: { file: string; dur: number }[] = new Array(scenes.length);
    // v0.9.77: 타입캐스트는 대본 전체를 한 번에 만들고(시간표 있는 음성) 글자 시각으로 줄마다 자른다
    // — 줄마다 동시에 부르면 '동시 요청이 너무 많음'(429). 톤도 컷마다 달라지지 않는다
    if (tts instanceof TypecastTTSProvider) {
      for (const g of groupLines(scenes.map((s) => s.narration))) {
        const lines = g.map((k) => scenes[k].narration);
        try {
          const r = await tts.synthesizeWithTimestamps(lines.join("\n"), plan.voice, { emotion: plan.ttsEmotion });
          aiCalls++;
          const whole = path.join(dir, `w${g[0]}.${r.format}`);
          await writeFile(whole, r.audio);
          const dur = r.duration || (await mediaDuration(whole));
          let spans = splitByChars(lines, r.chars, dur);
          if (!spans) {
            const probe = await runFfmpeg(["-i", whole, "-af", `silencedetect=noise=${C.silenceThresholdDb}dB:d=0.08`, "-f", "null", "-"], 60_000);
            spans = splitBySilence(lines, parseSilences(probe.stderr, dur), dur);
          }
          await Promise.all(
            g.map(async (k, n) => {
              const [a, b] = spans![n];
              const piece = path.join(dir, `a${k}_w.wav`);
              const out = path.join(dir, `a${k}.wav`);
              await runFfmpeg(["-i", whole, "-ss", a.toFixed(3), "-to", b.toFixed(3), "-ar", "44100", "-ac", "1", piece]);
              await removePauses(piece, out, { thresholdDb: C.silenceThresholdDb, maxPause: cleanPause(plan.maxPauseSec), dir, key: `a${k}` });
              audio[k] = { file: out, dur: await mediaDuration(out) };
            }),
          );
        } catch (e) {
          issues.push(`타입캐스트 음성(${g[0] + 1}~${g[g.length - 1] + 1}번 컷): ${e instanceof Error ? e.message : String(e)}`);
          // 같은 오류가 나도 다시 부르지 않는다 (아래에서 음성 없이 자막 시간으로)
          for (const k of g) audio[k] = audio[k] ?? (await silentScene(k));
        }
      }
    }
    async function silentScene(k: number) {
      const out = path.join(dir, `a${k}.wav`);
      const dur = Math.max(0.7, scenes[k].narration.replace(/\s/g, "").length / C.charsPerSec);
      await runFfmpeg(["-f", "lavfi", "-i", `anullsrc=r=44100:cl=mono`, "-t", dur.toFixed(2), "-y", out]);
      return { file: out, dur };
    }
    for (let i = 0; i < scenes.length; i += 8) {
      await Promise.all(
        scenes.slice(i, i + 8).map(async (s, j) => {
          const k = i + j;
          if (audio[k]) return;
          const out = path.join(dir, `a${k}.wav`);
          if (tts) {
            try {
              const mp3 = path.join(dir, `a${k}.mp3`);
              await writeFile(mp3, await tts.synthesize(s.narration, plan.voice, voiceInstructions(plan.voiceStyle), { emotion: plan.ttsEmotion }));
              aiCalls++;
              // v0.9.72: 앞뒤 무음 + 문장 중간의 긴 쉼(기본 0.2초 넘는 것)까지 모두 없앤다 (무음 구간 자르기와 같은 방식)
              await removePauses(mp3, out, { thresholdDb: C.silenceThresholdDb, maxPause: cleanPause(plan.maxPauseSec), dir, key: `a${k}` });
              audio[k] = { file: out, dur: await mediaDuration(out) };
              return;
            } catch (e) {
              issues.push(`${k + 1}번 컷 음성: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
          const dur = Math.max(0.7, s.narration.replace(/\s/g, "").length / C.charsPerSec);
          await runFfmpeg(["-f", "lavfi", "-i", `anullsrc=r=44100:cl=mono`, "-t", dur.toFixed(2), out]);
          audio[k] = { file: out, dur };
        }),
      );
    }
    // 속도: 고른 말하기 속도, 목표 길이를 골랐는데 그래도 길면 더 빠르게 (최대 3배) — v0.9.75
    const target = cleanTarget(plan.targetSec);
    const raw = audio.reduce((n, a) => n + (a?.dur ?? 0), 0);
    const fixed = scenes.length * C.minSpeechGapSec + C.tailSec;
    const tempo = playTempo(raw, target, fixed, plan.voiceSpeed);
    if (target && raw / tempo + fixed > target + 1) issues.push(`대본이 길어 3배 속도로도 목표 ${target}초보다 깁니다 (약 ${Math.round(raw / tempo + fixed)}초). 대본을 줄이거나 더 긴 길이를 골라 주세요.`);
    const chain = atempoFor(tempo);
    if (chain) {
      await Promise.all(
        audio.map(async (a, k) => {
          if (!a) return;
          if (!tts) {
            // 음성 없이 자막 시간: 글자 수 시간도 같은 비율로
            const d = Math.max(0.5, a.dur / tempo);
            await runFfmpeg(["-f", "lavfi", "-i", `anullsrc=r=44100:cl=mono`, "-t", d.toFixed(2), "-y", a.file]);
            audio[k] = { file: a.file, dur: d };
            return;
          }
          const fast = a.file.replace(/\.wav$/, "_f.wav");
          await runFfmpeg(["-i", a.file, "-af", chain, "-ar", "44100", "-ac", "1", fast]);
          audio[k] = { file: fast, dur: await mediaDuration(fast) };
        }),
      );
    }
    voiceTempo = tempo;
    return audio;
    })();

    // 1) 원본 받기 + 글자 검사 (쓰는 원본만, 동시에 3개씩)
    await hooks.stage("analyzing", 5);
    const used = [...new Set(scenes.map((s) => s.sourceVideoId).filter((x): x is string => Boolean(x) && !isAiSource(x)))];
    const byId = new Map(videos.map((v) => [v.id, v]));
    const sources = new Map<string, LocalSource & { scan: TextScan }>();
    const sourceErrors: string[] = [];
    const missing = used.filter((id) => !byId.has(id)).length;
    const loadOne = async (id: string, k: number) => {
      const v = byId.get(id);
      if (!v) return;
      try {
        const src = await fetchSource(v, dir, k);
        const { scan, aiCalls: n } = await scanText(src.file, src.duration, dir, `s${k}`);
        aiCalls += n;
        sources.set(id, { ...src, scan });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        sourceErrors.push(msg);
        issues.push(msg);
        throw e;
      }
    };
    // 첫 원본을 먼저 받아 본다: 영상 서버가 우리 서버를 거절하면(다운로드 단계) 나머지는 부르지 않는다 (TikHub 비용 절약, v0.9.59)
    let stopAll = false;
    if (used.length) {
      await loadOne(used[0], 0).catch((e) => {
        if (e instanceof SourceError && e.stage === "download") stopAll = true;
      });
    }
    for (let i = 1; !stopAll && i < used.length; i += 3) {
      await Promise.all(used.slice(i, i + 3).map((id, j) => loadOne(id, i + j).catch(() => undefined)));
    }
    // AI 컷 (v0.9.60): Kie 결과 영상 — 글자 없는 AI 영상이라 글자 검사(AI 이미지 읽기)를 하지 않는다
    const aiFiles = await aiClipService.download(job.plan, dir, issues);
    for (const [id, f] of aiFiles) sources.set(id, { videoId: id, file: f.file, duration: f.duration, title: f.title, scan: { samples: [], checked: true, interval: 1 } });
    if (!sources.size) {
      const why = !used.length && aiFiles.size === 0 && (job.plan.aiClips ?? []).length
        ? "AI 컷 영상을 받지 못했습니다. 위의 이유를 확인해 주세요: " + issues.slice(-2).join(" / ")
        : !used.length
        ? "컷에 원본 영상이 하나도 배정되지 않았습니다. [컷 계획 만들기]를 다시 눌러 주세요."
        : missing === used.length
          ? "고른 원본 영상을 찾지 못했습니다 (삭제되었거나 다른 사용자 영상). 영상 소재를 다시 골라 주세요."
          : (sourceErrors[0] ?? "원본을 받지 못했습니다.") + (stopAll && used.length > 1 ? ` · 같은 이유로 나머지 ${used.length - 1}개는 받지 않았습니다.` : "");
      console.error("[VideoSource] none", JSON.stringify({ jobId: job.id, used: used.length, missing, errors: sourceErrors.slice(0, 3) }));
      throw new Error(`쓸 수 있는 원본 영상이 없습니다. ${why}`);
    }

    const audio = await audioPromise;
    await hooks.stage("editing", 30);

    // 3) 컷마다 원본 구간 고르기 (글자 없는 구간 우선, 같은 구간 반복 금지) → 컷 영상
    // v0.9.76: 원본 비율 (확대할 때 꽉 채우기로 잘리는 부분까지 계산)
    const aspects = new Map<string, number>();
    await Promise.all([...sources.entries()].map(async ([id, x]) => {
      const z = await videoSize(x.file).catch(() => ({ width: 0, height: 0 }));
      aspects.set(id, z.width && z.height ? z.width / z.height : 9 / 16);
    }));
    const usedRanges = new Map<string, [number, number][]>();
    let t = 0;
    const picks: { k: number; s: (typeof scenes)[number]; src: LocalSource & { scan: TextScan }; best: { id: string; start: number; tr: Treatment }; dur: number }[] = [];
    for (const [k, s] of scenes.entries()) {
      const isLast = k === scenes.length - 1;
      let dur = audio[k].dur + C.minSpeechGapSec + (isLast ? C.tailSec : 0);
      // 엔딩(최저가 구매링크 + 화살표)은 2초 넘게 보이게 (v0.9.64)
      if (isLast && job.plan.ending) dur = Math.max(dur, C.endingMinSec);
      // 이 컷의 원본: 정한 것 → 안 되면 다른 원본 중 가장 깨끗한 것.
      // AI 컷은 AI 로 정한 컷에만 쓴다 (글자 없는 AI 컷이 샤오홍슈 컷을 모두 가져가지 않게, v0.9.64)
      const aiScene = isAiSource(s.sourceVideoId);
      const others = [...sources.keys()].filter((id) => id !== s.sourceVideoId && (aiScene || !isAiSource(id)));
      const candidates = [s.sourceVideoId, ...others].filter((x): x is string => Boolean(x && sources.has(x)));
      let best: { id: string; start: number; tr: Treatment } | null = null;
      if (aiScene && s.sourceVideoId && sources.has(s.sourceVideoId)) {
        // AI 컷(5초, 글자 없음)은 여러 컷에 나눠 쓴다: 겹쳐도 되고, 쓸 때마다 시작 위치만 바꾼다
        const src = sources.get(s.sourceVideoId)!;
        const maxStart = Math.max(0, src.duration - dur - 0.1);
        best = { id: s.sourceVideoId, start: maxStart > 0 ? ((usedRanges.get(s.sourceVideoId) ?? []).length * 1.7) % maxStart : 0, tr: { kind: "clean" } };
      } else {
        // v0.9.67: 대사와 맞는 장면·쓸모 점수 높은 장면 (앞에서부터 차례로가 아니라)
        best = pickSegment({
          narration: s.narration,
          dur,
          used: usedRanges,
          sources: candidates.filter((id) => !isAiSource(id)).map((id) => ({ id, duration: sources.get(id)!.duration, scan: sources.get(id)!.scan, assigned: id === s.sourceVideoId, aspect: aspects.get(id) })),
        });
      }
      // 샤오홍슈 원본을 하나도 쓸 수 없으면(받기 실패·글자를 못 가림) AI 컷으로 대신
      if ((!best || best.tr.kind === "rejected") && !aiScene) {
        const ai = [...sources.keys()].find((id) => isAiSource(id));
        if (ai) {
          const src = sources.get(ai)!;
          const n = (usedRanges.get(ai) ?? []).length;
          const maxStart = Math.max(0, src.duration - dur - 0.1);
          best = { id: ai, start: maxStart > 0 ? (n * 1.7) % maxStart : 0, tr: { kind: "clean" } };
          s.issue = candidates.length ? "샤오홍슈 원본의 글자를 가리지 못해 AI 컷으로 대신했습니다." : "샤오홍슈 원본을 받지 못해 AI 컷으로 대신했습니다.";
        }
      }
      if (!best || best.tr.kind === "rejected") {
        // 모든 원본이 안 되면 첫 원본을 반복 없이 못 쓰므로 검수 필요로 (가장 덜 나쁜 구간)
        const id = candidates[0] ?? [...sources.keys()][0];
        best = { id, start: 0, tr: { kind: "rejected" } };
        s.issue = "원본 글자를 확실히 가리지 못했습니다. 다른 클립으로 바꿔 주세요.";
      }
      const src = sources.get(best.id)!;
      usedRanges.set(best.id, [...(usedRanges.get(best.id) ?? []), [best.start, best.start + dur]]);
      s.sourceVideoId = best.id;
      s.sourceStart = Number(best.start.toFixed(2));
      s.start = Number(t.toFixed(2));
      s.duration = Number(dur.toFixed(2));
      s.textTreatment = best.tr.kind as TextTreatment;
      if (best.tr.kind === "unchecked") s.issue = s.issue ?? "원본 글자를 검사하지 못해 아래 자막 띠만 가렸습니다 (확대 또는 블러 · AI 이미지 읽기 연결 필요).";
      t += dur;

      picks.push({ k, s, src, best, dur });
    }
    const total = t;

    // 4) 컷마다 한 번에 인코딩 (v0.9.67): 원본 구간 + 블러 + 상단 제목 + 자막(1줄 조각) + 주목 효과 + 화살표 + 엔딩
    //    → 마지막에 영상을 다시 인코딩하지 않고 이어 붙이기만 (가장 오래 걸리던 단계를 없앴다). 2컷씩 동시에
    await hooks.stage("rendering", 40);
    const fontWarn = new Set<string>();
    const note = (ok: boolean, key: string) => {
      if (!ok && !fontWarn.has(key)) {
        fontWarn.add(key);
        issues.push(`글꼴(${key}) 파일이 없어 기본 글꼴로 만들었습니다 — assets/video/fonts 에 넣어 주세요.`);
      }
    };
    const titlePng = path.join(dir, "title.png");
    const ts = cleanTitleStyle(job.plan.titleStyle);
    note(await renderTitleBar(titlePng, job.plan.topLine1, job.plan.topLine2, ts), ts.font);
    const cs = cleanCaptionStyle(job.plan.captionStyle);
    const memes = videoAssets.meme();
    const arrow = videoAssets.arrow();
    const endingGif = videoAssets.ending();
    if (!arrow && scenes.some((x) => x.arrow)) issues.push("화살표 GIF 가 없어 넣지 못했습니다 (assets/video/arrow).");
    const endPng = path.join(dir, "ending.png");
    if (job.plan.ending) note(await renderEnding(endPng), ENDING_TEMPLATE.font);
    let attnTurn = 0;
    const sceneFiles: string[] = new Array(picks.length);
    const sceneAudio: string[] = new Array(picks.length);
    let done = 0;
    const encode = async ({ k, s, src, best, dur }: (typeof picks)[number]) => {
      const isLast = k === scenes.length - 1;
      const out = path.join(dir, `v${k}.mp4`);
      const size = await videoSize(src.file);
      const vf: string[] = [];
      if (best.tr.crop && size.width) {
        const c = best.tr.crop;
        vf.push(`crop=${Math.round(size.width * c.w)}:${Math.round(size.height * c.h)}:${Math.round(size.width * c.x)}:${Math.round(size.height * c.y)}`);
      }
      vf.push(`scale=${W}:${H}:force_original_aspect_ratio=increase`, `crop=${W}:${H}`, `fps=${C.fps}`, "setsar=1");
      // 원본이 컷보다 짧으면(AI 컷 5초 등) 반복해서 채운다
      const loop = src.duration < best.start + dur + 0.05 ? ["-stream_loop", "-1"] : [];
      const inputs: string[] = [...loop, "-ss", String(best.start), "-t", dur.toFixed(3), "-i", src.file];
      let idx = 1;
      let filter = `[0:v]${vf.join(",")}[base]`;
      let cur = "base";
      const blurBoxes = best.tr.blurs ?? (best.tr.blur ? [best.tr.blur] : []);
      if (blurBoxes.length && size.width) {
        // 블러 상자를 출력 좌표로 (원본 → 꽉 채우기 비율). 상자마다 따로 (v0.9.66)
        const scale = Math.max(W / size.width, H / size.height);
        const ox = (size.width * scale - W) / 2;
        const oy = (size.height * scale - H) / 2;
        for (const [n, b] of blurBoxes.entries()) {
          const bx = Math.max(0, Math.round(b.x * size.width * scale - ox));
          const by = Math.max(0, Math.round(b.y * size.height * scale - oy));
          const bw = Math.min(W - bx, Math.round(b.w * size.width * scale));
          const bh = Math.min(H - by, Math.round(b.h * size.height * scale));
          if (bw <= 8 || bh <= 8) continue;
          filter += `;[${cur}]split[p${n}][q${n}];[q${n}]crop=${bw}:${bh}:${bx}:${by},boxblur=36:4[bl${n}];[p${n}][bl${n}]overlay=${bx}:${by}[m${n}]`;
          cur = `m${n}`;
        }
      }
      const add = (args: string[], f: (i: number, from: string) => string, label: string) => {
        inputs.push(...args);
        filter += `;${f(idx, cur)}`;
        cur = label;
        idx++;
      };
      // 상단 제목
      add(["-loop", "1", "-i", titlePng], (i, from) => `[${from}][${i}:v]overlay=0:0:shortest=1[t${k}]`, `t${k}`);
      // 자막 (엔딩 컷은 '최저가 구매링크'가 자리를 쓴다). 1줄 조각을 음성 길이에 맞춰 차례로 (컷 안 시간)
      if (job.plan.captions !== false && !(job.plan.ending && isLast)) {
        const chunks = captionChunks(s.narration, CAPTION_TEMPLATE.maxCharsPerLine);
        const speech = Math.min(dur, Math.max(0.3, audio[k]?.dur ?? dur));
        const totalChars = chunks.reduce((n, c) => n + c.replace(/\s/g, "").length, 0) || 1;
        let at = 0;
        for (const [j, text] of chunks.entries()) {
          const png = path.join(dir, `cap${k}_${j}.png`);
          note(await renderCaption(png, text, cs), cs.font);
          const end = j === chunks.length - 1 ? dur : at + (speech * text.replace(/\s/g, "").length) / totalChars;
          const a0 = at;
          add(["-loop", "1", "-i", png], (i, from) => `[${from}][${i}:v]overlay=0:${captionY(cs)}:shortest=1:enable='between(t,${a0.toFixed(3)},${(end - 0.001).toFixed(3)})'[c${k}_${j}]`, `c${k}_${j}`);
          at = end;
        }
      }
      // 주목 효과: 컷 앞 1.4초, 통통 튀게 (meme GIF → 없으면 스티커)
      if (s.attention && !isLast) {
        const a = ATTENTION_CONFIG;
        const t1 = Math.min(a.showSec, dur);
        const bounce = `${a.y}-18*abs(sin(9*t))`;
        const n = attnTurn++;
        if (memes.length) {
          add(["-ignore_loop", "0", "-i", memes[n % memes.length]], (i, from) => `[${i}:v]format=rgba,scale=${a.width}:-1[mm${k}];[${from}][mm${k}]overlay=${a.x}:'${bounce}':shortest=0:eof_action=pass:enable='between(t,0,${t1.toFixed(3)})'[at${k}]`, `at${k}`);
        } else {
          const png = path.join(dir, `st${k}.png`);
          await renderSticker(png, a.words[(s.index + n) % a.words.length], n % 2 ? 7 : -8);
          add(["-loop", "1", "-i", png], (i, from) => `[${from}][${i}:v]overlay=${a.x}:'${bounce}':shortest=1:enable='between(t,0,${t1.toFixed(3)})'[at${k}]`, `at${k}`);
        }
      }
      // 화살표 (제품 버튼 쪽으로 돌림)
      if (arrow && s.arrow) {
        const pl = ARROW_PLACEMENT[job.plan.channelId];
        const rad = (pl.angle * Math.PI) / 180;
        add(["-ignore_loop", "0", "-i", arrow], (i, from) => `[${i}:v]format=rgba,scale=${pl.size}:-1,rotate=${rad.toFixed(4)}:c=none:ow=rotw(${rad.toFixed(4)}):oh=roth(${rad.toFixed(4)})[ar${k}];[${from}][ar${k}]overlay=${pl.x}:${pl.y}:shortest=0:eof_action=pass[aw${k}]`, `aw${k}`);
      }
      // 엔딩 '최저가 구매링크' + 화살표 (마지막 컷 전체)
      if (job.plan.ending && isLast) {
        if (endingGif) {
          const pl = ENDING_ARROW_PLACEMENT[job.plan.channelId];
          const rad = (pl.angle * Math.PI) / 180;
          add(["-ignore_loop", "0", "-i", endingGif], (i, from) => `[${i}:v]format=rgba,scale=-1:${pl.height},rotate=${rad.toFixed(4)}:c=none:ow=rotw(${rad.toFixed(4)}):oh=roth(${rad.toFixed(4)})[eg];[${from}][eg]overlay=${pl.x}:${pl.y}:shortest=0:eof_action=pass[ea]`, "ea");
        }
        add(["-loop", "1", "-i", endPng], (i, from) => `[${from}][${i}:v]overlay=0:${endingY()}:shortest=1[eb]`, "eb");
      }
      filter += `;[${cur}]format=yuv420p[out]`;
      await runFfmpeg(
        [...inputs, "-filter_complex", filter, "-map", "[out]", "-an", "-t", dur.toFixed(3), "-c:v", "libx264", "-preset", C.preset, "-crf", String(C.crf), "-r", String(C.fps), "-pix_fmt", "yuv420p", out],
        150_000,
        dir,
      );
      sceneFiles[k] = out;
      // 이 컷의 음성을 컷 길이에 정확히 맞춘다 (뒤를 무음으로 채움)
      const aout = path.join(dir, `n${k}.wav`);
      await runFfmpeg(["-i", audio[k].file, "-af", `apad,atrim=0:${dur.toFixed(3)}`, "-ar", "44100", "-ac", "1", aout]);
      sceneAudio[k] = aout;
      done++;
      await hooks.stage("rendering", 40 + Math.round((done / picks.length) * 45));
    };
    for (let i = 0; i < picks.length; i += 2) await Promise.all(picks.slice(i, i + 2).map(encode));

    // 5) 이어 붙이기 (다시 인코딩하지 않음) + 소리 섞기: 내레이션 + 배경음악(반복, 작게) + 효과음(컷 시작에)
    const vlist = path.join(dir, "v.txt");
    const alist = path.join(dir, "a.txt");
    await writeFile(vlist, sceneFiles.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n"));
    await writeFile(alist, sceneAudio.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n"));
    const base = path.join(dir, "base.mp4");
    const narration = path.join(dir, "narration.wav");
    await runFfmpeg(["-f", "concat", "-safe", "0", "-i", vlist, "-c", "copy", base]);
    await runFfmpeg(["-f", "concat", "-safe", "0", "-i", alist, "-c", "copy", narration]);
    const inputs: string[] = ["-i", base, "-i", narration];
    let idx = 2;
    const amix: string[] = ["[1:a]volume=" + C.volumes.narration + "[na]"];
    const mixIns = ["[na]"];
    const bgms = videoAssets.bgm();
    const bgm = bgms.find((f) => path.basename(f).replace(/\.[^.]+$/, "") === job.plan.bgm) ?? bgms[0];
    if (bgm) {
      inputs.push("-stream_loop", "-1", "-i", bgm);
      amix.push(`[${idx}:a]volume=${C.volumes.bgm},atrim=0:${total.toFixed(3)}[bg]`);
      mixIns.push("[bg]");
      idx++;
    } else issues.push("배경음악 파일이 없어 넣지 못했습니다 (assets/video/bgm).");
    const sfxFiles = videoAssets.sfx();
    let sfxCount = 0;
    for (const sc of scenes) {
      if (!sc.sfx) continue;
      const f = sfxFiles.find((x) => path.basename(x).replace(/\.[^.]+$/, "") === sc.sfx);
      if (!f) continue;
      inputs.push("-i", f);
      const ms = Math.round(sc.start! * 1000);
      amix.push(`[${idx}:a]volume=${C.volumes.sfx},adelay=${ms}|${ms}[s${idx}]`);
      mixIns.push(`[s${idx}]`);
      idx++;
      sfxCount++;
    }
    if (!sfxFiles.length) issues.push("효과음 파일이 없어 넣지 못했습니다 (assets/video/sfx).");
    amix.push(`${mixIns.join("")}amix=inputs=${mixIns.length}:normalize=0:duration=first,alimiter=limit=0.95[aout]`);
    const final = path.join(dir, "final.mp4");
    await hooks.stage("rendering", 88);
    await runFfmpeg(
      [...inputs, "-filter_complex", amix.join(";"), "-map", "0:v", "-map", "[aout]", "-t", total.toFixed(3), "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", final],
      120_000,
      dir,
    );

    // 6) 자동 검사
    await hooks.stage("quality_check", 92);
    const { stderr } = await runFfmpeg(["-i", final, "-vf", "blackdetect=d=0.3:pix_th=0.08", "-af", "silencedetect=n=-45dB:d=0.8", "-f", "null", "-"], 120_000);
    const blackFrames = (stderr.match(/black_start/g) ?? []).length;
    const longSilences = (stderr.match(/silence_start/g) ?? []).length;
    const durationSec = await mediaDuration(final);
    const textSummary: VideoQa["textSummary"] = {};
    for (const s of scenes) textSummary[s.textTreatment ?? "unchecked"] = (textSummary[s.textTreatment ?? "unchecked"] ?? 0) + 1;
    if (blackFrames) issues.push(`검은 화면이 ${blackFrames}번 있습니다.`);
    if (longSilences && tts && job.plan.captions !== false) issues.push(`0.8초 넘는 무음이 ${longSilences}번 있습니다.`);
    if (Math.abs(durationSec - total) > 0.5) issues.push("영상과 음성 길이가 맞지 않을 수 있습니다.");
    const qa: VideoQa = {
      checkedAt: new Date().toISOString(),
      durationSec: Number(durationSec.toFixed(2)),
      expectedDurationSec: Number(total.toFixed(2)),
      blackFrames,
      longSilences,
      sfxCount,
      titleApplied: true,
      captionsApplied: true,
      textSummary,
      voice: tts ? "tts" : wantVoice ? "none" : "off",
      voiceTempo: Number(voiceTempo.toFixed(2)),
      targetSec: cleanTarget(plan.targetSec) || undefined,
      issues,
    };
    return { file: await readFile(final), scenes, qa, aiCalls };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
