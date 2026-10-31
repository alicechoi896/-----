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
}

export type FashionTaskStatus = "queued" | "requesting" | "generating" | "success" | "fail";

export interface FashionTask {
  id: string;
  kind: "image" | "music";
  target: { type: "model" } | { type: "look"; lookId: string } | { type: "bgm" };
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
