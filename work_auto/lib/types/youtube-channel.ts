/** 채널 정보 · 최근 6개월 뜬 영상 (v0.9.61) — 화면·서버 공용. docs/OUTLIER_SCORE.md */
export interface YouTubeChannelInfo {
  channelId: string;
  title: string;
  handle: string | null;
  description: string;
  thumbnailUrl: string | null;
  subscribers: number | null;
  videoCount: number | null;
  totalViews: number | null;
  createdAt: string | null;
  url: string;
}

export interface YouTubeChannelVideo {
  videoId: string;
  title: string;
  url: string;
  thumbnailUrl: string | null;
  publishedAt: string;
  durationSec: number;
  format: "shorts" | "long";
  views: number | null;
  likes: number | null;
  comments: number | null;
  tags: string[];
  /** 같은 형식(Shorts·롱폼) 중앙값 대비 배수 (표본이 적으면 null) */
  ratio: number | null;
}

export interface YouTubeChannelInsight {
  channel: YouTubeChannelInfo;
  /** 최근 N일 (기본 180일) */
  sinceDays: number;
  videos: YouTubeChannelVideo[];
  /** 형식별 조회수 중앙값과 표본 수 */
  median: { shorts: number | null; long: number | null; shortsSample: number; longSample: number };
  /** 업로드가 많아 최근 영상 일부만 봤으면 true (최대 200개) */
  truncated: boolean;
  /** 이번에 YouTube API 를 쓴 단위 (30분 기억이면 0) */
  units: number;
}

/** 뜬 영상 기준 (중앙값의 몇 배) */
export const CHANNEL_HIT_OPTIONS = [1.5, 2, 3] as const;
