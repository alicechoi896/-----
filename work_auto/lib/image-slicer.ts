"use client";

/**
 * 상세페이지 이미지 조각내기 (브라우저 전용, 서버 비용 없음).
 *
 * 쇼핑몰 상세페이지는 세로로 아주 긴 이미지(예: 860×20000px)가 많다.
 * 그대로 AI 에 보내면 글자가 너무 작게 줄어 읽지 못하므로,
 *  1) 가로를 최대 1000px 로 맞추고
 *  2) 세로 1400px 단위로 자르되 경계의 글자가 잘리지 않게 80px 씩 겹치게 하고
 *  3) JPEG 으로 압축해
 * AI 가 사람처럼 한 화면씩 읽을 수 있게 만든다. 원본 파일은 서버로 보내지도, 저장하지도 않는다.
 */

export interface ImageSlice {
  mediaType: "image/jpeg";
  /** base64 (data: 접두사 없음) */
  data: string;
  fileName: string;
  index: number;
}

const TARGET_WIDTH = 1000;
const SLICE_HEIGHT = 1400;
const OVERLAP = 80;
const JPEG_QUALITY = 0.82;
/** 비용·시간을 고려한 최대 조각 수 */
export const MAX_SLICES = 48;
/** 서버 요청 1번에 담을 최대 크기 (Vercel 요청 한도 4.5MB 보다 작게) */
const MAX_BATCH_CHARS = 3_200_000;
const MAX_BATCH_COUNT = 8;

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    return img;
  } finally {
    // decode 가 끝나면 그리기에 필요한 픽셀은 이미 확보되어 있다
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export async function sliceImageFile(file: File): Promise<ImageSlice[]> {
  const img = await loadImage(file);
  const scale = Math.min(1, TARGET_WIDTH / img.naturalWidth);
  const width = Math.round(img.naturalWidth * scale);
  const totalHeight = Math.round(img.naturalHeight * scale);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이 브라우저에서는 이미지를 처리할 수 없습니다.");

  const slices: ImageSlice[] = [];
  let y = 0;
  let index = 0;
  while (y < totalHeight) {
    const h = Math.min(SLICE_HEIGHT, totalHeight - y);
    canvas.width = width;
    canvas.height = h;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, h);
    // 원본 좌표 기준으로 잘라 축소해서 그린다
    ctx.drawImage(img, 0, y / scale, img.naturalWidth, h / scale, 0, 0, width, h);
    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    slices.push({ mediaType: "image/jpeg", data: dataUrl.slice(dataUrl.indexOf(",") + 1), fileName: file.name, index });
    index++;
    if (y + h >= totalHeight) break;
    y += h - OVERLAP;
  }
  return slices;
}

/** 조각들을 서버 요청 한도에 맞게 묶는다 */
export function batchSlices(slices: ImageSlice[]): ImageSlice[][] {
  const batches: ImageSlice[][] = [];
  let current: ImageSlice[] = [];
  let size = 0;
  for (const s of slices) {
    if (current.length && (size + s.data.length > MAX_BATCH_CHARS || current.length >= MAX_BATCH_COUNT)) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(s);
    size += s.data.length;
  }
  if (current.length) batches.push(current);
  return batches;
}
