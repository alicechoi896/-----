import "server-only";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { keepSegments, parseSilences } from "@/lib/silence-cut";
import { runFfmpeg } from "./ffmpeg";

/**
 * 음성의 무음 없애기 (v0.9.72) — 무음 구간 자르기와 같은 방식.
 * 1) 앞뒤 무음은 길이와 상관없이 모두 자른다
 * 2) 중간의 쉼이 maxPause 초 이상이면 말 앞뒤 0.03초만 남기고 잘라 낸다 (silencedetect → aselect)
 * silenceremove 의 stop_periods 는 쉼을 stop_duration 만큼 남겨서 쓰지 않는다.
 */
export async function removePauses(input: string, out: string, opts: { thresholdDb: number; maxPause: number; dir: string; key: string }): Promise<void> {
  const thr = `${opts.thresholdDb}dB`;
  const edged = path.join(opts.dir, `${opts.key}_edge.wav`);
  await runFfmpeg([
    "-i", input,
    "-af", `silenceremove=start_periods=1:start_threshold=${thr}:start_silence=0.02,areverse,silenceremove=start_periods=1:start_threshold=${thr}:start_silence=0.02,areverse`,
    "-ar", "44100", "-ac", "1", edged,
  ]);
  const probe = await runFfmpeg(["-i", edged, "-af", `silencedetect=noise=${thr}:d=${opts.maxPause}`, "-f", "null", "-"], 60_000);
  const m = [...probe.stderr.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)].at(-1);
  const duration = m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
  const silences = parseSilences(probe.stderr, duration);
  if (!silences.length || !duration) {
    await runFfmpeg(["-i", edged, "-c", "copy", out]);
    return;
  }
  const keeps = keepSegments(silences, duration, 0.03, 0.04);
  const filterFile = path.join(opts.dir, `${opts.key}_pause.txt`);
  await writeFile(filterFile, `aselect='${keeps.map(([a, b]) => `between(t,${a},${b})`).join("+")}',asetpts=N/SR/TB`);
  await runFfmpeg(["-i", edged, "-filter_script:a", filterFile, "-ar", "44100", "-ac", "1", out]);
}
