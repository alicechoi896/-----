import "server-only";
import { cleanEdit, type SourceEdit } from "@/lib/video-production/source-edit";
import { AppError } from "../http";
import { getCurrentUserId, getRepositories } from "../repositories";
import { videoStorage } from "./storage";

/**
 * v0.9.161 영상별 기본 화면 (확대·위치) — 영상 URL 가져오기에서 로고·글자가 안 보이게 미리 정해 둔다.
 * 영상을 다시 인코딩하지 않고(화질 손해 없음) 설정만 저장 → 영상을 만들 때 원본에서 그대로 잘라 쓴다. 컷에서 정한 화면이 더 우선.
 * 저장: {owner}/video-frames.json (DB 변경 없음)
 */
export type Frame = { zoom: number; x: number; y: number };
const key = (owner: string) => `${owner}/video-frames.json`;

/** v0.9.165 영상별 편집 설정 (구간·기본 화면·시간별 확대). 예전 파일(화면만)도 그대로 읽는다 */
export async function readEdits(owner: string): Promise<Record<string, SourceEdit>> {
  const buf = await videoStorage.download(key(owner)).catch(() => null);
  try {
    const raw = buf ? (JSON.parse(buf.toString("utf8")) as Record<string, unknown>) : {};
    const out: Record<string, SourceEdit> = {};
    for (const [id, v] of Object.entries(raw)) {
      const e = cleanEdit(v);
      if (e) out[id] = e;
    }
    return out;
  } catch {
    return {};
  }
}
/** 예전 이름 — 기본 화면만 */
export async function readFrames(owner: string): Promise<Record<string, Frame>> {
  const e = await readEdits(owner);
  return Object.fromEntries(Object.entries(e).filter(([, v]) => v.frame).map(([k, v]) => [k, v.frame!]));
}

export const videoFrameService = {
  async list(): Promise<Record<string, SourceEdit>> {
    return readEdits(await getCurrentUserId());
  },

  /** 영상 편집 설정 저장 — edit(구간·기본 화면·시간별 확대) 또는 예전 frame. 비면 지운다 */
  async set(input: { videoId?: unknown; edit?: unknown; frame?: unknown }): Promise<Record<string, SourceEdit>> {
    const owner = await getCurrentUserId();
    const videoId = String(input.videoId ?? "");
    const v = await getRepositories().videos.get(videoId);
    if (!v || v.userId !== owner) throw new AppError("NOT_FOUND", "영상을 찾을 수 없습니다.", 404);
    const map = await readEdits(owner);
    const edit = cleanEdit(input.edit !== undefined ? input.edit : input.frame == null ? null : { frame: input.frame });
    if (edit) map[videoId] = edit;
    else delete map[videoId];
    await videoStorage.put(key(owner), Buffer.from(JSON.stringify(map)), "application/json", "0");
    return map;
  },
};
