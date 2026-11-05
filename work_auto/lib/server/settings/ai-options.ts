import "server-only";
import { getCurrentUserId } from "../repositories";
import { videoStorage } from "../video/storage";

/**
 * AI 생성 공통 옵션 (v0.9.118) — AI 학습 관리 맨 위에서 켜고 끈다. 관리자 공용 데이터라 모든 관리자·새벽 자동 제작에 똑같이 적용.
 * DB 변경 없이 Storage {owner}/settings/ai-options__r{번호}.json (저장마다 새 이름 — CDN 캐시가 예전 값을 돌려주지 않게)
 */
export interface AiOptions {
  /** 마케팅 심리 원칙 적용 (원고 생성 프롬프트에 행동경제학·설득 원칙 지침) */
  psychology: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}
export const DEFAULT_AI_OPTIONS: AiOptions = { psychology: false, updatedAt: null, updatedBy: null };

const NAME = "ai-options";
const folder = (owner: string) => `${owner}/settings`;
const revOf = (key: string) => Number((key.split("/").pop() ?? "").match(/^ai-options__r(\d{9})_[a-z0-9]+\.json$/)?.[1] ?? -1);

async function revs(owner: string) {
  const rows = await videoStorage.list(folder(owner), { limit: 1000 }).catch(() => []);
  return rows.map((r) => ({ k: r.key, r: revOf(r.key) })).filter((x) => x.r >= 0).sort((a, b) => b.r - a.r);
}

export async function readAiOptions(owner?: string): Promise<AiOptions> {
  const o = owner ?? (await getCurrentUserId());
  for (const { k } of await revs(o)) {
    const buf = await videoStorage.download(k).catch(() => null);
    if (!buf) continue;
    try {
      return { ...DEFAULT_AI_OPTIONS, ...(JSON.parse(buf.toString("utf8")) as Partial<AiOptions>) };
    } catch {
      continue;
    }
  }
  return DEFAULT_AI_OPTIONS;
}

export async function saveAiOptions(patch: Partial<AiOptions>, by: string): Promise<AiOptions> {
  const owner = await getCurrentUserId();
  const cur = await readAiOptions(owner);
  const next: AiOptions = { psychology: typeof patch.psychology === "boolean" ? patch.psychology : cur.psychology, updatedAt: new Date().toISOString(), updatedBy: by.slice(0, 120) };
  const list = await revs(owner);
  const n = (list[0]?.r ?? 0) + 1;
  await videoStorage.put(`${folder(owner)}/${NAME}__r${String(n).padStart(9, "0")}_${Math.random().toString(36).slice(2, 8)}.json`, Buffer.from(JSON.stringify(next)), "application/json", "0");
  for (const old of list.slice(4)) await videoStorage.remove(old.k).catch(() => undefined);
  return next;
}

/**
 * 원고 프롬프트에 넣는 마케팅 심리 원칙 지침 (coreyhaines31/marketingskills 'marketing-psychology' 를 우리 쇼츠·블로그 원고용으로 요약).
 * 대본 포맷·말끝 규칙이 항상 우선, 사실 범위 안에서만.
 */
export const PSYCHOLOGY_GUIDE = [
  "이번 원고에 맞는 심리 원칙 2~3개를 골라 의도적으로 쓴다 (모두 다 쓰지 않는다). 우선순위: 대본 포맷·말끝 규칙 > 제품 사실 > 심리 원칙.",
  "Hook(첫 문장): 손실 회피('모르고 사면 손해'), 호기심 공백·자이가르닉('끝까지 보면 3번째가…'), 대비 효과(전/후) 중 하나.",
  "본문: 할 일(Jobs to be done) — 기능보다 '이걸로 해결되는 상황'을 먼저. 구체적 숫자(무게·시간·용량)로 쉽게 떠올리게(가용성). 작은 단점을 먼저 인정하면 신뢰가 오른다(실수 효과, 사실일 때만).",
  "가격·혜택: 앵커링(정가 → 할인가, 비싼 대안과 비교), 심적 회계('하루 ○○원'). 실제 정보가 있을 때만.",
  "신뢰: 사회적 증거(리뷰 수·판매량·평점)와 권위(인증·수상)는 [제품 정보]에 있는 사실만. 없으면 쓰지 않는다.",
  "CTA: 후회 회피·현재 편향('지금 확인하면 ○○'), 행동은 하나만(힉스의 법칙). 희소성·마감은 실제로 그럴 때만 — 가짜 품절·가짜 마감·근거 없는 숫자 금지.",
  "제목 후보: 서로 다른 원칙(손실 회피·호기심·숫자·대비·사회적 증거)으로 나눠 쓴다.",
];

