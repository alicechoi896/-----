/**
 * AI 패션 피드·릴스 (v0.9.103). docs/FASHION.md
 * DB 테이블 없이 Storage 'videos' 버킷의 {owner}/fashion/{projectId}/ 아래 JSON(rev)·파일로 저장한다 (드라마 스튜디오와 같은 방식).
 *
 * 흐름: ① 상품(쿠팡 링크 + 사진 / 제품 라이브러리) → ② 모델(AI · 실제 사진을 살짝 다른 얼굴로) → ③ 배경·문구(POV)
 *      → ④ 룩 이미지(같은 모델·배경·자세, 옷만 바뀜) → ⑤ 결과물: 피드 카드(4:5) · 릴스(가: 사진+움직임 / 나: AI 영상 — 다음 단계)
 */
export type FashionCategory = "outer" | "top" | "bottom" | "dress" | "shoes" | "bag" | "acc";

export const FASHION_CATEGORIES: { value: FashionCategory; label: string; en: string }[] = [
  { value: "outer", label: "아우터", en: "outerwear" },
  { value: "top", label: "상의", en: "top" },
  { value: "bottom", label: "하의", en: "bottom (pants or skirt)" },
  { value: "dress", label: "원피스", en: "dress" },
  { value: "shoes", label: "신발", en: "shoes" },
  { value: "bag", label: "가방", en: "bag" },
  { value: "acc", label: "소품", en: "accessory" },
];

export interface FashionItem {
  id: string;
  name: string;
  category: FashionCategory;
  /** 제품 사진 (Storage 키). 룩 이미지를 만들 때 참고 이미지로 넣는다 */
  imageKey: string | null;
  /** 쿠팡·에이블리 상품 링크 (댓글 링크 안내·내보내기용) */
  sourceUrl: string;
  /** 제품 라이브러리에서 가져왔으면 */
  productId?: string | null;
  createdAt: string;
}

export interface FashionImage {
  id: string;
  key: string;
  prompt: string;
  modelId: string;
  source: "ai" | "upload";
  createdAt: string;
  approved: boolean;
}

export interface FashionModel {
  /** ai = 글로 새 모델 / photo = 올린 실제 사진을 참고해 '살짝 다른 얼굴'로 */
  mode: "ai" | "photo";
  /** 모델 설명 (한국어 또는 영어) */
  description: string;
  /** 참고할 실제 사진 */
  photoKey: string | null;
  /** 만든 모델 기준 이미지 (승인한 1장이 모든 룩의 얼굴 기준) */
  images: FashionImage[];
}

export interface FashionLook {
  id: string;
  /** 'LOOK 1' */
  name: string;
  itemIds: string[];
  /** 룩 한 줄 설명 (릴스 자막·피드 카드 아래) */
  caption: string;
  /** 자세 (영어 또는 한국어) */
  pose: string;
  images: FashionImage[];
  /** v0.9.120 릴스 (나): 룩 이미지에서 시작하는 AI 영상 (Seedance 2.0 Mini 4초). 승인 1개를 릴스에 쓴다 */
  clips?: FashionClip[];
  /** v0.9.124 이 룩만의 영상 동작 (비우면 컨셉) */
  clipMotion?: string;
  /** v0.9.171 피드 카드용: 같은 모델·같은 옷, 무늬 없는 밝은 배경 (승인 1장을 피드에 씀, 없으면 룩 이미지) */
  feedImages?: FashionImage[];
  /** v0.9.181 피드 플랫레이·벽에 건 코디 (모델 없이 제품만) */
  flatImages?: FashionImage[];
  /** v0.9.181 릴스 언박싱 컷 (손으로 꺼내 펼침) */
  unboxImages?: FashionImage[];
  /** v0.9.181 색 조합 추천: 이 룩의 색 2~3개 */
  colors?: { name: string; hex: string }[];
}

export interface FashionClip {
  id: string;
  key: string;
  durationSec: number;
  createdAt: string;
  approved: boolean;
}

