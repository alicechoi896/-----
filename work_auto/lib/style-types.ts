/**
 * 나의 스타일 > 원하는 유형 (Hook · CTA · 제목 패턴, 각 10개 중 여러 개 선택). docs/STYLE_CONTEXT.md
 *
 * - 생성할 때: 그 항목 후보의 약 70% 를 고른 유형으로, 나머지 약 30% 는 AI 가 다른 유형을 섞어 추천한다
 * - [고른 유형으로 예시 만들기]: AI 가 고른 유형의 예시 문장을 목록에 채운다
 * 저장 형식: user_styles.preferred_types = { hooks?: id[], ctas?: id[], titlePatterns?: id[] }
 * 화면·서버가 같이 쓴다. 유형을 바꾸거나 늘릴 때는 id 를 바꾸지 않는다 (저장된 값이 id).
 */
export const STYLE_TYPE_KINDS = ["hooks", "ctas", "titlePatterns"] as const;
export type StyleTypeKind = (typeof STYLE_TYPE_KINDS)[number];
export type PreferredTypes = Partial<Record<StyleTypeKind, string[]>>;

export interface StyleTypeOption {
  id: string;
  label: string;
  /** AI 에게 주는 설명 (화면에서는 툴팁) */
  hint: string;
  /** 예시 (툴팁·데모 모드 예시 만들기) */
  examples: string[];
}

/** 생성 결과 후보 중 고른 유형으로 만들 비율 */
export const PREFERRED_TYPE_RATIO = 0.7;

export const STYLE_TYPE_KIND_LABEL: Record<StyleTypeKind, string> = { hooks: "Hook", ctas: "CTA", titlePatterns: "제목" };

