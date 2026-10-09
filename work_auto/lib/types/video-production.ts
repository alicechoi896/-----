/**
 * 영상 자동 제작 (v0.9.51) — 화면·서버 공용 타입. docs/VIDEO_PRODUCTION.md
 * 작업은 video_jobs 테이블(본인 + 관리자). 원본 영상·프레임·FFmpeg 로그는 저장하지 않는다.
 */
import type { ID, ISODate } from "./common";

export type VideoSourceMode = "ai" | "xhs" | "mixed";
export type VideoJobStatus = "queued" | "analyzing" | "editing" | "rendering" | "quality_check" | "completed" | "needs_review" | "failed" | "approved";
export type VideoChannel = "youtube" | "naver-clip";

/** 원본 글자 처리 결과 (우선순위: 글자 없는 구간 → 확대·크롭 → 블러 → 사용 안 함) */
export type TextTreatment = "clean" | "crop" | "blur" | "rejected" | "unchecked";

export interface VideoScene {
  index: number;
  /** 이 컷의 대사 = 화면 자막 */
  narration: string;
  /** 효과음 (없으면 null) */
  sfx: string | null;
  /** 제품 버튼 화살표를 이 컷에 */
  arrow: boolean;
  /** 원본 영상 (reference_videos.id) */
  sourceVideoId: string | null;
  /** 사람이 고른 클립이면 자동 배치가 바꾸지 않는다 */
  pinned?: boolean;
  /** 렌더 후 채움 */
  start?: number;
  duration?: number;
  sourceStart?: number;
  textTreatment?: TextTreatment;
  issue?: string | null;
}

export interface VideoPlan {
  contentId: string | null;
  channelId: VideoChannel;
  /** 선택한 제목 (바꾸지 않는다) */
  selectedTitle: string;
  /** 상단 1줄: 제품명·주제 (짧게) */
  topLine1: string;
  /** 상단 2줄: 화면용 짧은 제목·Hook */
  topLine2: string;
  /** 대본 (선택한 1편) */
  script: string;
  sourceMode: VideoSourceMode;
  /** 쓸 수 있는 원본 영상 (자동 배치 후보) */
  sourceVideoIds: string[];
  scenes: VideoScene[];
  /** 마지막 컷에 '최저가 구매링크' 엔딩 */
  ending: boolean;
  bgm: string | null;
  voice: string;
  /** AI 음성 넣기 (false = 자막만·둘 다 없음, v0.9.52) */
  narrationOn?: boolean;
  /** 자막 넣기 (false = 음성만·둘 다 없음) */
  captions?: boolean;
  /** Giphy 짤 (선택 기능, 저작권 확인 필요) — V1 은 자리만 */
  meme: boolean;
}

export interface VideoQa {
  checkedAt?: ISODate;
  durationSec?: number;
  expectedDurationSec?: number;
  blackFrames?: number;
  longSilences?: number;
  sfxCount?: number;
  titleApplied?: boolean;
  captionsApplied?: boolean;
  /** 원본 글자: 처리 결과별 컷 수 */
  textSummary?: Partial<Record<TextTreatment, number>>;
  voice?: "tts" | "none" | "off";
  /** 1회 다운로드: 처음 받은 시각 (1시간 뒤 파일 삭제) */
  downloadedAt?: ISODate;
  /** 파일을 지웠으면 */
  fileDeleted?: boolean;
  aiCalls?: number;
  issues: string[];
}

export interface VideoJob {
  id: ID;
  userId: ID;
  contentId: string | null;
  channelId: VideoChannel;
  sourceMode: VideoSourceMode;
  status: VideoJobStatus;
  plan: VideoPlan;
  qa: VideoQa;
  progress: number;
  outputPath: string | null;
  error: string | null;
  claimedBy: string | null;
  claimedAt: ISODate | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export const VIDEO_STATUS_LABEL: Record<VideoJobStatus, string> = {
  queued: "대기 중",
  analyzing: "영상 분석 중",
  editing: "컷 편집 중",
  rendering: "영상 렌더링 중",
  quality_check: "최종 검사 중",
  completed: "완료",
  needs_review: "검수 필요",
  failed: "실패",
  approved: "승인됨",
};
