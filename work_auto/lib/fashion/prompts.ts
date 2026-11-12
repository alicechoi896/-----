import { FASHION_CATEGORIES, type FashionImage, type FashionItem, type FashionLook, type FashionModel, type FashionProject, type FashionSettings } from "./types";
import { reelFormatOf } from "./formats";

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

/** v0.9.124 릴스 (나) AI 영상 컨셉 — 동작·카메라 (모든 룩 공통, 룩마다 '이 룩 동작'으로 바꿀 수 있음) */
export const CLIP_CONCEPTS: { id: string; label: string; hint: string; en: string }[] = [
  { id: "pose", label: "포즈 바꾸기 (화보)", hint: "화보 촬영처럼 2~3번 포즈 변경", en: "she changes poses two or three times like a fashion photoshoot — hand on hip, glance over the shoulder, light touch of the hair — holding each pose briefly" },
  { id: "turn", label: "런웨이 턴", hint: "앞으로 걸어와 반 바퀴 돌아 뒷모습까지", en: "she takes two confident steps toward the camera, does a slow half turn to show the back of the outfit, then turns back and looks at the camera" },
  { id: "walk", label: "걸어오기", hint: "카메라 쪽으로 자연스럽게 걸어옴", en: "she walks naturally toward the camera with a relaxed, confident stride, arms swinging lightly" },
  { id: "detail", label: "디테일 클로즈업", hint: "전신 → 옷 디테일로 천천히 다가감", en: "she stands still with a soft smile while the camera slowly pushes in from full body to the outfit details (fabric texture, buttons, bag, shoes) and then pulls back" },
  { id: "breeze", label: "바람·자연스러움", hint: "바람에 머리·옷자락이 날리고 옷매무새 정리", en: "a light breeze moves her hair and the fabric; she smiles, adjusts her jacket or sleeve and looks at the camera" },
  { id: "daily", label: "일상 (출근·외출)", hint: "가방 들고 시계 보기 등 일상 동작", en: "a natural everyday moment matching the theme — she adjusts her bag strap, checks her watch or phone, then smiles at the camera as if heading out" },
  { id: "look", label: "룩 자세 그대로", hint: "④ 룩의 자세 문장을 그대로 움직임으로", en: "" },
  // v0.9.181 콘텐츠 유형용
  { id: "walkout", label: "문 열고 나와 걷기 (워킹)", hint: "카페·건물 문을 열고 나와 카메라 쪽으로", en: "she pushes the glass door open, steps out onto the sidewalk and walks toward the camera with a relaxed confident stride, the camera slowly tracking back" },
  { id: "review", label: "말하듯 리뷰", hint: "카메라에 말하듯 옷을 만지며 보여 줌", en: "she talks to the camera like a casual review vlog, touching and showing the fabric and details of the outfit, turning slightly to show the side, natural expressive gestures" },
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
  clipConcept: "pose",
  clipNote: "",
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
export function modelPrompt(m: FashionModel, opts: { character?: boolean } = {}): string {
  const who = m.description.trim() || "Korean female fashion model in her early 20s, slim, natural makeup, long dark wavy hair";
  // v0.9.181 캐릭터 얼굴 룩북: 사람 대신 인형 같은 캐릭터
  if (opts.character)
    return [
      "[FORMAT] Full-body character reference image, 9:16 vertical.",
      `[CHARACTER] A cute stylized ball-jointed-doll-like girl character: porcelain smooth skin, large glossy eyes with long lashes, small nose and lips, soft blush, semi-realistic 3D doll rendering, consistent design. ${m.description.trim() ? `Look: ${m.description.trim()}.` : "Long wavy brown hair."}`,
      "[POSE] Standing straight facing the camera, whole body visible from head to toe, arms relaxed, sweet expression.",
      "[OUTFIT] Simple plain white t-shirt and light blue jeans, white sneakers.",
      "[BACKGROUND] Plain light-grey studio background, soft even light.",
      "[CONSTRAINTS] Single character only. No text, no letters, no logo, no watermark.",
    ].join("\n");
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
  // v0.9.181 콘텐츠 유형: 카메라·자세 (룩마다 돌아가며), 캐릭터
  const fmt = reelFormatOf(p.settings.format);
  const idx = Math.max(0, p.looks.findIndex((l) => l.id === look.id));
  const pose = look.pose.trim() || fmt.poses?.[idx % fmt.poses.length] || "standing naturally facing the camera, one hand lightly holding the bag strap";
  const wear = items.map((it) => {
    const k = refItems.indexOf(it);
    return `${categoryEn(it.category)}: ${it.name}${k >= 0 ? ` (exactly the item in reference image ${k + offset})` : ""}`;
  });
  return [
    fmt.character ? "[FORMAT] Full-body character fashion lookbook image for an Instagram reel, 9:16 vertical, semi-realistic 3D doll style." : "[FORMAT] Full-body fashion lookbook photo for an Instagram reel, 9:16 vertical, photorealistic.",
    hasModelRef
      ? fmt.character
        ? "[MODEL] The doll-like character in reference image 1. Keep EXACTLY the same character design (face, eyes, hair, skin, proportions) in every look."
        : "[MODEL] The woman in reference image 1. Keep EXACTLY the same face, hairstyle, hair color, skin tone, body shape and height — the same person in every look. Do not beautify or change the face."
      : `[MODEL] ${p.model.description.trim() || "Korean female fashion model in her early 20s, long dark wavy hair"}.`,
    wear.length
      ? `[OUTFIT] She wears ONLY these items, copied faithfully from the reference photos (same color, fabric, pattern, length, neckline, buttons and details): ${wear.join("; ")}. Fill anything missing with plain simple basics that match the style.`
      : "[OUTFIT] A stylish seasonal outfit.",
    `[BACKGROUND] ${backgroundEn(p.settings)}. Exactly the same background, camera position and framing as every other look in this series.`,
    `[POSE] ${pose}.`,
    `[CAMERA] ${fmt.camera}`,
    "[LIGHTING] Soft flattering light, natural colors, the clothes clearly visible.",
    `[CONSTRAINTS] Single person only. ${fmt.character ? "No text, no letters, no logo, no watermark, no frame." : CONSTRAINTS}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** 룩마다 쓰는 제품 사진 (사진 있는 것만, 최대 6장) */
/** v0.9.171 피드 카드용 이미지: 승인한 룩 이미지 그대로, 배경만 무늬 없는 밝은 바탕 (오려 붙인 것처럼 보이게) */
export function feedLookPrompt(): string {
  return [
    "Edit the provided photo. Keep EXACTLY the same woman (face, hair, body, skin), the same outfit (every item, color, fabric, length and detail) and the same pose.",
    "Show her full body from head to toe, centered, with a little space above the head and below the feet.",
    "[BACKGROUND] Replace the whole background with a plain seamless pure warm off-white studio backdrop (#F4F1EA), completely empty: no floor line, no walls, no props, no furniture, no pattern. Only a very soft faint shadow under the feet.",
    "Soft even studio light. Photorealistic fashion catalog look. No text, no logo, no watermark, no frame.",
  ].join("\n");
}

export const lookRefItems = (p: FashionProject, look: FashionLook) =>
  look.itemIds
    .map((id) => p.items.find((x) => x.id === id))
    .filter((x): x is FashionItem => Boolean(x?.imageKey))
    .slice(0, 6);
