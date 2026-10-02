/**
 * 제품 사진 브라우저 처리 (서버로 올리지 않는다, 저장하지 않는다).
 * - 긴 사진도 블로그용 가로 1080px 이하로 줄이고 JPEG 로 압축한다 (메타데이터·위치 정보는 지워진다)
 * - 비율: 원본 / 1:1 / 4:3 (가운데 기준으로 자른다)
 * - 투명 배경(PNG)은 흰색으로 채운다
 * - 중복 방지 자동 변형(vary): 판매처 사진과 "같은 이미지"로 보이지 않게 사진마다 다르게
 *   미세 회전(±0.6~1.6°)·확대(3~6%)·위치 이동·밝기·대비·채도(±4~6%)를 준다. 제품 모양은 바꾸지 않는다
 * 처리 결과는 이 화면(탭)에만 있고, 새로고침하면 사라진다.
 */

export type PhotoRatio = "original" | "1:1" | "4:3";

export interface ProcessedPhoto {
  id: string;
  /** 다운로드 파일 이름 (예: 무선청소기-추천_01.jpg) */
  name: string;
  originalName: string;
  blob: Blob;
  /** 미리보기용 object URL (지울 때 revoke) */
  url: string;
  width: number;
  height: number;
  sizeBefore: number;
  caption: string;
  /** 중복 방지 자동 변형을 적용했는지 */
  varied?: boolean;
  /** AI 배경 연출을 적용했으면 그 배경 (원본은 file 에 그대로) */
  aiStyle?: string | null;
}

export const MAX_PHOTOS = 10;
export const RECOMMENDED_PHOTOS = 5;
const MAX_WIDTH = 1080;
const QUALITY = 0.85;
const MAX_INPUT_BYTES = 30 * 1024 * 1024;

const RATIO: Record<Exclude<PhotoRatio, "original">, number> = { "1:1": 1, "4:3": 4 / 3 };

async function decode(file: File): Promise<ImageBitmap> {
  try {
    // 휴대폰 사진의 회전 정보(EXIF)를 반영해서 연다
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`${file.name}: 열 수 없는 이미지입니다. JPG, PNG, WEBP 를 사용해 주세요. (아이폰 HEIC 는 JPG 로 바꿔서 올려 주세요)`);
  }
}

/** 사진 1장 처리 */
export async function processPhoto(file: File, ratio: PhotoRatio, opts: { vary?: boolean } = {}): Promise<{ blob: Blob; width: number; height: number }> {
  if (file.size > MAX_INPUT_BYTES) throw new Error(`${file.name}: 30MB 이하 이미지만 처리할 수 있습니다.`);
  const bitmap = await decode(file);
  // 자를 영역 (가운데 기준)
  let sx = 0;
  let sy = 0;
  let sw = bitmap.width;
  let sh = bitmap.height;
  if (ratio !== "original") {
    const target = RATIO[ratio];
    if (sw / sh > target) {
      sw = Math.round(sh * target);
      sx = Math.round((bitmap.width - sw) / 2);
    } else {
      sh = Math.round(sw / target);
      sy = Math.round((bitmap.height - sh) / 2);
    }
  }
  const scale = Math.min(1, MAX_WIDTH / sw);
  const width = Math.round(sw * scale);
  const height = Math.round(sh * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이 브라우저에서는 이미지 처리를 할 수 없습니다.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = "high";
  if (opts.vary) {
    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const angle = (rand(0.6, 1.6) * (Math.random() < 0.5 ? -1 : 1) * Math.PI) / 180;
    // 회전해도 모서리가 비지 않게 키운 뒤 조금 더 확대하고, 남는 여유 안에서 살짝 옮긴다
    const cover = Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle)) * Math.max(width / height, height / width);
    const zoom = cover * rand(1.03, 1.06);
    const slackX = ((zoom - cover) * width) / 2;
    const slackY = ((zoom - cover) * height) / 2;
    if ("filter" in ctx) ctx.filter = `brightness(${rand(0.96, 1.05).toFixed(3)}) contrast(${rand(0.95, 1.06).toFixed(3)}) saturate(${rand(0.94, 1.08).toFixed(3)})`;
    ctx.translate(width / 2 + rand(-slackX, slackX), height / 2 + rand(-slackY, slackY));
    ctx.rotate(angle);
    ctx.scale(zoom, zoom);
    ctx.drawImage(bitmap, sx, sy, sw, sh, -width / 2, -height / 2, width, height);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if ("filter" in ctx) ctx.filter = "none";
  } else {
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
  }
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
  if (!blob) throw new Error(`${file.name}: 이미지를 만들지 못했습니다.`);
  return { blob, width, height };
}

/** 파일 이름에 쓸 수 없는 문자를 바꾼다 */
export function safeFileBase(text: string): string {
  return (text.trim() || "제품사진").replace(/[\\/:*?"<>|\s]+/g, "-").replace(/-+/g, "-").slice(0, 40);
}

export function photoFileName(base: string, index: number): string {
  return `${safeFileBase(base)}_${String(index + 1).padStart(2, "0")}.jpg`;
}

/** AI 사진 설명용 작은 미리보기 (가로 512px, base64) */
export async function thumbnailBase64(blob: Blob, maxWidth = 512): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.75);
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

/** 브라우저에서 파일 내려받기 */
export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 본문의 사진 자리 표시: [사진1], [사진 2] */
export const PHOTO_MARKER = /\[사진\s*(\d{1,2})\]/g;

/** 처리된 사진 → AI 편집용 JPEG base64 (긴 변 1024px) */
export async function imageForAi(blob: Blob, maxSide = 1024): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

/** base64 → Blob + 크기 */
export async function base64ToPhoto(b64: string, mediaType = "image/jpeg"): Promise<{ blob: Blob; width: number; height: number }> {
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: mediaType });
  const bitmap = await createImageBitmap(blob);
  const out = { blob, width: bitmap.width, height: bitmap.height };
  bitmap.close();
  return out;
}
