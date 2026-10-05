/**
 * 영상 검색 결과 제목 번역 규칙 (화면·서버 공용). docs/SOCIAL_VIDEO_SOURCING.md 「제목 한국어 번역」
 * - 중국어 비중이 충분한 제목만 번역한다 (한국어가 섞이면 하지 않음, 영어는 원문 그대로)
 * - 한 페이지 제목을 모아 AI 1회. 제목만 보낸다 (본문·작성자·해시태그 제외)
 */
export const TITLE_TRANSLATE_LIMITS = {
  /** 한 번에 보내는 제목 수 (업체 한 페이지보다 넉넉하게) */
  batch: 50,
  titleChars: 100,
} as const;

const HAN = /[㐀-鿿豈-﫿]/g;
const HANGUL = /[가-힣ㄱ-ㆎ]/;
const LATIN = /[A-Za-z]/g;

/** 중국어 제목인가: 한자 2자 이상이고 (한자 + 영문자) 중 한자가 40% 이상, 한글은 없음 */
export function isChineseTitle(title: string): boolean {
  if (!title || HANGUL.test(title)) return false;
  const han = title.match(HAN)?.length ?? 0;
  const latin = title.match(LATIN)?.length ?? 0;
  return han >= 2 && han / (han + latin) >= 0.4;
}

/** 번역에 보낼 제목 정리 (해시태그 덩어리·줄바꿈 제거, 길이 제한) */
export function titleForTranslation(title: string): string {
  return title
    .replace(/#[^\s#]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TITLE_TRANSLATE_LIMITS.titleChars);
}
