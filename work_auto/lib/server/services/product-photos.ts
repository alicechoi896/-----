import "server-only";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createId } from "@/lib/utils";
import { AppError } from "../http";
import { getCurrentUserId, getRepositories } from "../repositories";
import { videoStorage } from "../video/storage";

/**
 * 제품 '내 사진' (v0.9.172) — 제품 라이브러리에서 직접 올려 관리하는 사진 (숙소 사진 등).
 * 저장: {owner}/products/{productId}/photos.json (순서) + 사진 파일 (DB 변경 없음).
 * 숙소 영상·상세페이지·캐러셀이 제품 사진을 가져올 때 이 사진을 먼저 쓴다.
 */
export const MAX_PRODUCT_PHOTOS = 30;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export interface ProductPhoto {
  key: string;
  url: string;
}

const listKey = (owner: string, productId: string) => `${owner}/products/${productId}/photos.json`;

async function ownProduct(productId: string): Promise<string> {
  const owner = await getCurrentUserId();
  const product = await getRepositories().products.get(String(productId ?? ""));
  if (!product || product.userId !== owner) throw new AppError("NOT_FOUND", "제품을 찾을 수 없습니다.", 404);
  return owner;
}

async function readKeys(owner: string, productId: string): Promise<string[]> {
  const buf = await videoStorage.download(listKey(owner, productId)).catch(() => null);
  try {
    const v = buf ? JSON.parse(buf.toString("utf8")) : [];
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.startsWith(`${owner}/products/${productId}/`)) : [];
  } catch {
    return [];
  }
}
async function writeKeys(owner: string, productId: string, keys: string[]) {
  await videoStorage.put(listKey(owner, productId), Buffer.from(JSON.stringify(keys.slice(0, MAX_PRODUCT_PHOTOS))), "application/json", "0");
}
async function withUrls(keys: string[]): Promise<ProductPhoto[]> {
  if (!keys.length) return [];
  const urls = await videoStorage.urls(keys, 3600).catch(() => ({}) as Record<string, string>);
  return keys.map((key) => ({ key, url: urls[key] ?? "" }));
}

/** 긴 변 2000px JPEG 로 (숙소 사진은 9:16 영상 재료라 넉넉히) */
async function normalize(buf: Buffer): Promise<Buffer> {
  const img = await loadImage(buf).catch(() => {
    throw new AppError("VALIDATION", "사진을 읽지 못했습니다.");
  });
  if (img.width < 200 || img.height < 200) throw new AppError("VALIDATION", "사진이 너무 작습니다 (200px 이상).");
  const s = Math.min(1, 2000 / Math.max(img.width, img.height));
  const c = createCanvas(Math.round(img.width * s), Math.round(img.height * s));
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toBuffer("image/jpeg", 90);
}

export const productPhotoService = {
  async list(productId: string): Promise<ProductPhoto[]> {
    const owner = await ownProduct(productId);
    return withUrls(await readKeys(owner, productId));
  },

  /** 사진 1장 올리기 (data URL, 여러 장은 화면이 한 장씩) */
  async upload(productId: string, dataUrl: unknown): Promise<ProductPhoto[]> {
    const owner = await ownProduct(productId);
    const keys = await readKeys(owner, productId);
    if (keys.length >= MAX_PRODUCT_PHOTOS) throw new AppError("VALIDATION", `사진은 ${MAX_PRODUCT_PHOTOS}장까지입니다.`);
    const m = String(dataUrl ?? "").match(/^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!m) throw new AppError("VALIDATION", "JPG·PNG·WEBP 사진만 올릴 수 있습니다.");
    const raw = Buffer.from(m[2], "base64");
    if (raw.length > MAX_IMAGE_BYTES) throw new AppError("VALIDATION", "사진이 너무 큽니다 (10MB 이하).");
    const key = `${owner}/products/${productId}/p${createId("ph").slice(-10)}.jpg`;
    await videoStorage.put(key, await normalize(raw), "image/jpeg");
    keys.push(key);
    await writeKeys(owner, productId, keys);
    return withUrls(keys);
  },

  async remove(productId: string, key: unknown): Promise<ProductPhoto[]> {
    const owner = await ownProduct(productId);
    const keys = await readKeys(owner, productId);
    const k = String(key ?? "");
    if (!keys.includes(k)) throw new AppError("NOT_FOUND", "사진을 찾을 수 없습니다.", 404);
    await videoStorage.remove(k).catch(() => undefined);
    const next = keys.filter((x) => x !== k);
    await writeKeys(owner, productId, next);
    return withUrls(next);
  },

  /** 순서 바꾸기 (있는 사진만, 빠진 것은 뒤에 그대로) */
  async order(productId: string, keys: unknown): Promise<ProductPhoto[]> {
    const owner = await ownProduct(productId);
    const have = await readKeys(owner, productId);
    const want = (Array.isArray(keys) ? keys.map(String) : []).filter((k) => have.includes(k));
    const next = [...new Set([...want, ...have])];
    await writeKeys(owner, productId, next);
    return withUrls(next);
  },
};

/** 다른 기능이 제품 사진을 쓸 때: 내 사진 파일 (소유 확인은 부르는 쪽에서) */
export async function ownProductPhotoBuffers(owner: string, productId: string, max = MAX_PRODUCT_PHOTOS): Promise<Buffer[]> {
  const keys = (await readKeys(owner, productId)).slice(0, max);
  const out: Buffer[] = [];
  for (const k of keys) {
    const b = await videoStorage.download(k).catch(() => null);
    if (b) out.push(b);
  }
  return out;
}
