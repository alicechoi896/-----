import { NAVER_LIST_COUNTS, buildTrendIdeas, dedupe, seasonalCandidates } from "@/lib/domain/naver-trend-lists";
import type { Keyword, NaverRisingTopic, NaverTrendInsight, NaverTrendQuery, TrendScope } from "@/lib/types";
import { hasExcluded } from "@/lib/types/profile";
import { seededNumber } from "@/lib/utils";

/**
 * NAVER 트렌드 Mock.
 * 실제 연동 시: DataLab 검색어 트렌드 API(searchTrend), 쇼핑인사이트 API, 검색광고 키워드도구(연관 키워드/검색량)를 조합한다.
 */

interface CategorySeed {
  topics: { title: string; description: string; keywords: string[] }[];
  rising: string[];
  seasonal: string[];
  related: string[];
  ideas: string[];
}

const DATA: Record<string, CategorySeed> = {
  "생활/주방": {
    topics: [
      { title: "겨울 난방비 절약템", description: "문풍지, 단열 뽁뽁이, 전기요 검색이 함께 늘고 있습니다.", keywords: ["난방비", "단열", "전기요"] },
      { title: "오븐형 에어프라이어 갈아타기", description: "바스켓형 사용자의 대용량 교체 수요가 늘고 있습니다.", keywords: ["오븐형 에어프라이어", "대용량"] },
      { title: "자취생 청소 루틴", description: "무선청소기, 물걸레 청소기 비교 검색이 늘고 있습니다.", keywords: ["무선청소기", "자취 청소"] },
      { title: "김장 대신 소량 김치", description: "1~2인 가구의 소량 김장, 김치 구독 관심이 높습니다.", keywords: ["소량 김장", "김치 구독"] },
    ],
    rising: ["전기요 추천", "문풍지", "가습기 세척", "오븐형 에어프라이어", "무선청소기 추천", "결로 방지"],
    seasonal: ["김장 매트", "난방 텐트", "손난로", "가습기", "온수매트"],
    related: ["에어프라이어 레시피", "청소기 거치대", "주방 정리", "자취 필수템", "살림 꿀팁", "다이소 주방템"],
    ideas: ["원룸 난방비 한 달 실측 정리", "에어프라이어 오븐형 vs 바스켓형 비교표", "자취생 청소 도구 최소 구성", "겨울 결로 막는 5단계 체크리스트"],
  },
  "IT/가전": {
    topics: [
      { title: "AI 노트북", description: "AI PC, 온디바이스 AI 관련 검색이 빠르게 늘고 있습니다.", keywords: ["AI 노트북", "온디바이스 AI"] },
      { title: "아이폰 새 기능", description: "업데이트 이후 숨은 기능, 설정법 검색이 늘었습니다.", keywords: ["아이폰 업데이트", "숨은 기능"] },
      { title: "무선 이어폰 노이즈캔슬링", description: "출퇴근 수요로 가성비 노캔 이어폰 검색이 늘고 있습니다.", keywords: ["노이즈캔슬링", "무선 이어폰"] },
    ],
    rising: ["AI 노트북", "갤럭시 신제품", "아이폰 배터리", "노캔 이어폰", "스마트 플러그", "로봇청소기"],
    seasonal: ["블랙프라이데이 직구", "연말 가전 세일", "수능 선물"],
    related: ["노트북 추천", "가성비 태블릿", "ChatGPT 사용법", "AI 툴 추천", "모니터 추천"],
    ideas: ["가격대별 AI 노트북 정리", "업데이트 후 꼭 바꿔야 할 설정 10가지", "직구 가전 A/S 체크리스트"],
  },
  "건강/식품": {
    topics: [
      { title: "직장인 거북목 관리", description: "스트레칭, 마사지건, 모니터 받침대 검색이 함께 늘고 있습니다.", keywords: ["거북목", "마사지건"] },
      { title: "저속노화 식단", description: "혈당 관리, 저속노화 키워드가 꾸준히 오르고 있습니다.", keywords: ["저속노화", "혈당 관리"] },
    ],
    rising: ["저속노화", "미니 마사지건", "거북목 스트레칭", "단백질 쉐이크", "혈당 다이어트"],
    seasonal: ["독감 예방", "비타민D", "홍삼 선물", "면역력"],
    related: ["마사지건 추천", "폼롤러", "자세 교정", "영양제 조합", "건강 루틴"],
    ideas: ["사무실에서 하는 3분 스트레칭", "마사지건 사용 시 주의사항 정리", "저속노화 식단 일주일 예시"],
  },
};

const FALLBACK = DATA["생활/주방"];

function toKeywords(words: string[], seed: string, withGrowth: boolean): Keyword[] {
  return words.map((text) => ({
    text,
    source: "naver",
    volume: seededNumber(seed + text, 3_000, 180_000),
    growthRate: withGrowth ? seededNumber(seed + text + "g", 15, 340) : undefined,
    competition: (["low", "mid", "high"] as const)[seededNumber(text, 0, 2)],
  }));
}

/** 카테고리의 대표 키워드 (프로필이 없을 때 실제 Provider 가 조사 출발점으로 쓴다) */
export function categorySeedKeywords(category: string): string[] {
  return (DATA[category] ?? FALLBACK).rising.slice(0, 6);
}

