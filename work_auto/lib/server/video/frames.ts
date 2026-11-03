import "server-only";
import { cleanFrame } from "@/lib/video-production/config";
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

export async function readFrames(owner: string): Promise<Record<string, Frame>> {
  const buf = await videoStorage.download(key(owner)).catch(() => null);
  try {
    return buf ? (JSON.parse(buf.toString("utf8")) as Record<string, Frame>) : {};
  } catch {
    return {};
  }
}

export const videoFrameService = {
  async list(): Promise<Record<string, Frame>> {
    return readFrames(await getCurrentUserId());
  },

  /** frame = null 이면 지운다 (자동으로) */
  async set(input: { videoId?: unknown; frame?: unknown }): Promise<Record<string, Frame>> {
    const owner = await getCurrentUserId();
    const videoId = String(input.videoId ?? "");
    const v = await getRepositories().videos.get(videoId);
    if (!v || v.userId !== owner) throw new AppError("NOT_FOUND", "영상을 찾을 수 없습니다.", 404);
    const map = await readFrames(owner);
    const frame = input.frame == null ? null : cleanFrame(input.frame);
    if (frame && frame.zoom > 1.001) map[videoId] = frame;
    else delete map[videoId];
    await videoStorage.put(key(owner), Buffer.from(JSON.stringify(map)), "application/json", "0");
    return map;
  },
};
