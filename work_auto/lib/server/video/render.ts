import "server-only";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ReferenceVideo } from "@/lib/types";
import type { TextTreatment, VideoJob, VideoQa, VideoScene } from "@/lib/types/video-production";
import {
  ARROW_PLACEMENT,
  CAPTION_TEMPLATE,
  ENDING_ARROW_PLACEMENT,
  ENDING_TEMPLATE,
  TOP_TITLE_TEMPLATE,
  VIDEO_RENDER_CONFIG as C,
} from "@/lib/video-production/config";
import { getTTSProvider } from "../providers/registry";
import { videoAssets } from "./assets";
import { mediaDuration, runFfmpeg, videoSize } from "./ffmpeg";
import { fetchSource, type LocalSource } from "./source";
import { TREATMENT_RANK, boxesIn, decideTreatment, scanText, type Treatment, type TextScan } from "./text-scan";

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

/**
 * 글자 크기 맞추기: 템플릿 크기를 넘지 않고, 화면 너비(여백 제외)에 들어가게 줄인다 (디자인은 그대로, 크기만).
 * 한글·전각 1칸, 영문·숫자·기호 0.6칸으로 어림한다.
 */
function fitSize(text: string, maxSize: number, maxWidth = W * 0.92): number {
  const wide = /[ᄀ-ᇿ㄰-㆏가-힯　-鿿＀-￯]/;
  const longest = text.split("\n").reduce((m, line) => Math.max(m, [...line].reduce((n, ch) => n + (wide.test(ch) ? 1 : 0.6), 0)), 0);
  return Math.max(Math.round(maxSize * 0.55), Math.min(maxSize, Math.floor(maxWidth / Math.max(1, longest))));
}

