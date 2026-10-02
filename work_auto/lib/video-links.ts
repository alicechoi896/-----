/**
 * 영상 링크 해석 (클라이언트·서버 공용, 순수 함수).
 * 샤오홍슈 앱의 "공유 → 링크 복사" 문구처럼 설명과 링크가 섞인 텍스트에서도 링크와 제목을 뽑는다.
 *  예: "64 【자취방 수납 꿀팁】 ... http://xhslink.com/a/AbCd123 复制本条信息，打开【小红书】App查看精彩内容！"
 */

export type VideoPlatform = "youtube" | "naver" | "xiaohongshu" | "other";

export const PLATFORM_LABEL: Record<VideoPlatform, string> = {
  youtube: "YouTube",
  naver: "NAVER",
  xiaohongshu: "샤오홍슈",
  other: "기타",
};

export function detectPlatform(url: string): VideoPlatform {
  if (/youtube\.com|youtu\.be/i.test(url)) return "youtube";
  if (/xiaohongshu\.com|xhslink\.com|xhscdn\.com/i.test(url)) return "xiaohongshu";
  if (/naver\.com|naver\.me/i.test(url)) return "naver";
  return "other";
}

/** 링크 끝에 붙은 중국어·한국어 문장부호를 떼어 낸다 */
const URL_RE = /https?:\/\/[^\s，。！？、；：“”‘’"'<>（）()【】]+/gi;

/** 샤오홍슈 공유 문구에 붙는 안내 문장 */
const XHS_NOISE = [/复制本条信息[^\n]*/g, /打开【?小红书】?App查看精彩内容[！!]?/g, /[，,]?\s*复制[^\n]*小红书[^\n]*/g];

export interface ParsedLink {
  url: string;
  /** 같은 줄의 설명 (공유 문구의 제목). 영상 정보를 가져올 수 없는 사이트의 제목으로 쓴다 */
  titleHint?: string;
}

/** 여러 줄 입력 → 링크 목록 (중복 제거, 줄마다 제목 힌트) */
export function parseVideoLinks(text: string): ParsedLink[] {
  const out = new Map<string, ParsedLink>();
  for (const line of text.split(/\n+/)) {
    const urls = line.match(URL_RE) ?? [];
    if (!urls.length) continue;
    let rest = line;
    for (const u of urls) rest = rest.split(u).join(" ");
    for (const re of XHS_NOISE) rest = rest.replace(re, " ");
    const title = rest
      .replace(/^\s*\d+\s*/, "") // 공유 문구 앞의 숫자
      .replace(/[【】]/g, " ")
      .replace(/\s+/g, " ")
      .replace(/[\s，,。.！!、]+$/, "")
      .trim()
      .slice(0, 80);
    for (const url of urls) if (!out.has(url)) out.set(url, { url, titleHint: urls.length === 1 && title.length >= 2 ? title : undefined });
  }
  return [...out.values()];
}

/** 샤오홍슈 노트 ID (24자리 16진수) */
export function xiaohongshuId(url: string): string | null {
  return url.match(/xiaohongshu\.com\/(?:explore|discovery\/item)\/([0-9a-f]{24})/i)?.[1] ?? null;
}