/**
 * v0.9.175 상세페이지 만들기용 (같은 스킬 v2.0.0 에서 상세페이지에 맞는 원칙만). 제품 사실 범위 안에서만
 */
export const PSYCHOLOGY_DETAIL_GUIDE = [
  "이번 상세페이지에 맞는 심리 원칙 3~4개를 골라 섹션 흐름에 녹인다 (원칙 이름은 쓰지 않는다). 우선순위: 제품 사실 > 정직성 > 심리 원칙.",
  "흐름은 AIDA: 첫 화면(Attention) — 손실 회피·대비 효과로 '이 문제 겪고 있죠?' / 고민(Interest) — 할 일(Jobs to be done): 기능이 아니라 해결되는 상황 / 특징(Desire) — 구체적 숫자로 떠올리게(가용성), 장면으로 내 것처럼 느끼게(소유 효과) / 마무리(Action) — 행동은 하나만(힉스의 법칙).",
  "신뢰: 작은 단점이나 맞지 않는 사람을 먼저 솔직히 적으면 신뢰가 오른다(실수 효과, 사실일 때만). 사회적 증거·권위(판매량·인증·수상)는 제품 사실에 있을 때만, 평점·리뷰 수는 쓰지 않는다.",
  "가격·혜택이 사실에 있으면: 앵커링(비싼 대안·정가와 비교), 심적 회계('하루 ○○원 꼴'), 100의 법칙(10만 원 넘으면 '○○원 할인', 아래면 '○○% 할인'). 없으면 쓰지 않는다.",
  "선택 피로 줄이기: 한 섹션 = 메시지 하나, 제품 정보 표는 고를 때 필요한 것만(선택의 역설).",
  "마지막 기억(피크엔드): 마무리 섹션은 가장 좋은 장면 하나 + 지금 할 행동 하나. 가짜 품절·가짜 마감·근거 없는 숫자는 금지.",
  "등록명·키워드는 심리 원칙과 관계없이 검색 규칙대로 쓴다.",
];

/** v0.9.175 캐러셀용 (넘겨 보게·저장하게) */
export const PSYCHOLOGY_CAROUSEL_GUIDE = [
  "이번 캐러셀에 맞는 심리 원칙 3~4개를 골라 장 흐름에 녹인다 (원칙 이름은 쓰지 않는다). 우선순위: 넣은 내용의 사실 > 정직성 > 심리 원칙.",
  "표지: 손실 회피('모르면 손해')·호기심 공백·숫자('안 걸리는 문장 4개') 중 하나로 넘기게 만든다. 표지의 약속은 마지막까지 꼭 지킨다.",
  "중간 장: 자이가르닉 — 다음 장이 궁금하게 끝낸다('근데 진짜는 다음 장'). 목표 경사 — 'n/총'처럼 끝이 보이면 끝까지 넘긴다. 한 장 = 메시지 하나(힉스의 법칙), 쉬운 말(지식의 저주 피하기).",
  "대비 효과: 하면 안 되는 것 vs 해야 하는 것, 전/후를 말풍선·카드로 나란히 보여 준다. 구체적 예시 문장으로 바로 떠올리게(가용성).",
  "사회적 증거·권위는 넣은 내용에 있는 사실만. 없는 발표·수치·후기는 지어내지 않는다.",
  "마지막 장(피크엔드·상호성): 가장 쓸모 있는 한 줄을 정리해 주고, 행동은 하나만 ('저장해 두세요' 또는 '팔로우'). 캡션 첫 줄도 표지와 같은 Hook 으로.",
];
