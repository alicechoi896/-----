/**
 * AI 패션 콘텐츠 유형 (v0.9.180) — 레퍼런스(ref/fashion 12종) 분석으로 만든 릴스 8가지 · 피드 5가지.
 * 유형을 고르면 룩 이미지 구도·포즈·배경, 화면 글자 배치(POV·LOOK·n번룩·요일·체형·작은 안내), 컷 전환, AI 영상 동작이 바뀐다.
 * 기본(lookbook · card)은 예전과 똑같다.
 */
export type ReelFormat = "lookbook" | "daily" | "weekday" | "faceless" | "character" | "unboxing" | "walking" | "review";
export type FeedFormat = "card" | "cardLabel" | "flatTitle" | "flatlay" | "palette";

/** 릴스 화면 글자 */
export interface ReelOverlaySpec {
  /** 위쪽 POV 문구: 끝까지 고정 / 첫 룩에만 크게 / 없음 */
  pov: "fixed" | "firstBig" | "none";
  /** 룩 라벨: LOOK1 (왼쪽 위) / 1번룩 (가운데 작게) / 요일 (왼쪽 위) / 없음 */
  label: "look" | "num" | "weekday" | "none";
  /** 룩 한 줄 설명 (아래 큰 글씨) */
  caption: boolean;
  /** 위쪽 고정 체형 줄 (예: 171cm 81kg) */
  bodyLine: boolean;
  /** POV 아래 작은 안내 (예: 프로필링크에 5%할인쿠폰) */
  noteLine: boolean;
}

export interface ReelFormatSpec {
  value: ReelFormat;
  label: string;
  hint: string;
  /** 레퍼런스 */
  ref: string;
  overlay: ReelOverlaySpec;
  /** 룩 이미지에 더할 카메라·포즈 (영어) */
  camera: string;
  /** 룩마다 돌아가며 쓸 자세 (영어, 비우면 룩의 자세) */
  poses?: string[];
  /** 기본 배경 (BACKGROUNDS id) */
  background?: string;
  /** 모델을 인형 같은 캐릭터로 */
  character?: boolean;
  /** 컷 사이 엘리베이터 문 닫힘·열림 */
  doors?: boolean;
  /** 룩마다 언박싱 컷(손으로 꺼내 펼침)을 앞에 */
  unbox?: boolean;
  /** AI 영상(릴스 나)이 기본, 그 동작 */
  clip?: string;
  secPerLook?: number;
}

const CAM_EYE = "Whole body visible from head to toe, centered, eye-level camera, 35mm lens look.";

