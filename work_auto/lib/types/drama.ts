import type { DramaModelId } from "@/lib/drama/config";

/** AI 드라마 시험 (v0.9.62) — docs/DRAMA_TEST.md */
export interface DramaCharacter {
  /** c1, c2, c3 */
  id: string;
  name: string;
  /** 생김새·옷 (예: 20대 남성, 베이지 셔츠, 청바지) */
  description: string;
  /** Kie 에 올린 사진 (24시간 보관) */
  imageUrl: string | null;
  /** 얼굴 확대 사진 (Kling 인물 요소는 사진 2장 이상) */
  closeUrl: string | null;
  uploadedAt: string | null;
}

export interface DramaScene {
  id: string;
  /** 장소·행동 */
  description: string;
  /** "이름: 대사" 한 줄씩 */
  dialogue: string;
}

export interface DramaTask {
  sceneId: string;
  modelId: DramaModelId;
  taskId: string | null;
  state: "waiting" | "generating" | "success" | "fail";
  resultUrl: string | null;
  credits: number | null;
  error: string | null;
}
