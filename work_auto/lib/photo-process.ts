/**
 * 제품 사진 브라우저 처리 (서버로 올리지 않는다, 저장하지 않는다).
 * - 긴 사진도 블로그용 가로 1080px 이하로 줄이고 JPEG 로 압축한다 (메타데이터·위치 정보는 지워진다)
 * - 비율: 원본 / 1:1 / 4:3 (가운데 기준으로 자른다)
 * - 투명 배경(PNG)은 흰색으로 채운다
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
export async function processPhoto(file: File, ratio: PhotoRatio): Promise<{ blob: Blob; width: number; height: number }> {
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
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, width, height);
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