export const REEL_FORMATS: ReelFormatSpec[] = [
  {
    value: "lookbook",
    label: "룩북 (기본)",
    hint: "삼각대 전신, 같은 자리에서 옷만 바뀜, 위쪽 POV 고정 · LOOK 라벨",
    ref: "lightme_showroom",
    overlay: { pov: "fixed", label: "look", caption: true, bodyLine: false, noteLine: false },
    camera: CAM_EYE,
  },
  {
    value: "daily",
    label: "일상 룩북",
    hint: "야외·현관 같은 일상 장소, 앞·뒤·옆·걷는 컷이 섞임, POV 고정 · LOOK1~6",
    ref: "목장·아파트 현관 일상룩 4개",
    overlay: { pov: "fixed", label: "look", caption: false, bodyLine: false, noteLine: false },
    camera: "Candid everyday snapshot taken by a friend with a phone, natural daylight, " + CAM_EYE,
    poses: [
      "standing relaxed facing the camera with a soft smile",
      "standing with her back to the camera, looking away into the distance so the back of the outfit is visible",
      "three-quarter view walking slowly past the camera, mid-stride",
      "standing with weight on one leg, hands in pockets, glancing to the side",
    ],
    background: "field",
  },
  {
    value: "weekday",
    label: "요일 룩 (엘리베이터)",
    hint: "Monday~Friday 라벨, 엘리베이터 문이 닫혔다 열리면 옷이 바뀜",
    ref: "엘리베이터 Monday~Thursday",
    overlay: { pov: "none", label: "weekday", caption: false, bodyLine: false, noteLine: false },
    camera: "She stands inside the open elevator facing the camera as the doors have just opened, the elevator door frame visible on both sides. " + CAM_EYE,
    background: "elevator",
    doors: true,
    secPerLook: 2.5,
  },
  {
    value: "faceless",
    label: "얼굴 안 보이는 룩북",
    hint: "폰을 들고 위에서 내려다본 셀카, 얼굴 없이 옷·신발만, 위쪽 체형 고정 · n번룩",
    ref: "viva.showroom",
    overlay: { pov: "firstBig", label: "num", caption: false, bodyLine: true, noteLine: false },
    camera:
      "High-angle point-of-view selfie: she holds the phone herself at chest height pointing down at her own outfit with a wide-angle lens. Her face is NOT visible (cropped out of the frame above the chin); only the outfit, hands and shoes are seen from above, slightly tilted, on a concrete studio floor with soft window light.",
    background: "studio",
    secPerLook: 1.5,
  },
  {
    value: "character",
    label: "캐릭터 얼굴 룩북",
    hint: "사람 대신 인형 같은 AI 캐릭터, 같은 장소, POV 2줄 + 작은 안내(쿠폰 등)",
    ref: "인형 캐릭터 LOOK1~6",
    overlay: { pov: "fixed", label: "look", caption: false, bodyLine: false, noteLine: true },
    camera: CAM_EYE,
    poses: ["standing and waving one hand at the camera with a cute smile", "standing shyly with hands clasped", "one hand touching her cheek, head slightly tilted", "standing with one hand raised high in a cheerful wave"],
    background: "street",
    character: true,
  },
  {
    value: "unboxing",
    label: "언박싱",
    hint: "표지(완성 룩) → 손으로 옷을 꺼내 펼침 → 거울 앞 착용(폰으로 얼굴 가림) → 댓글 링크",
    ref: "unbox.dairy",
    overlay: { pov: "firstBig", label: "none", caption: false, bodyLine: false, noteLine: false },
    camera: "Mirror selfie in a cozy pink bedroom with a vanity and plants: she holds a phone in front of her face (face hidden by the phone) and shows the full outfit in a tall mirror. Whole body visible.",
    background: "mirror",
    unbox: true,
  },
  {
    value: "walking",
    label: "워킹 (AI 영상)",
    hint: "카페·건물 문을 열고 나와 카메라 쪽으로 걸어옴, 룩마다 AI 영상, 글자 없음",
    ref: "파리 거리 워킹",
    overlay: { pov: "none", label: "none", caption: false, bodyLine: false, noteLine: false },
    camera: "She is stepping out of a cafe's glass door onto a stone sidewalk of an elegant European street, mid-stride toward the camera. " + CAM_EYE,
    background: "cafe",
    clip: "she pushes the glass door open, steps out onto the sidewalk and walks toward the camera with a relaxed confident stride, the camera slowly tracking back",
    secPerLook: 3,
  },
  {
    value: "review",
    label: "1인 리뷰형 (AI 영상)",
    hint: "한 아이템 리뷰, 카메라에 말하듯 자막, 실내·야외",
    ref: "가을 필수템 야상자켓",
    overlay: { pov: "firstBig", label: "none", caption: true, bodyLine: false, noteLine: false },
    camera: "Casual vlog-style shot in a bright white bedroom, she stands facing the camera presenting the outfit like a review. " + CAM_EYE,
    background: "studio",
    clip: "she talks to the camera like a casual review vlog, touching and showing the jacket fabric and pockets, turning slightly to show the side, natural expressive gestures (no audio needed)",
    secPerLook: 3,
  },
];