function wrap(text: string, max: number): string {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max && cur) {
      lines.push(cur.trim());
      cur = w;
    } else cur = `${cur} ${w}`;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines.slice(0, 2).join("\n");
}

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

    // 1) 원본 받기 + 글자 검사 (쓰는 원본만, 동시에 3개씩)
    await hooks.stage("analyzing", 5);
    const used = [...new Set(scenes.map((s) => s.sourceVideoId).filter((x): x is string => Boolean(x)))];
    const byId = new Map(videos.map((v) => [v.id, v]));
    const sources = new Map<string, LocalSource & { scan: TextScan }>();
    for (let i = 0; i < used.length; i += 3) {
      await Promise.all(
        used.slice(i, i + 3).map(async (id, j) => {
          const v = byId.get(id);
          if (!v) return;
          try {
            const src = await fetchSource(v, dir, i + j);
            const { scan, aiCalls: n } = await scanText(src.file, src.duration, dir, `s${i + j}`);
            aiCalls += n;
            sources.set(id, { ...src, scan });
          } catch (e) {
            issues.push(e instanceof Error ? e.message : String(e));
          }
        }),
      );
    }
    if (!sources.size) throw new Error("쓸 수 있는 원본 영상이 없습니다. 영상 소재를 골라 주세요.");

    // 2) AI 음성 (마디마다) → 앞뒤 무음 정리 → 길이
    await hooks.stage("editing", 25);
    const tts = await getTTSProvider();
    if (!tts) issues.push("AI 음성이 연결되지 않아(OpenAI) 음성 없이 자막 시간으로 만들었습니다.");
    const audio: { file: string; dur: number }[] = new Array(scenes.length);
    for (let i = 0; i < scenes.length; i += 4) {
      await Promise.all(
        scenes.slice(i, i + 4).map(async (s, j) => {
          const k = i + j;
          const out = path.join(dir, `a${k}.wav`);
          if (tts) {
            try {
              const mp3 = path.join(dir, `a${k}.mp3`);
              await writeFile(mp3, await tts.synthesize(s.narration, plan.voice));
              aiCalls++;
              const thr = `${C.silenceThresholdDb}dB`;
              await runFfmpeg([
                "-i", mp3,
                "-af", `silenceremove=start_periods=1:start_threshold=${thr}:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=${thr}:start_silence=0.02,areverse`,
                "-ar", "44100", "-ac", "1", out,
              ]);
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

    // 3) 컷마다 원본 구간 고르기 (글자 없는 구간 우선, 같은 구간 반복 금지) → 컷 영상
    const usedRanges = new Map<string, [number, number][]>();
    let t = 0;
    const sceneFiles: string[] = [];
    const sceneAudio: string[] = [];
    for (const [k, s] of scenes.entries()) {
      const dur = audio[k].dur + C.minSpeechGapSec + (k === scenes.length - 1 ? C.tailSec : 0);
      // 이 컷의 원본: 정한 것 → 안 되면 다른 원본 중 가장 깨끗한 것
      const candidates = [s.sourceVideoId, ...[...sources.keys()].filter((id) => id !== s.sourceVideoId)].filter((x): x is string => Boolean(x && sources.has(x)));
      let best: { id: string; start: number; tr: Treatment } | null = null;
      for (const id of candidates) {
        const src = sources.get(id)!;
        const ranges = usedRanges.get(id) ?? [];
        const maxStart = Math.max(0, src.duration - dur - 0.1);
        const steps = Math.max(1, Math.floor(maxStart / 0.5));
        for (let n = 0; n <= steps; n++) {
          const start = (maxStart * n) / steps;
          if (ranges.some(([a, b]) => start < b && start + dur > a)) continue;
          const tr = decideTreatment(boxesIn(src.scan, start, dur), src.scan.checked);
          if (!best || TREATMENT_RANK[tr.kind] < TREATMENT_RANK[best.tr.kind]) best = { id, start, tr };
          if (tr.kind === "clean") break;
        }
        if (best?.tr.kind === "clean") break;
        if (best && id === s.sourceVideoId && TREATMENT_RANK[best.tr.kind] <= TREATMENT_RANK.blur) break;
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
      if (best.tr.kind === "unchecked") s.issue = s.issue ?? "원본 글자를 검사하지 못했습니다 (AI 이미지 읽기 필요).";
      t += dur;

      const out = path.join(dir, `v${k}.mp4`);
      const size = await videoSize(src.file);
      const vf: string[] = [];
      if (best.tr.crop && size.width) {
        const c = best.tr.crop;
        vf.push(`crop=${Math.round(size.width * c.w)}:${Math.round(size.height * c.h)}:${Math.round(size.width * c.x)}:${Math.round(size.height * c.y)}`);
      }
      vf.push(`scale=${W}:${H}:force_original_aspect_ratio=increase`, `crop=${W}:${H}`, `fps=${C.fps}`, "setsar=1");
      let filter = `[0:v]${vf.join(",")}[base]`;
      if (best.tr.blur && size.width) {
        // 블러 상자를 출력 좌표로 (원본 → 꽉 채우기 비율)
        const scale = Math.max(W / size.width, H / size.height);
        const ox = (size.width * scale - W) / 2;
        const oy = (size.height * scale - H) / 2;
        const b = best.tr.blur;
        const bx = Math.max(0, Math.round(b.x * size.width * scale - ox));
        const by = Math.max(0, Math.round(b.y * size.height * scale - oy));
        const bw = Math.min(W - bx, Math.round(b.w * size.width * scale));
        const bh = Math.min(H - by, Math.round(b.h * size.height * scale));
        if (bw > 8 && bh > 8) {
          filter += `;[base]split[b1][b2];[b2]crop=${bw}:${bh}:${bx}:${by},boxblur=28:3[bl];[b1][bl]overlay=${bx}:${by}[blurred]`;
          filter += `;[blurred]format=yuv420p[out]`;
        } else filter += `;[base]format=yuv420p[out]`;
      } else filter += `;[base]format=yuv420p[out]`;
      await runFfmpeg([
        "-ss", String(best.start), "-t", dur.toFixed(3), "-i", src.file,
        "-filter_complex", filter, "-map", "[out]", "-an",
        "-c:v", "libx264", "-preset", C.preset, "-crf", String(C.crf), "-r", String(C.fps), out,
      ], 90_000);
      sceneFiles.push(out);
      // 이 컷의 음성을 컷 길이에 정확히 맞춘다 (뒤를 무음으로 채움)
      const aout = path.join(dir, `n${k}.wav`);
      await runFfmpeg(["-i", audio[k].file, "-af", `apad,atrim=0:${dur.toFixed(3)}`, "-ar", "44100", "-ac", "1", aout]);
      sceneAudio.push(aout);
      await hooks.stage("editing", 30 + Math.round((k / scenes.length) * 35));
    }
    const total = t;

    // 4) 컷 잇기 (영상·음성 따로, 같은 형식이라 다시 인코딩하지 않음)
    await hooks.stage("rendering", 70);
    const vlist = path.join(dir, "v.txt");
    const alist = path.join(dir, "a.txt");
    await writeFile(vlist, sceneFiles.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n"));
    await writeFile(alist, sceneAudio.map((f) => `file '${f.replace(/\\/g, "/")}'`).join("\n"));
    const base = path.join(dir, "base.mp4");
    const narration = path.join(dir, "narration.wav");
    await runFfmpeg(["-f", "concat", "-safe", "0", "-i", vlist, "-c", "copy", base]);
    await runFfmpeg(["-f", "concat", "-safe", "0", "-i", alist, "-c", "copy", narration]);

    // 5) 상단 제목·자막·화살표·엔딩 + 배경음악·효과음
    const font = async (k: string) => {
      const f = videoAssets.font(k);
      if (f.fallback) issues.push(`글꼴(${k}) 파일이 없어 기본 글꼴로 만들었습니다 — assets/video/fonts 에 넣어 주세요.`);
      const name = `font_${k}${path.extname(f.file)}`;
      await copyFile(f.file, path.join(dir, name));
      return name;
    };
    const titleFont = await font(TOP_TITLE_TEMPLATE.font);
    const capFont = await font(CAPTION_TEMPLATE.font);
    const endFont = await font(ENDING_TEMPLATE.font);
    const txt = async (name: string, text: string) => {
      await writeFile(path.join(dir, `${name}.txt`), text, "utf8");
      return `${name}.txt`;
    };
    const inputs: string[] = ["-i", base, "-i", narration];
    let idx = 2;
    const vf: string[] = [];
    vf.push(`[0:v]drawbox=x=0:y=0:w=${W}:h=${TOP_TITLE_TEMPLATE.barHeight}:color=${TOP_TITLE_TEMPLATE.barColor}:t=fill`);
    const l1 = await txt("t1", job.plan.topLine1);
    const l2 = await txt("t2", job.plan.topLine2);
    vf.push(`drawtext=fontfile='${titleFont}':textfile='${l1}':fontsize=${fitSize(job.plan.topLine1, TOP_TITLE_TEMPLATE.line1.size)}:fontcolor=${TOP_TITLE_TEMPLATE.line1.color}:x=(w-text_w)/2:y=${TOP_TITLE_TEMPLATE.line1.y}`);
    vf.push(`drawtext=fontfile='${titleFont}':textfile='${l2}':fontsize=${fitSize(job.plan.topLine2, TOP_TITLE_TEMPLATE.line2.size)}:fontcolor=${TOP_TITLE_TEMPLATE.line2.color}:x=(w-text_w)/2:y=${TOP_TITLE_TEMPLATE.line2.y}`);
    for (const [k, s] of scenes.entries()) {
      // 마지막 컷은 '최저가 구매링크' 엔딩이 자막 자리를 쓴다 (음성은 그대로, 브루 편집과 같게)
      if (job.plan.ending && k === scenes.length - 1) continue;
      const capText = wrap(s.narration, CAPTION_TEMPLATE.maxCharsPerLine);
      const p = await txt(`c${k}`, capText);
      const a = s.start!;
      const b = a + s.duration!;
      vf.push(
        `drawtext=fontfile='${capFont}':textfile='${p}':fontsize=${fitSize(capText, CAPTION_TEMPLATE.size, W * 0.88)}:fontcolor=${CAPTION_TEMPLATE.color}:borderw=${CAPTION_TEMPLATE.borderW}:bordercolor=${CAPTION_TEMPLATE.borderColor}:line_spacing=12:text_align=center:x=(w-text_w)/2:y=${Math.round(H * CAPTION_TEMPLATE.centerY)}-text_h/2:enable='between(t,${a.toFixed(3)},${b.toFixed(3)})'`,
      );
    }
    let chain = vf.join(",") + "[v0]";
    let last = "v0";
    // 화살표 (제품 버튼 쪽으로 돌림)
    const arrow = videoAssets.arrow();
    const arrowScenes = scenes.filter((s) => s.arrow);
    if (arrow && arrowScenes.length) {
      inputs.push("-ignore_loop", "0", "-i", arrow);
      const pl = ARROW_PLACEMENT[job.plan.channelId];
      const rad = (pl.angle * Math.PI) / 180;
      const en = arrowScenes.map((s) => `between(t,${s.start!.toFixed(3)},${(s.start! + s.duration!).toFixed(3)})`).join("+");
      chain += `;[${idx}:v]format=rgba,scale=${pl.size}:-1,rotate=${rad.toFixed(4)}:c=none:ow=rotw(${rad.toFixed(4)}):oh=roth(${rad.toFixed(4)})[ar];[${last}][ar]overlay=${pl.x}:${pl.y}:shortest=0:eof_action=pass:enable='${en}'[v1]`;
      last = "v1";
      idx++;
    } else if (!arrow) issues.push("화살표 GIF 가 없어 넣지 못했습니다 (assets/video/arrow).");
    // 엔딩 '최저가 구매링크' + 화살표 (마지막 컷)
    const lastScene = scenes[scenes.length - 1];
    if (job.plan.ending) {
      const a = lastScene.start!;
      const en = `gte(t,${a.toFixed(3)})`;
      const ending = videoAssets.ending();
      if (ending) {
        inputs.push("-ignore_loop", "0", "-i", ending);
        const pl = ENDING_ARROW_PLACEMENT[job.plan.channelId];
        const rad = (pl.angle * Math.PI) / 180;
        chain += `;[${idx}:v]format=rgba,scale=-1:${pl.height},rotate=${rad.toFixed(4)}:c=none:ow=rotw(${rad.toFixed(4)}):oh=roth(${rad.toFixed(4)})[en];[${last}][en]overlay=${pl.x}:${pl.y}:shortest=0:eof_action=pass:enable='${en}'[v2]`;
        last = "v2";
        idx++;
      }
      let y = ENDING_TEMPLATE.y;
      const parts: string[] = [];
      for (const [i, line] of ENDING_TEMPLATE.lines.entries()) {
        const p = await txt(`e${i}`, line.text);
        parts.push(`drawtext=fontfile='${endFont}':textfile='${p}':fontsize=${line.size}:fontcolor=${line.color}:borderw=${ENDING_TEMPLATE.borderW}:bordercolor=${ENDING_TEMPLATE.borderColor}:x=${ENDING_TEMPLATE.x}-text_w/2:y=${y}:enable='${en}'`);
        y += line.size + 14;
      }
      chain += `;[${last}]${parts.join(",")}[v3]`;
      last = "v3";
    }
    chain += `;[${last}]format=yuv420p[vout]`;

    // 오디오: 내레이션 + 배경음악(반복, 작게) + 효과음(컷 시작에)
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
    for (const s of scenes) {
      if (!s.sfx) continue;
      const f = sfxFiles.find((x) => path.basename(x).replace(/\.[^.]+$/, "") === s.sfx);
      if (!f) continue;
      inputs.push("-i", f);
      const ms = Math.round(s.start! * 1000);
      amix.push(`[${idx}:a]volume=${C.volumes.sfx},adelay=${ms}|${ms}[s${idx}]`);
      mixIns.push(`[s${idx}]`);
      idx++;
      sfxCount++;
    }
    if (!sfxFiles.length) issues.push("효과음 파일이 없어 넣지 못했습니다 (assets/video/sfx).");
    amix.push(`${mixIns.join("")}amix=inputs=${mixIns.length}:normalize=0:duration=first,alimiter=limit=0.95[aout]`);
    const final = path.join(dir, "final.mp4");
    await hooks.stage("rendering", 80);
    await runFfmpeg(
      [
        ...inputs,
        "-filter_complex", `${chain};${amix.join(";")}`,
        "-map", "[vout]", "-map", "[aout]", "-t", total.toFixed(3),
        "-c:v", "libx264", "-preset", C.preset, "-crf", String(C.crf), "-r", String(C.fps),
        "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", final,
      ],
      200_000,
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
    if (longSilences && tts) issues.push(`0.8초 넘는 무음이 ${longSilences}번 있습니다.`);
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
      voice: tts ? "tts" : "none",
      issues,
    };
    return { file: await readFile(final), scenes, qa, aiCalls };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
