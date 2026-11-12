/**
 * 릴스 Hook 공식·점수 (v0.9.196) — instagram-agent-skill 의 ig-reel(hooks.json·hookscore.py, MIT © 2026 Jake Schincariol,
 * https://github.com/Jakeschincariol/instagram-agent-skill)을 한국어 쇼츠에 맞게 옮긴 것. 외부 의존 없음 (화면·서버 공용).
 *
 * 점수는 '조회수 예측'이 아니다: 첫 문장을 3초 안에 말할 수 있는지 · 구체적인 숫자·이름이 있는지 · 걸린 것(손해·후회·금지)이 있는지 ·
 * 핵심이 앞에 있는지 · 보는 사람을 부르는지 다섯 가지를 글만 보고 잰다. 인사·예고 같은 '빈 시작'을 걸러 내는 데 쓴다.
 */
export interface HookFormula {
  id: number;
  name: string;
  template: string;
  example: string;
}

/** 26가지 Hook 공식 (한국어 예시로) */
export const HOOK_FORMULAS: HookFormula[] = [
  { id: 1, name: "손해 고백", template: "{구체 금액}이 {실수 하나} 때문에 날아갔어요", example: "이거 하나 몰라서 30만 원 날렸어요" },
  { id: 2, name: "금지 명령", template: "{흔한 행동} 하지 마세요. {대안} 하세요", example: "할인 기다리지 마세요, 지금이 제일 쌉니다" },
  { id: 3, name: "아무도 안 알려 줌", template: "아무도 {불편한 진실} 안 알려 줘요", example: "아무도 이 기능 끄라고 안 알려 줘요" },
  { id: 4, name: "대체", template: "{이것}이 {비싼 것}을 {가격}에 대신해요", example: "이 3만 원짜리가 50만 원 청소기를 대신해요" },
  { id: 5, name: "시간 단축", template: "{긴 시간} 걸리던 게 {짧은 시간}이면 끝나요", example: "1시간 걸리던 청소가 10분이면 끝나요" },
  { id: 6, name: "영수증", template: "{N일} 동안 {해 봤어요}. 진짜 숫자 보여 드릴게요", example: "30일 써 봤어요, 전기세 진짜 숫자 보여 드릴게요" },
  { id: 7, name: "잘못된 방법", template: "{이것} 잘못 쓰고 계세요, 여러분 탓 아니에요", example: "에어프라이어 잘못 쓰고 계세요, 설명서 탓이에요" },
  { id: 8, name: "내부자 폭로", template: "{N년} {업계}에 있었는데, 이건 절대 말 안 해요", example: "가전 매장 5년 일했는데 이건 절대 말 안 해요" },
  { id: 9, name: "가져가세요", template: "이 {것} 그대로 가져가세요. {시간} 걸려 찾았어요", example: "이 세팅 그대로 가져가세요, 2년 걸려 찾았어요" },
  { id: 10, name: "이런 분이면", template: "{상황}이시면 이 {짧은 시간}이 해결해 줘요", example: "원룸 사시면 이 영상 30초가 해결해 줘요" },
  { id: 11, name: "번호 + 하나만", template: "{N}가지 {결과}. {k}번은 아무도 안 써요", example: "필수 기능 3가지, 3번은 아무도 안 써요" },
  { id: 12, name: "반론 받기", template: "\"{흔한 반론}\" 그래도 되는 방법이 있어요", example: "\"비싸서 못 사요\" 그래도 되는 방법이 있어요" },
  { id: 13, name: "전후 비교", template: "{예전 모습}. {지금 모습}. {바꾼 것 하나}", example: "3월 거실, 지금 거실, 바꾼 건 이거 하나예요" },
  { id: 14, name: "콕 집어 부르기", template: "{특정 사람}, 이거 계속 미루고 계시죠", example: "자취 1년 차분들, 이거 계속 미루고 계시죠" },
  { id: 15, name: "실패 기록", template: "{N}번 실패했는데 {N+1}번째에 바뀐 하나", example: "청소기 세 번 바꿨는데 네 번째에 바뀐 하나" },
  { id: 16, name: "그대로 받은 질문", template: "\"{받은 질문 그대로}\" 매주 이 질문 받아요", example: "\"이거 진짜 소음 없어요?\" 매주 받는 질문이에요" },
  { id: 17, name: "1:1 비교", template: "{A} vs {B}, {기간} 써 봤는데 상대가 안 돼요", example: "갤럭시 vs 아이패드, 한 달 써 봤는데 상대가 안 돼요" },
  { id: 18, name: "바로 시연", template: "{이미 하는 중} 이거 보세요", example: "물 붓자마자 이거 보세요" },
  { id: 19, name: "마감", template: "{것}이 {날짜}에 바뀌어요. 그 전에 {행동}", example: "이 할인 일요일에 끝나요, 그 전에 확인하세요" },
  { id: 20, name: "괜찮아요", template: "{다들 필요하다는 것} 없어도 돼요", example: "비싼 프로 모델 없어도 돼요" },
  { id: 21, name: "중간부터", template: "…그리고 그때 {반전}", example: "…그리고 그때 화면이 꺼졌어요" },
  { id: 22, name: "뒤집기", template: "{유명한 말을 뒤집어서}", example: "싼 게 비지떡? 이건 아니에요" },
  { id: 23, name: "통계", template: "{N}%의 {사람}이 {놀라운 사실}", example: "구매자 70%가 이 설정을 안 켜요" },
  { id: 24, name: "공개", template: "이게 새 {것}이에요", example: "이게 새 갤럭시탭 S12 울트라예요" },
  { id: 25, name: "남의 결과", template: "{한 사람}이 {기간}에 {결과}", example: "한 자취생이 한 달 만에 전기세를 반으로 줄였어요" },
  { id: 26, name: "최상급", template: "가장 {빠른·싼·유일한} {것}은 {답}", example: "가장 싸게 사는 방법은 사전 예약이에요" },
];

