import type { ID, ISODate } from "./common";

/**
 * 콘텐츠 프로필 = "무엇을 다룰 것인가" (관심분야).
 * 나의 스타일(UserStyle) = "어떻게 표현할 것인가" 와는 별개의 데이터다. (docs/CONTENT_PROFILE.md)
 *
 * 트렌드 화면은 기본 프로필을 자동으로 적용해 조사 범위(카테고리·키워드)를 정하고,
 * 생성 AI 는 Context 의 [콘텐츠 프로필] 블록으로 받는다.
 */
export interface ContentProfile {
  id: ID;
  userId: ID;
  /** 예: 가전 콘텐츠 */
  name: string;
  description: string;
  /** 대표 카테고리. 예: 가전 */
  mainCategory: string;
  /** 세부 관심분야. 예: 주방가전, 생활가전 */
  subCategories: string[];
  /** 기본 관심 키워드 (트렌드 조사의 출발점) */
  seedKeywords: string[];
  /** 제외 키워드 (트렌드 결과·생성에서 뺀다) */
  excludeKeywords: string[];
  /** 기본 분석 기간(일). 트렌드 화면의 "최근 N일" 초기값 */
  defaultTrendPeriod: number;
  /** 기본 국가 (YouTube regionCode). 예: KR */
  country: string;
  /** 기본 프로필 (사용자당 1개). 트렌드 화면과 생성에 자동 적용 */
  isDefault: boolean;
  /** 사용 중 여부. 꺼 두면 자동 적용·전환 목록에서 빠진다 */
  isActive: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type ContentProfileInput = Omit<ContentProfile, "id" | "userId" | "createdAt" | "updatedAt">;

/**
 * 트렌드 Provider 에 넘기는 조사 범위 (프로필에서 "무엇을 조사할지"만 뽑은 것).
 * 채널별 분석 엔진(YouTube / NAVER)은 이 값만 받고 각자 방식으로 처리한다.
 */
export interface TrendScope {
  profileId: ID;
  profileName: string;
  mainCategory: string;
  subCategories: string[];
  seedKeywords: string[];
  excludeKeywords: string[];
}

/** 프로필 → 조사 범위 */
export function toTrendScope(p: ContentProfile): TrendScope {
  return {
    profileId: p.id,
    profileName: p.name,
    mainCategory: p.mainCategory,
    subCategories: p.subCategories,
    seedKeywords: p.seedKeywords,
    excludeKeywords: p.excludeKeywords,
  };
}

/** 제외 키워드가 들어간 텍스트인가 (공백·대소문자 무시) */
export function hasExcluded(text: string, excludeKeywords: string[]): boolean {
  const t = text.replace(/\s+/g, "").toLowerCase();
  return excludeKeywords.some((k) => {
    const x = k.replace(/\s+/g, "").toLowerCase();
    return x.length > 0 && t.includes(x);
  });
}

/** 예시 프로필 (데모 데이터, 처음 시작할 때 "예시로 만들기") */
export const EXAMPLE_PROFILE: ContentProfileInput = {
  name: "가전 콘텐츠",
  description: "주방·생활·계절 가전 추천과 살림 노하우를 다룹니다.",
  mainCategory: "가전",
  subCategories: ["주방가전", "생활가전", "계절가전", "살림가전"],
  seedKeywords: ["가전추천", "가성비가전", "살림템", "신혼가전"],
  excludeKeywords: ["산업용", "B2B", "중고가전"],
  defaultTrendPeriod: 21,
  country: "KR",
  isDefault: true,
  isActive: true,
};