export interface FashionSettings {
  /** 주제: 출근룩·데이트룩·하객룩… */
  theme: string;
  /** 배경 프리셋 id (BACKGROUNDS) 또는 'custom' */
  background: string;
  /** custom 배경 설명 */
  backgroundText: string;
  /** 위쪽에 끝까지 고정되는 공감 한 줄 (POV: …) */
  pov: string;
  /** 마지막 안내 (댓글 링크) */
  cta: string;
  /** 릴스: 룩 하나 길이(초) */
  secPerLook: number;
  /** 릴스 방식: a = 사진 + 움직임 효과 (저렴) / b = AI 영상 (다음 업데이트) */
  reelStyle: "a" | "b";
  /** 음악 볼륨 (릴스는 말소리가 없어 음악이 주인공) */
  bgmVolume: number;
  /** v0.9.124 릴스 (나) AI 영상 컨셉 (CLIP_CONCEPTS id) */
  clipConcept?: string;
  /** v0.9.124 AI 영상 추가 요청 (한국어 가능, 모든 룩 공통) */
  clipNote?: string;
  /** v0.9.169 POV 문구 자리: 9:16 룩 사진 기준 가운데 x·y (0~1). 없으면 위쪽 가운데 */
  povPos?: { x: number; y: number } | null;
  /** v0.9.181 콘텐츠 유형 (lib/fashion/formats.ts) — 없으면 룩북 · 모델+제품 카드 */
  format?: string;
  feedFormat?: string;
  /** 얼굴 안 보이는 룩북: 위쪽 고정 체형 줄 (예: 171cm 81kg) */
  bodyLine?: string;
  /** 캐릭터 룩북: POV 아래 작은 안내 (예: 프로필링크에 5%할인쿠폰) */
  noteLine?: string;
  /** 문자 섬네일 플랫레이: 표지 가격대 태그 (예: 2~3만원대) · 표지 작은 줄 */
  coverTag?: string;
  coverSub?: string;
  /** 라벨 카드: 아래 브랜드 이름 · 손글씨 한 줄 */
  brand?: string;
  script?: string;
}

/** v0.9.170 '만드는 중'으로 이만큼 멈춰 있으면 끊긴 것으로 본다 (서버·화면 같은 기준, 렌더 함수 최대 800초보다 길게) */
export const FASHION_STALE_RENDER_MS = 15 * 60_000;

export type FashionTaskStatus = "queued" | "requesting" | "generating" | "success" | "fail";

export interface FashionTask {
  id: string;
  kind: "image" | "music" | "video";
  target: { type: "model" } | { type: "look"; lookId: string } | { type: "bgm" } | { type: "lookclip"; lookId: string } | { type: "feedlook"; lookId: string } | { type: "flatlook"; lookId: string } | { type: "unboxlook"; lookId: string };
  modelId: string;
  prompt: string;
  /** 실제로 보낸 input (참고 이미지는 Storage 키로) */
  request: Record<string, unknown>;
  status: FashionTaskStatus;
  externalTaskId: string | null;
  storedKey: string | null;
  error: string | null;
  credits: number | null;
  requestId: string;
  createdAt: string;
  updatedAt: string;
}

export interface FashionRender {
  id: string;
  kind: "feed" | "reels";
  status: "running" | "success" | "fail";
  /** 피드 = 카드 PNG 여러 장 / 릴스 = mp4 1개 */
  keys: string[];
  totalSec: number | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FashionTrack {
  id: string;
  key: string;
  name: string;
  source: "ai" | "upload";
  createdAt: string;
}

export interface FashionProject {
  id: string;
  title: string;
  rev?: number;
  createdAt: string;
  updatedAt: string;
  settings: FashionSettings;
  items: FashionItem[];
  model: FashionModel;
  looks: FashionLook[];
  tasks: FashionTask[];
  renders: FashionRender[];
  tracks: FashionTrack[];
  /** 릴스에 쓰는 음악 (tracks 의 key) */
  bgmKey: string | null;
}

export interface FashionProjectSummary {
  id: string;
  title: string;
  updatedAt: string;
  createdAt: string;
  looks: number;
}

/** 화면이 저장할 수 있는 부분 (tasks·renders·tracks 는 서버만) */
export type FashionSection = "title" | "settings" | "items" | "model" | "looks" | "bgmKey";
