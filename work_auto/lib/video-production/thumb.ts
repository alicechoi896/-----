/** v0.9.138 섬네일 제목 (영상 상단 제목 2번째 줄에도 씀): 공백 빼고 10자 이내 */
export const THUMB_MAX = 10;
export const thumbLen = (t: string) => t.replace(/\s+/g, "").length;
/** 후보 중 10자 이내만 (없으면 앞에서 자른 것) */
export function fitThumbs(list: string[]): string[] {
  const ok = list.map((x) => x.trim()).filter((x) => x && thumbLen(x) <= THUMB_MAX);
  return ok.length ? ok : list.map((x) => cutThumb(x)).filter(Boolean);
}
/** 공백 빼고 10자에서 자른다 (공백은 살림) */
export function cutThumb(t: string): string {
  let n = 0;
  let out = "";
  for (const ch of t.trim()) {
    if (!/\s/.test(ch)) n++;
    if (n > THUMB_MAX) break;
    out += ch;
  }
  return out.trim();
}
