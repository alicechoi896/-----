/** 해시태그로 쓸 수 있는 모양 (화면·서버 공용, v0.9.57): # 과 띄어쓰기·기호를 뺀다 (예: "무선 청소기" → "무선청소기") */
export function toHashtag(keyword: string): string {
  return keyword
    .replace(/[#\s]+/g, "")
    .replace(/[^\p{L}\p{N}_]/gu, "")
    .slice(0, 50);
}
