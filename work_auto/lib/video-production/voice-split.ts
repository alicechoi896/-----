/**
 * 대본 전체 음성 한 번 → 줄마다 자르기 (v0.9.77). 타입캐스트 '시간표 있는 음성'의 글자별 시각으로 줄 경계를 찾는다.
 * 공백·줄바꿈을 빼고 글자를 차례로 맞춘다 (시간표 글자가 대본과 다르게 나오면 null → 줄마다 따로 만들기로).
 */
export interface TimedChar {
  text: string;
  start: number;
  end: number;
}

const strip = (s: string) => s.replace(/\s+/g, "");

/** 줄마다 [시작, 끝] 초. 경계는 앞 줄 마지막 글자 끝과 다음 줄 첫 글자 시작의 가운데 */
export function splitByChars(lines: string[], chars: TimedChar[], duration: number): [number, number][] | null {
  const timed = chars.filter((c) => strip(c.text)).map((c) => ({ text: strip(c.text), start: Number(c.start), end: Number(c.end) }));
  if (!timed.length || timed.some((c) => !Number.isFinite(c.start) || !Number.isFinite(c.end))) return null;
  const spans: { first: number; last: number }[] = [];
  let i = 0;
  for (const line of lines) {
    const want = strip(line);
    if (!want) return null;
    let got = "";
    const first = i;
    while (i < timed.length && got.length < want.length) got += timed[i++].text;
    if (got !== want) return null;
    spans.push({ first, last: i - 1 });
  }
  if (i !== timed.length) return null;
  const cuts = spans.slice(0, -1).map((s, k) => (timed[s.last].end + timed[spans[k + 1].first].start) / 2);
  const bounds = [0, ...cuts, Math.max(duration, timed[timed.length - 1].end)];
  const out: [number, number][] = [];
  for (let k = 0; k < lines.length; k++) {
    const a = Number(bounds[k].toFixed(3));
    const b = Number(bounds[k + 1].toFixed(3));
    if (b - a < 0.05) return null;
    out.push([a, b]);
  }
  return out;
}

/** 시간표 API 한 번에 넣을 수 있는 글자 수 (타입캐스트 2000자) 안에서 줄을 묶는다 */
export function groupLines(lines: string[], max = 1900): number[][] {
  const groups: number[][] = [];
  let cur: number[] = [];
  let len = 0;
  for (const [k, l] of lines.entries()) {
    if (cur.length && len + l.length + 1 > max) {
      groups.push(cur);
      cur = [];
      len = 0;
    }
    cur.push(k);
    len += l.length + 1;
  }
  if (cur.length) groups.push(cur);
  return groups;
}

/**
 * 예비: 시간표가 대본과 맞지 않으면 쉼(무음)에서 자른다. 글자 수 비율로 잡은 위치에 가장 가까운 쉼의 가운데.
 * silences = [시작, 끝] 초 (silencedetect)
 */
export function splitBySilence(lines: string[], silences: [number, number][], duration: number): [number, number][] {
  const lens = lines.map((l) => Math.max(1, strip(l).length));
  const total = lens.reduce((a, b) => a + b, 0);
  const mids = silences.map(([a, b]) => (a + b) / 2).filter((m) => m > 0.05 && m < duration - 0.05);
  const cuts: number[] = [];
  let acc = 0;
  for (let k = 0; k < lines.length - 1; k++) {
    acc += lens[k];
    const ideal = (duration * acc) / total;
    const prev = cuts.at(-1) ?? 0;
    const near = mids.filter((m) => m > prev + 0.1).sort((x, y) => Math.abs(x - ideal) - Math.abs(y - ideal))[0];
    cuts.push(near !== undefined && Math.abs(near - ideal) < duration / lines.length ? near : Math.max(prev + 0.1, ideal));
  }
  const bounds = [0, ...cuts, duration];
  return lines.map((_, k) => [Number(bounds[k].toFixed(3)), Number(Math.max(bounds[k] + 0.05, bounds[k + 1]).toFixed(3))] as [number, number]);
}