/** 콘텐츠 프로필 → 데모용 카테고리 데이터 (프로필 키워드로 그럴듯하게 만든다) */
function seedFromProfile(scope: TrendScope): CategorySeed {
  const subs = scope.subCategories.length ? scope.subCategories : [scope.mainCategory];
  const seeds = scope.seedKeywords.length ? scope.seedKeywords : [scope.mainCategory];
  return {
    topics: subs.slice(0, 4).map((sub, i) => ({
      title: `${sub} 관심 증가`,
      description: `'${sub}' 관련 검색이 최근 늘고 있습니다. (데모 데이터)`,
      keywords: [sub, `${sub} 추천`, seeds[i % seeds.length]],
    })),
    rising: [...seeds, ...subs.map((s) => `${s} 추천`)].slice(0, 8),
    seasonal: subs.map((s) => `${s} 시즌 준비`).slice(0, 5),
    related: [...subs, ...seeds.map((k) => `${k} 순위`)].slice(0, 8),
    ideas: [
      `${scope.mainCategory} 입문자가 많이 묻는 질문 정리`,
      `${subs[0]} 가격대별 추천`,
      `${seeds[0]} 고르는 기준 5가지`,
      `${subs[1] ?? subs[0]} 사기 전에 확인할 것`,
    ],
  };
}

export function buildNaverInsight(query: NaverTrendQuery, now: number): NaverTrendInsight {
  const profile = query.profileScope ?? null;
  const seed = profile ? seedFromProfile(profile) : (DATA[query.category ?? ""] ?? FALLBACK);
  const kw = query.keyword?.trim();
  const base = `${profile?.profileId ?? query.category}-${kw}-${query.periodDays}`;
  const exclude = profile?.excludeKeywords ?? [];
  const keep = (w: string) => !hasExcluded(w, exclude);
  const category = profile?.mainCategory ?? query.category ?? "생활/주방";

  // 데모 목록을 30개까지 채운다 (실제 Provider 와 같은 개수)
  const SUFFIX = ["추천", "순위", "가성비", "후기", "비교", "신제품", "할인", "사용법", "장단점", "브랜드"];
  const risingWords = dedupe([...seed.rising, ...seed.related, ...seed.rising.flatMap((w) => SUFFIX.map((x) => `${w} ${x}`))])
    .filter(keep)
    .slice(0, NAVER_LIST_COUNTS.risingKeywords);
  const topicSeeds = [
    ...seed.topics,
    ...risingWords
      .filter((w) => !seed.topics.some((t) => t.title === w))
      .map((w) => ({ title: w, description: `'${w}' 검색이 최근 늘고 있습니다. (데모 데이터)`, keywords: [w] })),
  ].slice(0, NAVER_LIST_COUNTS.risingTopics);

  const risingTopics: NaverRisingTopic[] = topicSeeds.map((t, i) => ({
    id: `nv_${seededNumber(t.title, 1000, 9999)}`,
    source: "naver",
    title: t.title,
    description: t.description,
    category,
    keywords: t.keywords.filter(keep),
    growthRate: seededNumber(base + t.title, 40, 260),
    trendScore: Math.max(30, 92 - i * 2 + seededNumber(base + i, -4, 4)),
    collectedAt: new Date(now).toISOString(),
  }));

  // 검색어가 있으면 관련 키워드를 검색어 중심으로 확장
  const related = dedupe(
    kw
      ? ["가격", "비교", "후기", "단점", "순위", "추천", "가성비", "브랜드", "사용법", "고르는 법", "신제품", "할인", "중고", "렌탈", "용량", "소음", "전기세", "설치", "청소", "필터", "AS", "2026", "최저가", "장단점", "크기", "무게", "디자인", "색상", "선물", "리뷰"].map((x) => `${kw} ${x}`)
      : [...seed.related, ...seed.related.flatMap((w) => SUFFIX.map((x) => `${w} ${x}`))],
  ).slice(0, NAVER_LIST_COUNTS.relatedKeywords);

  // 기간이 길면 주·월 단위로 묶는다 (실제 데이터랩과 같은 단위)
  const days = query.periodDays;
  const step = days <= 90 ? 1 : days <= 365 ? 7 : 30;
  const points = Math.round(days / step);
  const searchTrend = Array.from({ length: points }, (_, i) => {
    const d = new Date(now - (points - 1 - i) * step * 86_400_000);
    const wave = Math.sin(i / 2.2) * 8;
    const growth = (i / points) * 35;
    return {
      date: step === 30 ? `${String(d.getFullYear()).slice(2)}.${String(d.getMonth() + 1).padStart(2, "0")}` : `${d.getMonth() + 1}/${d.getDate()}`,
      value: Math.round(Math.min(100, 45 + growth + wave + seededNumber(base + i, -5, 5))),
    };
  });

  return {
    query,
    risingTopics,
    risingKeywords: toKeywords(risingWords, base, true),
    seasonalKeywords: toKeywords(seasonalCandidates(category).filter(keep).slice(0, NAVER_LIST_COUNTS.seasonalKeywords), base + "s", true),
    relatedKeywords: toKeywords(related.filter(keep), base + "r", false),
    searchTrend,
    searchTrendLabel: kw ? kw : `${profile?.profileName ?? query.category ?? "카테고리"} 전체`,
    contentIdeas: buildTrendIdeas(
      kw ?? "",
      toKeywords(related.filter(keep), base + "r", false),
      toKeywords(risingWords, base, true),
      toKeywords(seasonalCandidates(category).slice(0, 10), base + "s", true),
      category,
    ),
    keywordStats: kw
      ? {
          keyword: kw,
          monthlyPc: seededNumber(kw + "pc", 1_000, 40_000),
          monthlyMobile: seededNumber(kw + "mo", 5_000, 160_000),
          competition: (["low", "mid", "high"] as const)[seededNumber(kw, 0, 2)],
          blogDocCount: seededNumber(kw + "blog", 2_000, 900_000),
        }
      : null,
    dataSource: "mock",
    notes: [],
    collectedAt: new Date(now).toISOString(),
  };
}

export const NAVER_TREND_CATEGORIES = Object.keys(DATA);
