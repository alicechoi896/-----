import { FASHION_CATEGORIES, type FashionImage, type FashionItem, type FashionLook, type FashionModel, type FashionProject, type FashionSettings } from "./types";

/**
 * AI 패션 프롬프트 (v0.9.103). 레퍼런스 릴스 20개 분석: 같은 모델이 같은 배경·같은 자리에서 옷만 바뀌고(LOOK1~6, 룩마다 1.5~3초),
 * 위쪽에 POV 공감 한 줄이 끝까지 고정, 음악만. 그래서 룩 이미지는 '모델·배경·카메라는 고정, 옷만 바꾼다'를 가장 강하게 쓴다.
 */
export const BACKGROUNDS: { id: string; label: string; en: string }[] = [
  { id: "elevator", label: "고급 엘리베이터", en: "inside a luxury apartment elevator with brushed stainless steel walls and a polished floor, soft overhead light" },
  { id: "hallway", label: "호텔 복도", en: "a modern hotel corridor with warm beige marble walls and soft indirect lighting" },
  { id: "mirror", label: "전신거울 드레스룸", en: "a bright minimal dressing room in front of a tall full-length mirror, white walls, light wood floor" },
  { id: "street", label: "도심 거리", en: "a clean city sidewalk in front of glass office buildings, daylight" },
  { id: "hanok", label: "한옥 골목 (가을)", en: "a traditional Korean hanok alley with autumn yellow ginkgo trees and fallen leaves" },
  { id: "riverNight", label: "한강 야경", en: "a riverside promenade at night with blurred city lights (bokeh) in the background" },
  { id: "studio", label: "화이트 스튜디오", en: "a plain warm-white photo studio with a seamless backdrop" },
  { id: "cafe", label: "카페 앞", en: "in front of a cozy cafe with a wooden door and large windows, daylight" },
  { id: "field", label: "초원·전원", en: "a green grass field with a wooden fence and blue sky" },
];

export const DEFAULT_SETTINGS: FashionSettings = {
  theme: "출근룩",
  background: "elevator",
  backgroundText: "",
  pov: "",
  cta: "댓글에 '링크' 남겨 주시면 DM 으로 보내 드려요",
  secPerLook: 2,
  reelStyle: "a",
  bgmVolume: 0.5,
};

export const newFashionId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export function emptyFashionProject(id: string, title: string, at: string): FashionProject {
  return {
    id,
    title: title.trim().slice(0, 80) || "새 패션 콘텐츠",
    createdAt: at,
    updatedAt: at,
    settings: { ...DEFAULT_SETTINGS },
    items: [],
    model: { mode: "ai", description: "", photoKey: null, images: [] },
    looks: [],
    tasks: [],
    renders: [],
    tracks: [],
    bgmKey: null,
  };
}

/** 승인한 이미지 (없으면 null) */
export const approvedOf = (list: FashionImage[]) => list.find((i) => i.approved) ?? null;
export const backgroundEn = (s: FashionSettings) => (s.background === "custom" ? s.backgroundText.trim() : BACKGROUNDS.find((b) => b.id === s.background)?.en) || BACKGROUNDS[0].en;
export const categoryEn = (c: FashionItem["category"]) => FASHION_CATEGORIES.find((x) => x.value === c)?.en ?? "item";
export const categoryLabel = (c: FashionItem["category"]) => FASHION_CATEGORIES.find((x) => x.value === c)?.label ?? "소품";

const CONSTRAINTS = "No text, no letters, no logo, no watermark, no frame or border. Photorealistic, natural skin texture, sharp focus on the clothes.";

/** ② 모델 기준 이미지 (전신, 단순한 기본 옷, 회색 스튜디오). photo = 올린 사진을 참고하되 '다른 사람'으로 */
export function modelPrompt(m: FashionModel): string {
  const who = m.description.trim() || "Korean female fashion model in her early 20s, slim, natural makeup, long dark wavy hair";
  return [
    "[FORMAT] Full-body fashion model reference photo, 9:16 vertical, photorealistic lookbook style.",
    m.mode === "photo"
      ? "[REFERENCE] Use the reference photo only for the overall vibe, hairstyle, body type and age. Create a NEW, clearly different person: change the face (eye shape, nose, lips, jawline) so it is NOT the same person as the reference. Do not copy the face."
      : "",
    `[MODEL] ${who}.`,
    "[POSE] Standing straight facing the camera, whole body visible from head to toe with some space above the head and below the feet, arms relaxed, neutral friendly expression.",
    "[OUTFIT] Simple plain fitted white t-shirt and light blue straight jeans, white sneakers (neutral base outfit).",
    "[BACKGROUND] Plain light-grey studio background, soft even light.",
    `[CONSTRAINTS] Single person only. ${CONSTRAINTS}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * ④ 룩 이미지. 참고 이미지 순서: 1 = 모델 기준 이미지, 2… = 이 룩의 제품 사진 (사진이 있는 것만).
 * refItems = 실제로 참고 이미지로 넣는 제품 (순서대로 reference image 2, 3…)
 */
export function lookPrompt(p: FashionProject, look: FashionLook, refItems: FashionItem[], hasModelRef: boolean): string {
  const items = look.itemIds.map((id) => p.items.find((x) => x.id === id)).filter((x): x is FashionItem => Boolean(x));
  const offset = hasModelRef ? 2 : 1;
  const wear = items.map((it) => {
    const k = refItems.indexOf(it);
    return `${categoryEn(it.category)}: ${it.name}${k >= 0 ? ` (exactly the item in reference image ${k + offset})` : ""}`;
  });
  return [
    "[FORMAT] Full-body fashion lookbook photo for an Instagram reel, 9:16 vertical, photorealistic.",
    hasModelRef
      ? "[MODEL] The woman in reference image 1. Keep EXACTLY the same face, hairstyle, hair color, skin tone, body shape and height — the same person in every look. Do not beautify or change the face."
      : `[MODEL] ${p.model.description.trim() || "Korean female fashion model in her early 20s, long dark wavy hair"}.`,
    wear.length
      ? `[OUTFIT] She wears ONLY these items, copied faithfully from the reference photos (same color, fabric, pattern, length, neckline, buttons and details): ${wear.join("; ")}. Fill anything missing with plain simple basics that match the style.`
      : "[OUTFIT] A stylish seasonal outfit.",
    `[BACKGROUND] ${backgroundEn(p.settings)}. Exactly the same background, camera position and framing as every other look in this series.`,
    `[POSE] ${look.pose.trim() || "standing naturally facing the camera, one hand lightly holding the bag strap"}. Whole body visible from head to toe, centered, eye-level camera, 35mm lens look.`,
    "[LIGHTING] Soft flattering light, natural colors, the clothes clearly visible.",
    `[CONSTRAINTS] Single person only. ${CONSTRAINTS}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Suno 배경음악 (릴스: 말소리가 없어 음악이 분위기를 만든다) */
export function fashionMusicPrompt(p: FashionProject, note: string): string {
  const base = note.trim() || `${p.settings.theme} fashion lookbook`;
  return `Instrumental music for a trendy Korean fashion Instagram reel: ${base}. Stylish, catchy, light and upbeat with a clear beat for outfit changes, no vocals, no lyrics, loopable.`.slice(0, 500);
}

/** 룩마다 쓰는 제품 사진 (사진 있는 것만, 최대 6장) */
export const lookRefItems = (p: FashionProject, look: FashionLook) =>
  look.itemIds
    .map((id) => p.items.find((x) => x.id === id))
    .filter((x): x is FashionItem => Boolean(x?.imageKey))
    .slice(0, 6);
