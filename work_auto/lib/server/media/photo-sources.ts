import "server-only";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getRepositories } from "../repositories";
import { ownProductPhotoBuffers } from "../services/product-photos";
import { safeFetch } from "../security/safe-url";
import { mediaDuration, runFfmpeg } from "../video/ffmpeg";
import { srcKeyOf, storedVideoIds } from "../video/vault";
import { videoStorage } from "../video/storage";

/**
 * 사진 재료 (v0.9.167, 캐러셀·상세페이지 공용) — 외부 유료 호출 없음
 * - 제품 라이브러리 사진: 내 사진(직접 올린 것, v0.9.172) + 대표 사진 + 상세페이지 수집 사진
 * - 연결된 샤오홍슈 영상 장면: 원본을 보관한 영상에서 FFmpeg 로 뽑기 (영상마다 25·50·75%)
 */
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export async function productPhotoBuffers(productId: string, max = 12): Promise<Buffer[]> {
  const repo = getRepositories();
  const product = await repo.products.get(productId);
  const sources = await repo.productSources.list((x) => x.productId === productId, { productId }).catch(() => []);
  const urls = [...new Set([product?.imageUrl, ...sources.flatMap((x) => x.raw?.imageUrls ?? [])].filter((u): u is string => typeof u === "string" && /^https:\/\//.test(u)))];
  // v0.9.172 제품 라이브러리에서 직접 올린 '내 사진'을 먼저 (숙소 사진 등), 남은 자리만 쇼핑몰 사진
  const out: Buffer[] = product ? await ownProductPhotoBuffers(product.userId, productId, max).catch(() => []) : [];
  urls.splice(Math.max(0, max - out.length));
  for (const u of urls) {
    try {
      // v0.9.169 쿠팡 사진은 쿠팡에서 부른 것처럼 (Referer 없으면 막히는 경우)
      const referer: Record<string, string> = /coupangcdn\.com/i.test(u) ? { Referer: "https://www.coupang.com/" } : {};
      const r = await safeFetch(u, { signal: AbortSignal.timeout(15_000), headers: { "User-Agent": UA, Accept: "image/webp,image/jpeg,image/*", ...referer } });
      if (!r.ok) {
        console.info("[PhotoSources] skip", JSON.stringify({ host: new URL(u).hostname, status: r.status }));
        continue;
      }
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length >= 12_000 && buf.length <= MAX_IMAGE_BYTES) out.push(buf);
    } catch {
      // 못 받은 사진은 건너뛴다
    }
  }
  return out;
}

/** 그 제품에 연결된 샤오홍슈 영상(원본 보관)에서 장면 — 최대 maxVideos 개 영상 × 3장. 보관한 영상이 없으면 null */
export async function videoFrameBuffers(owner: string, productId: string, maxVideos = 5): Promise<Buffer[] | null> {
  const stored = await storedVideoIds(owner).catch(() => new Set<string>());
  const vids = (await getRepositories().videos.list((v) => v.userId === owner && v.productId === productId, { userId: owner, productId })).filter((v) => stored.has(v.id)).slice(0, maxVideos);
  if (!vids.length) return null;
  const dir = await mkdtemp(path.join(os.tmpdir(), "frames-"));
  const out: Buffer[] = [];
  try {
    for (const v of vids) {
      const buf = await videoStorage.download(srcKeyOf(owner, v.id)).catch(() => null);
      if (!buf) continue;
      const file = path.join(dir, `${v.id}.mp4`);
      await writeFile(file, buf);
      const dur = await mediaDuration(file).catch(() => 0);
      for (const f of [0.25, 0.5, 0.75]) {
        const png = path.join(dir, `${v.id}_${f}.jpg`);
        const r = await runFfmpeg(["-y", "-ss", String(Math.max(0, dur * f).toFixed(2)), "-i", file, "-frames:v", "1", "-q:v", "2", png]).catch(() => null);
        if (!r) continue;
        const img = await readFile(png).catch(() => null);
        if (img) out.push(img);
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
  return out;
}