const STAKES = ["후회", "손해", "절대", "하지 마", "사지 마", "실수", "망", "몰랐", "몰라", "비밀", "진짜", "이유", "대신", "말고", "무조건", "놓치", "안 사면", "속지", "함정", "끝나", "끝판", "역대", "처음", "유일", "반값", "공짜", "무료", "안 알려", "아무도", "그만", "버리", "날렸", "최악", "최고", "왜", "vs", "VS"];
const WEAK_OPENERS = ["안녕하세요", "여러분 안녕", "오늘은", "오늘 소개", "이번 영상", "제가 오늘", "자 ", "음 ", "어 ", "그래서", "일단", "먼저 ", "구독", "좋아요"];
const DEALBREAKERS: { re: RegExp; why: string }[] = [
  { re: /^(\s*)(안녕하세요|여러분 안녕)/, why: "인사로 시작 — 첫 2초를 인사에 씀" },
  { re: /(이번|오늘) 영상(에서는|은|에선)|소개해 ?드릴게요|알려 ?드릴게요/, why: "예고로 시작 — 바로 결론부터" },
  { re: /^\s*(스크롤|넘기지) ?(멈춰|마세요)/, why: "'넘기지 마세요'는 관심을 달라는 말일 뿐" },
];
const ADDRESS = /(분들|하는 분|하시는 분|이신 분|고민 중|여러분|당신|너희|님들|이런 분|사시는 분|쓰시는 분)/;
const NUMBER = /\d|[일이삼사오육칠팔구십백천만]+\s?(원|만원|%|배|시간|분|초|일|주|개월|년|kg|g|인치|가지|번)|(하나|둘|셋|세 가지|두 가지|반값|절반)/;
const PROPER = /[A-Za-z]{2,}|[A-Z]\d+|\d+[A-Za-z]+/;

export interface HookScore {
  total: number;
  checks: { length: number; concrete: number; stakes: number; front: number; address: number };
  warnings: string[];
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** 첫 문장 점수 (0~100) */
export function hookScore(raw: string): HookScore {
  const text = raw.replace(/\s+/g, " ").trim();
  const chars = text.replace(/\s/g, "").length;
  // 3초 안에 말하기: 한국어 1초에 약 6~7자 → 18자 안이면 만점, 40자면 0
  const length = clamp(chars <= 18 ? 100 : 100 - ((chars - 18) / 22) * 100);
  const concrete = clamp((NUMBER.test(text) ? 70 : 0) + (PROPER.test(text) ? 30 : 0));
  const stakeHits = STAKES.filter((w) => text.includes(w)).length;
  const stakes = clamp(stakeHits ? 70 + Math.min(30, (stakeHits - 1) * 15) : 0);
  // 핵심이 앞에: 약한 시작이 없고, 숫자·걸린 말이 앞쪽 60% 안에 있음
  const weak = WEAK_OPENERS.some((w) => text.startsWith(w));
  const firstKey = Math.min(...[...STAKES.map((w) => text.indexOf(w)), text.search(NUMBER)].filter((i) => i >= 0), Infinity);
  const front = clamp(weak ? 10 : firstKey === Infinity ? 40 : firstKey <= text.length * 0.6 ? 100 : 60);
  const address = ADDRESS.test(text) ? 100 : /(요|죠|세요)\??$/.test(text) ? 50 : 30;
  const warnings = DEALBREAKERS.filter((d) => d.re.test(text)).map((d) => d.why);
  if (chars > 30) warnings.push(`길어요 (${chars}자) — 3초 안에 말하기 어려움`);
  if (!concrete) warnings.push("구체적인 숫자·이름이 없음");
  let total = Math.round(length * 0.2 + concrete * 0.25 + stakes * 0.25 + front * 0.2 + address * 0.1);
  if (warnings.some((w) => DEALBREAKERS.some((d) => d.why === w))) total = Math.min(total, 30);
  return { total, checks: { length, concrete, stakes, front, address }, warnings };
}

/** 인스타그램 트렌드: 팔로워 대비 조회수 (평소보다 얼마나 터졌나의 대신값). 숫자가 없으면 null */
export function outlierOf(r: { plays: number | null; likes: number | null; comments: number | null; followers: number | null }): { ratio: number; basis: "plays" | "engagement"; tier: "hot" | "good" | "normal" } | null {
  if (!r.followers || r.followers < 100) return null;
  if (r.plays != null) {
    const ratio = r.plays / r.followers;
    return { ratio, basis: "plays", tier: ratio >= 3 ? "hot" : ratio >= 1 ? "good" : "normal" };
  }
  if (r.likes == null && r.comments == null) return null;
  // 조회수가 없는 공식 API: (좋아요 + 댓글×3) / 팔로워 — 참여율. 5% 넘으면 잘 된 편
  const ratio = ((r.likes ?? 0) + (r.comments ?? 0) * 3) / r.followers;
  return { ratio, basis: "engagement", tier: ratio >= 0.1 ? "hot" : ratio >= 0.05 ? "good" : "normal" };
}
