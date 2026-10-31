import "server-only";
import { videoStorage } from "../video/storage";
import { AppError } from "../http";
import type { FashionProject, FashionProjectSummary } from "@/lib/fashion/types";

/**
 * AI 패션 저장소 (v0.9.103) — DB 테이블 없이 Storage 비공개 버킷 'videos' (드라마 스튜디오와 같은 방식).
 *   {owner}/fashion/index.json                 프로젝트 목록
 *   {owner}/fashion/{id}/rev/{번호}_{임의}.json   프로젝트 문서 (저장마다 새 이름 — CDN 캐시로 예전 내용을 읽지 않게)
 *   {owner}/fashion/{id}/up|img|bgm|out/…       파일
 * 버킷 정책이 '본인 폴더 + 관리자'만 허용하므로 사용자별 접근 권한이 그대로 적용된다.
 */
const PROJECT_ID = /^fp_[a-z0-9]{6,30}$/;
export const isFashionId = (id: string) => PROJECT_ID.test(id);
export const fashionDir = (owner: string, id: string) => `${owner}/fashion/${id}`;
const indexKey = (owner: string) => `${owner}/fashion/index.json`;
const revDir = (owner: string, id: string) => `${fashionDir(owner, id)}/rev`;
const KEEP_REVS = 15;
const pad = (n: number) => String(n).padStart(9, "0");

/** 이 프로젝트 폴더 안의 키인가 */
export const ownsFashionKey = (owner: string, id: string, key: string) => key.startsWith(`${fashionDir(owner, id)}/`) && !key.includes("..");

export async function readFashionIndex(owner: string): Promise<FashionProjectSummary[]> {
  const buf = await videoStorage.download(indexKey(owner)).catch(() => null);
  if (!buf) return [];
  try {
    const list = JSON.parse(buf.toString("utf8")) as FashionProjectSummary[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function writeIndex(owner: string, list: FashionProjectSummary[]): Promise<void> {
  await videoStorage.put(indexKey(owner), Buffer.from(JSON.stringify(list)), "application/json", "0");
}

export async function loadFashion(owner: string, id: string): Promise<FashionProject> {
  if (!isFashionId(id)) throw new AppError("NOT_FOUND", "프로젝트를 찾지 못했습니다.", 404);
  const revs = await videoStorage.list(revDir(owner, id), { desc: true, limit: 5 }).catch(() => []);
  let buf: Buffer | null = null;
  for (const r of revs.sort((a, b) => b.key.localeCompare(a.key))) {
    buf = await videoStorage.download(r.key).catch(() => null);
    if (buf) break;
  }
  if (!buf) throw new AppError("NOT_FOUND", "프로젝트를 찾지 못했습니다. 지워졌거나 다른 사용자의 프로젝트입니다.", 404);
  try {
    return JSON.parse(buf.toString("utf8")) as FashionProject;
  } catch {
    throw new AppError("BROKEN", "프로젝트 파일을 읽지 못했습니다.", 500);
  }
}

export async function saveFashion(owner: string, p: FashionProject, now: string): Promise<FashionProject> {
  p.rev = (p.rev ?? 0) + 1;
  p.updatedAt = now;
  await videoStorage.put(`${revDir(owner, p.id)}/${pad(p.rev)}_${Math.random().toString(36).slice(2, 8)}.json`, Buffer.from(JSON.stringify(p)), "application/json", "0");
  const all = await videoStorage.list(revDir(owner, p.id), { desc: true, limit: 100 }).catch(() => []);
  for (const old of all.sort((a, b) => b.key.localeCompare(a.key)).slice(KEEP_REVS)) await videoStorage.remove(old.key).catch(() => undefined);
  const list = await readFashionIndex(owner);
  const summary: FashionProjectSummary = { id: p.id, title: p.title, updatedAt: p.updatedAt, createdAt: p.createdAt, looks: p.looks.length };
  await writeIndex(owner, [summary, ...list.filter((x) => x.id !== p.id)].slice(0, 200));
  return p;
}

export async function removeFashionFromIndex(owner: string, id: string): Promise<void> {
  await writeIndex(owner, (await readFashionIndex(owner)).filter((x) => x.id !== id));
}

/** 화면에 보여 줄 파일 키 */
export function fashionKeys(p: FashionProject): string[] {
  return [
    ...p.items.map((i) => i.imageKey ?? ""),
    p.model.photoKey ?? "",
    ...p.model.images.map((i) => i.key),
    ...p.looks.flatMap((l) => l.images.map((i) => i.key)),
    ...p.renders.flatMap((r) => r.keys),
    ...p.tracks.map((t) => t.key),
  ].filter(Boolean);
}

export async function withFashionUrls(p: FashionProject): Promise<{ project: FashionProject; urls: Record<string, string> }> {
  return { project: p, urls: await videoStorage.urls(fashionKeys(p), 3600).catch(() => ({})) };
}