export const STYLE_TYPES: Record<StyleTypeKind, StyleTypeOption[]> = {
  hooks: [
    { id: "shock", label: "충격형", hint: "예상 못 한 사실·숫자로 바로 멈추게 한다", examples: ["이거 모르고 쓰면 매달 돈 버리는 거예요", "[제품] 이 기능, 90%는 안 써요"] },
    { id: "twist", label: "반전형", hint: "흔한 생각과 반대되는 결론을 먼저 던진다", examples: ["비싼 게 좋은 줄 알았는데 아니었어요", "다들 추천하길래 샀는데 반전이 있어요"] },
    { id: "benefit", label: "이득형", hint: "얻는 이익·절약·편해지는 점을 먼저 말한다", examples: ["이것 하나로 청소 시간 절반 줄었어요", "[대상]이라면 이걸로 매달 아낄 수 있어요"] },
    { id: "question", label: "질문형", hint: "시청자에게 바로 묻는다", examples: ["아직도 이렇게 하고 계세요?", "[제품] 고를 때 뭐부터 보세요?"] },
    { id: "empathy", label: "공감형", hint: "흔한 불편·고민을 짚어 '내 얘기'로 느끼게 한다", examples: ["매번 이것 때문에 짜증 나셨죠", "저도 이거 때문에 한참 고민했어요"] },
    { id: "number", label: "숫자형", hint: "구체적인 숫자·기간·금액으로 시작한다", examples: ["딱 3가지만 확인하세요", "[숫자]초면 끝나는 방법이에요"] },
    { id: "warning", label: "경고형", hint: "흔한 실수·손해를 먼저 경고한다", examples: ["이렇게 쓰면 금방 망가져요", "[제품] 사기 전에 이것부터 보세요"] },
    { id: "compare", label: "비교형", hint: "둘을 맞대어 차이를 궁금하게 한다", examples: ["[A]랑 [B], 뭐가 나을까요", "싼 거랑 비싼 거, 차이가 이거예요"] },
    { id: "curiosity", label: "궁금증형", hint: "결론을 뒤로 미뤄 끝까지 보게 한다", examples: ["마지막에 진짜 이유가 있어요", "이게 왜 잘 팔리는지 알려드릴게요"] },
    { id: "review", label: "후기형", hint: "써 본 결과·사람들 반응으로 시작한다 (실제 경험이 없으면 '써 본 사람들' 식으로)", examples: ["한 달 써 보고 알게 된 것", "써 본 사람들이 제일 많이 말하는 점"] },
  ],
  ctas: [
    { id: "save", label: "저장 유도", hint: "나중에 다시 보게 저장을 권한다", examples: ["나중에 헷갈리지 않게 저장해 두세요", "필요할 때 꺼내 보게 저장해 두세요"] },
    { id: "link", label: "링크 확인", hint: "자세한 정보·구매 링크 확인으로 안내한다", examples: ["자세한 정보는 고정 댓글에 있어요", "가격은 링크에서 확인해 보세요"] },
    { id: "comment", label: "댓글 참여", hint: "댓글로 경험·의견을 남기게 한다", examples: ["여러분은 어떤 걸 쓰세요? 댓글로 알려 주세요", "궁금한 점은 댓글로 남겨 주세요"] },
    { id: "follow", label: "구독·팔로우", hint: "다음 콘텐츠를 위해 구독·팔로우를 권한다", examples: ["이런 꿀팁 더 보려면 구독해 두세요", "팔로우하면 다음 편도 바로 보여요"] },
    { id: "urgency", label: "한정·마감", hint: "기간·수량 한정을 알린다 (사실인 혜택·기간만)", examples: ["할인은 이번 주까지예요", "재고가 있을 때 확인해 보세요"] },
    { id: "soft", label: "부담 없는 제안", hint: "강요 없이 가볍게 권한다", examples: ["필요하신 분만 한번 보세요", "고민 중이라면 참고만 해 주세요"] },
    { id: "benefit", label: "혜택 강조", hint: "행동하면 얻는 이점을 다시 짚는다", examples: ["지금 바꾸면 이번 달부터 달라져요", "한 번 바꿔 두면 계속 편해요"] },
    { id: "next", label: "다음 편 예고", hint: "다음 콘텐츠를 예고해 다시 오게 한다", examples: ["다음 편에서 사용법까지 알려드릴게요", "2편에서 비교 결과 보여드릴게요"] },
    { id: "share", label: "공유 유도", hint: "필요한 사람에게 공유를 권한다", examples: ["필요한 친구에게 보내 주세요", "가족에게도 꼭 알려 주세요"] },
    { id: "question", label: "질문형", hint: "질문으로 끝내 생각·반응을 끌어낸다", examples: ["여러분이라면 뭘 고르시겠어요?", "이거 알고 계셨어요?"] },
  ],
  titlePatterns: [
    { id: "number", label: "숫자형", hint: "개수·기간·금액 같은 숫자를 넣는다", examples: ["[제품] 사기 전에 꼭 알아야 하는 [숫자]가지", "[숫자]일 써 본 [제품] 장단점"] },
    { id: "question", label: "질문형", hint: "검색하는 사람의 궁금증을 그대로 묻는다", examples: ["[제품], 정말 살 만할까?", "[대상]에게 [제품]이 필요할까?"] },
    { id: "compare", label: "비교형", hint: "두 선택지를 비교한다", examples: ["[A] vs [B], 뭐가 더 나을까", "[제품] 저가형과 고급형 차이"] },
    { id: "review", label: "후기형", hint: "사용 결과·솔직한 평가 (실제 경험이 없으면 정보 기반 표현)", examples: ["[제품] 솔직 후기, 장점과 아쉬운 점", "[제품] 써 본 사람들 평가 정리"] },
    { id: "howto", label: "방법형", hint: "하는 법·고르는 법을 알려 준다", examples: ["[제품] 고르는 법, 이것만 보세요", "[키워드] 제대로 하는 방법"] },
    { id: "warning", label: "경고형", hint: "실수·손해를 피하게 한다", examples: ["[제품] 이렇게 쓰면 손해예요", "[키워드] 하기 전에 꼭 확인할 것"] },
    { id: "best", label: "추천형", hint: "추천·순위·베스트를 내세운다", examples: ["[대상]에게 추천하는 [제품] [숫자]가지", "요즘 많이 찾는 [제품] 추천"] },
    { id: "target", label: "대상 지정형", hint: "누구를 위한 글·영상인지 앞에 둔다", examples: ["자취생이라면 꼭 봐야 할 [제품]", "[대상]을 위한 [키워드] 정리"] },
    { id: "conclusion", label: "결론형", hint: "결론·한 줄 요약을 제목에 먼저 쓴다", examples: ["[제품], 결론부터 말하면 이거예요", "[키워드] 한 번에 정리"] },
    { id: "twist", label: "반전형", hint: "예상과 다른 결과를 암시한다", examples: ["비싼 [제품]보다 이게 나았던 이유", "다들 사는 [제품], 의외의 단점"] },
  ],
};

export function findStyleType(kind: StyleTypeKind, id: string): StyleTypeOption | undefined {
  return STYLE_TYPES[kind].find((t) => t.id === id);
}

/** 저장 전 정리: 알려진 항목·유형만, 중복 제거 */
export function cleanPreferredTypes(value: unknown): PreferredTypes {
  const out: PreferredTypes = {};
  if (!value || typeof value !== "object") return out;
  for (const kind of STYLE_TYPE_KINDS) {
    const raw = (value as Record<string, unknown>)[kind];
    if (!Array.isArray(raw)) continue;
    const ids = [...new Set(raw.map(String))].filter((id) => findStyleType(kind, id));
    if (ids.length) out[kind] = ids;
  }
  return out;
}