export interface FeedFormatSpec {
  value: FeedFormat;
  label: string;
  hint: string;
  ref: string;
  /** 피드에 쓸 이미지: 룩(모델) / 플랫레이 / 벽에 건 옷 */
  image: "look" | "flat" | "hanging";
}
export const FEED_FORMATS: FeedFormatSpec[] = [
  { value: "card", label: "모델 + 제품 카드 (기본)", hint: "점무늬 크림 바탕, LOOK 타원, 왼쪽 모델·오른쪽 제품", ref: "zzuri__a", image: "look" },
  { value: "cardLabel", label: "라벨 카드 (A DAILY MOOD)", hint: "모델 전신 + 아이템마다 이름·색 라벨 + 손글씨 한 줄 + 브랜드", ref: "Letier 12장", image: "look" },
  { value: "flatTitle", label: "문자 섬네일 플랫레이", hint: "표지에만 가격대 태그·큰 제목 3줄, 나머지는 글자 없는 플랫레이", ref: "HABIMORE·이너 추천", image: "flat" },
  { value: "flatlay", label: "코디 플랫레이", hint: "모델 없이 옷·가방·신발을 바닥에 펼쳐 놓은 코디, 표지 작은 줄 + 큰 2줄", ref: "겨울 아우터 모음", image: "flat" },
  { value: "palette", label: "색 조합 추천", hint: "위에 색 칩 3개 + 색 이름, 아래 벽에 건 코디", ref: "Vanessa 색 조합", image: "hanging" },
];

export const reelFormatOf = (v: unknown): ReelFormatSpec => REEL_FORMATS.find((f) => f.value === v) ?? REEL_FORMATS[0];
export const feedFormatOf = (v: unknown): FeedFormatSpec => FEED_FORMATS.find((f) => f.value === v) ?? FEED_FORMATS[0];

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** 피드용 새 이미지 프롬프트 (참고 이미지 = 이 룩의 제품 사진들) */
export function flatPrompt(kind: "flat" | "hanging", items: { category: string; name: string }[], theme: string): string {
  const list = items.map((it, i) => `${it.category}: ${it.name} (exactly the item in reference image ${i + 1})`).join("; ");
  return kind === "flat"
    ? [
        "[FORMAT] Overhead flat lay fashion photo, 4:5 vertical, photorealistic, editorial e-commerce style.",
        `[ITEMS] Lay out ONLY these items as one coordinated outfit, copied faithfully from the reference photos (same color, fabric, pattern, details): ${list}. Arrange them naturally like a person is wearing them (top above the bottom, shoes below, bag and small accessories like a watch or rings beside).`,
        `[SURFACE] One consistent surface for the whole series: a warm greige paper backdrop with soft natural window light and gentle diagonal shadows. Theme: ${theme}.`,
        "[CONSTRAINTS] No person, no mannequin, no hands. No text, no letters, no logo, no watermark, no frame.",
      ].join("\n")
    : [
        "[FORMAT] Fashion styling photo, 4:5 vertical, photorealistic.",
        `[ITEMS] Hang ONLY these items as one coordinated outfit on a single wooden hanger against a plain warm off-white wall, copied faithfully from the reference photos (same color, fabric, details): ${list}. The top on the hanger, the bottom hanging below it, the bag hanging from the hanger hook, the shoes placed on the floor under the outfit.`,
        "[LIGHT] Soft even daylight, a faint shadow on the wall.",
        "[CONSTRAINTS] No person, no mannequin. Empty space at the top for color swatches. No text, no letters, no logo, no watermark.",
      ].join("\n");
}

/** 언박싱 컷: 손으로 제품을 꺼내 펼쳐 보여 줌 (참고 이미지 1 = 대표 제품) */
export function unboxPrompt(item: { category: string; name: string }): string {
  return [
    "[FORMAT] Vertical 9:16 first-person unboxing photo, photorealistic.",
    `[ACTION] Two hands hold up and unfold the ${item.category} (${item.name}) — exactly the item in reference image 1, same color, fabric, details — just taken out of a clear plastic shipping bag, in front of the camera.`,
    "[SCENE] A cozy pink bedroom with a vanity, a tall mirror and soft morning light; the opened plastic packaging and tissue paper on the bed below.",
    "[CONSTRAINTS] No face visible, only hands. No text, no letters, no logo, no watermark.",
  ].join("\n");
}
