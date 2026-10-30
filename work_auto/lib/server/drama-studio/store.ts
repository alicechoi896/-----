import "server-only";
import { videoStorage } from "../video/storage";
import { AppError } from "../http";
import { progressOf } from "@/lib/drama-studio/steps";
import type { DramaProject, DramaProjectSummary } from "@/lib/drama-studio/types";

/**
 * 드라마 스튜디오 저장소 (v0.9.81) — DB 테이블을 만들지 않고 기존 Storage 비공개 버킷 'videos' 를 쓴다.
 *   {owner}/drama/index.json                       프로젝트 목록
 *   {owner}/drama/{projectId}/project.json         프로젝트 문서 (단계별 결과·작업·타임라인)
 *   {owner}/drama/{projectId}/img|clip|audio|render/…  파일
 * 버킷 정책이 '본인 폴더 + 관리자'만 허용하므로 사용자별 접근 권한이 그대로 적용된다.
 */
const PROJECT_ID = /^dp_[a-z0-9]{6,30}$/;
export const isProjectId = (id: string) => PROJECT_ID.test(id);
export const projectDir = (owner: string, id: string) => `${owner}/drama/${id}`;
const indexKey = (owner: string) => `${owner}/drama/index.json`;

/** 이 프로젝트 폴더 안의 키인가 (다른 사람·다른 프로젝트 파일을 가리키지 못하게) */
export const ownsKey = (owner: string, id: string, key: string) => key.startsWith(`${projectDir(owner, id)}/`) && !key.includes("..");

export async function readIndex(owner: string): Promise<DramaProjectSummary[]> {
  const buf = await videoStorage.download(indexKey(owner)).catch(() => null);
  if (!buf) return [];
  try {
    const list = JSON.parse(buf.toString("utf8")) as DramaProjectSummary[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function writeIndex(owner: string, list: DramaProjectSummary[]): Promise<void> {
  await videoStorage.put(indexKey(owner), Buffer.from(JSON.stringify(list)), "application/json");
}

export async function loadProject(owner: string, id: string): Promise<DramaProject> {
  if (!isProjectId(id)) throw new AppError("NOT_FOUND", "프로젝트를 찾지 못했습니다.", 404);
  const buf = await videoStorage.download(`${projectDir(owner, id)}/project.json`).catch(() => null);
  if (!buf) throw new AppError("NOT_FOUND", "프로젝트를 찾지 못했습니다. 지워졌거나 다른 사용자의 프로젝트입니다.", 404);
  try {
    return JSON.parse(buf.toString("utf8")) as DramaProject;
  } catch {
    throw new AppError("BROKEN", "프로젝트 파일을 읽지 못했습니다.", 500);
  }
}

/** 저장 (rev +1, 목록 갱신) */
export async function saveProject(owner: string, p: DramaProject, now: string): Promise<DramaProject> {
  p.rev = (p.rev ?? 0) + 1;
  p.updatedAt = now;
  await videoStorage.put(`${projectDir(owner, p.id)}/project.json`, Buffer.from(JSON.stringify(p)), "application/json");
  const list = await readIndex(owner);
  const summary: DramaProjectSummary = { id: p.id, title: p.title, currentStep: p.currentStep, updatedAt: p.updatedAt, createdAt: p.createdAt, approved: progressOf(p).approved };
  await writeIndex(owner, [summary, ...list.filter((x) => x.id !== p.id)].slice(0, 200)).catch(() => undefined);
  return p;
}

export async function removeFromIndex(owner: string, id: string): Promise<void> {
  await writeIndex(owner, (await readIndex(owner)).filter((x) => x.id !== id));
}

/** 프로젝트 안 모든 파일 키 (화면에 보여 줄 서명 주소용) */
export function projectKeys(p: DramaProject): string[] {
  return [
    ...Object.values(p.sheets).flat().map((i) => i.key),
    ...Object.values(p.storyboard).flat().map((i) => i.key),
    ...p.clips.map((c) => c.key),
    ...p.renders.map((r) => r.key ?? ""),
    p.renderSettings.bgmKey ?? "",
  ].filter(Boolean);
}

/** 문서 + 파일 보기 주소 (1시간) */
export async function withUrls(p: DramaProject): Promise<{ project: DramaProject; urls: Record<string, string> }> {
  return { project: p, urls: await videoStorage.urls(projectKeys(p), 3600).catch(() => ({})) };
}
