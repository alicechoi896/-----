/**
 * 결과 항목 [추가 만들기] — 후보 목록(제목·Hook·CTA·키워드·태그·해시태그)은 다시 만들지 않고
 * 새 후보를 지금 목록 위에 더한다. 대본·설명글·본문 같은 글은 [다시 만들기] 그대로.
 * 서버(content-generation)와 화면(ResultPanel)이 같이 쓴다.
 */
export const APPENDABLE_KEYS = new Set(["titles", "hooks", "ctas", "keywords", "tags", "hashtags"]);

/** 한 목록에 쌓을 수 있는 최대 개수 (너무 길어지면 프롬프트·화면이 무거워진다) */
export const APPEND_MAX_ITEMS = 200;

/** 같은 후보 비교용: 공백·# ·대소문자 무시 */
export const candidateKey = (s: string) => s.replace(/^#+/, "").replace(/\s+/g, "").toLowerCase();

/** 새 후보 중 지금 목록·서로와 겹치지 않는 것만 위에 붙인다 */
export function mergeAppend(current: string[], fresh: string[]): { list: string[]; added: string[] } {
  const seen = new Set(current.map(candidateKey));
  const added: string[] = [];
  for (const raw of fresh) {
    const item = raw.trim();
    const k = candidateKey(item);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    added.push(item);
  }
  const room = Math.max(0, APPEND_MAX_ITEMS - current.length);
  const kept = added.slice(0, room);
  return { list: [...kept, ...current], added: kept };
}
