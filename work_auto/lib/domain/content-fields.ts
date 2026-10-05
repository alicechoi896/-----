/**
 * 콘텐츠 분야 (v0.9.41) — 콘텐츠 프로필의 '콘텐츠 분야'(DB: content_profiles.main_category) 기준표.
 * 화면 이름만 바뀌었다: 대표 카테고리 → 콘텐츠 분야, 세부 관심분야 → 세부 대표 키워드 (DB 컬럼은 그대로).
 *
 * - CONTENT_FIELDS: 고를 수 있는 분야 (생성 화면의 '카테고리' 선택지와 같다)
 * - contentFieldYoutubeCategoryMap: 분야 → YouTube 공식 videoCategoryId (첫 번째가 추천). '기타' = 전체 카테고리
 * - normalizeContentField(): 'IT테크'·'IT/테크'·'가전' 처럼 다르게 쓴 값을 분야로 맞춘다 (못 맞추면 '기타')
 * 프로필·카테고리를 바꿔도 API 는 부르지 않는다 (YouTube 트렌드는 [검색]·[급상승 영상]을 눌러야 부른다).
 */
export const CONTENT_FIELDS = ["IT/가전", "생활/주방", "뷰티", "건강/식품", "육아", "반려동물", "재테크", "여행", "자기계발", "기타"] as const;
export type ContentField = (typeof CONTENT_FIELDS)[number];

/** YouTube 공식 카테고리 ID: 2 자동차, 15 동물, 19 여행, 22 인물·블로그, 24 엔터, 26 노하우·스타일, 27 교육, 28 과학기술 */
export const contentFieldYoutubeCategoryMap: Record<ContentField, string[]> = {
  "IT/가전": ["28", "26"],
  "생활/주방": ["26", "22"],
  뷰티: ["26", "22"],
  "건강/식품": ["26", "27"],
  육아: ["22", "26"],
  반려동물: ["15", "22"],
  재테크: ["27", "22"],
  여행: ["19", "22"],
  자기계발: ["27", "22"],
  기타: [],
};

/** 다르게 쓴 이름 → 분야 (공백·기호를 빼고 비교) */
const ALIASES: [ContentField, string[]][] = [
  ["IT/가전", ["it", "it가전", "it테크", "테크", "가전", "전자", "전자기기", "스마트폰", "컴퓨터", "디지털", "가전제품", "생활가전", "주방가전", "과학기술"]],
  ["생활/주방", ["생활", "주방", "리빙", "살림", "생활용품", "주방용품", "인테리어", "자취", "청소"]],
  ["뷰티", ["뷰티", "화장품", "코스메틱", "메이크업", "스킨케어", "헤어", "패션뷰티"]],
  ["건강/식품", ["건강", "식품", "음식", "헬스", "다이어트", "영양제", "요리", "푸드", "건강식품", "운동"]],
  ["육아", ["육아", "출산", "아기", "유아", "키즈", "아이"]],
  ["반려동물", ["반려동물", "펫", "강아지", "고양이", "애견", "애묘", "동물"]],
  ["재테크", ["재테크", "금융", "투자", "주식", "부동산", "경제", "돈", "절약"]],
  ["여행", ["여행", "캠핑", "맛집", "호텔", "숙소", "아웃도어"]],
  ["자기계발", ["자기계발", "교육", "공부", "자격증", "독서", "커리어", "취업", "생산성"]],
];
const squash = (s: string) => s.toLowerCase().replace(/[\s/·,.\-_&+]/g, "");

export function normalizeContentField(raw: string | null | undefined): ContentField {
  const v = squash(raw ?? "");
  if (!v) return "기타";
  const exact = CONTENT_FIELDS.find((f) => squash(f) === v);
  if (exact) return exact;
  for (const [field, words] of ALIASES) if (words.some((w) => v === w || v.includes(w))) return field;
  return "기타";
}

/** 프로필 분야 → 추천 YouTube 카테고리 ID (기타·모름 = undefined = 전체) */
export function recommendedYoutubeCategory(mainCategory: string | null | undefined): string | undefined {
  return contentFieldYoutubeCategoryMap[normalizeContentField(mainCategory)][0];
}

/** YouTube 카테고리(이름 또는 ID) → 생성 화면 카테고리 (트렌드 찾기에서 넘어올 때 자동 선택) */
export function contentFieldFromYoutubeCategory(labelOrId: string | null | undefined): ContentField | null {
  const v = labelOrId ?? "";
  if (!v) return null;
  const byId = (Object.entries(contentFieldYoutubeCategoryMap) as [ContentField, string[]][]).find(([, ids]) => ids[0] === v);
  if (byId) return byId[0];
  const f = normalizeContentField(v.replace(/\(.*\)/, " ") + " " + (v.match(/\((.*)\)/)?.[1] ?? ""));
  return f === "기타" ? null : f;
}
