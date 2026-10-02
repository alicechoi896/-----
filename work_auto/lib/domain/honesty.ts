/**
 * 정직성 가드레일 — 경험하지 않은 제품을 "직접 사용했다"고 쓰지 않게 한다.
 * 프롬프트(서버)와 Mock 출력, 생성 후 검사에서 같은 목록을 쓴다.
 */

/** 실제 경험 입력이 없을 때 금지하는 1인칭 사용 후기 표현 */
export const FIRST_PERSON_EXPERIENCE_PHRASES = [
  "직접 사용해",
  "직접 써",
  "써보니",
  "사용해보니",
  "사용해 보니",
  "제가 써본",
  "내돈내산",
  "한 달 써본",
  "실사용 후기",
];

export const HONESTY_RULE_TEXT =
  "사용자가 실제 경험을 입력하지 않았다. 직접 사용했다는 1인칭 표현(예: '써보니', '직접 사용해보니', '내돈내산')을 절대 쓰지 말고, 제품 정보와 공개된 스펙을 근거로 한 소개·정리 형식으로만 작성한다.";

/** 생성 결과에 금지 표현이 있는지 검사한다 (생성 후 검증) */
export function findHonestyViolations(text: string): string[] {
  return FIRST_PERSON_EXPERIENCE_PHRASES.filter((p) => text.includes(p));
}
