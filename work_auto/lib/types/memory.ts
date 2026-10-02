import type { ChannelId, ID, ISODate } from "./common";
import type { GeneratedValue } from "./content";

/** Style Memory: 사용자가 선호하는 글/영상 스타일 */
export interface UserStyle {
  id: ID;
  userId: ID;
  name: string;
  /** "all" 이면 모든 채널에 적용 */
  channelId: ChannelId | "all";
  tone: string;
  description: string;
  rules: string[];
  examplePhrases: string[];
  bannedPhrases: string[];
  /** 채널별 기본 스타일 (채널당 1개) */
  isDefault: boolean;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type UserStyleInput = Omit<UserStyle, "id" | "userId" | "createdAt" | "updatedAt">;

/** Feedback Data: 좋아요 / 별로예요 / 수정본 */
export interface UserFeedback {
  id: ID;
  userId: ID;
  contentId: ID;
  featureId: string;
  rating: "up" | "down";
  reason: string | null;
  /** 사용자가 직접 고친 결과 (가장 강력한 학습 신호) */
  editedOutput: Record<string, GeneratedValue> | null;
  createdAt: ISODate;
}

export type UserFeedbackInput = Pick<UserFeedback, "contentId" | "rating"> & {
  reason?: string;
  editedOutput?: Record<string, GeneratedValue>;
};

/** Performance Data: 게시 후 성과 (향후 플랫폼 API와 연동) */
export interface PerformanceMetric {
  id: ID;
  contentId: ID;
  channelId: ChannelId;
  platformUrl: string | null;
  views: number | null;
  clicks: number | null;
  ctr: number | null;
  likes: number | null;
  comments: number | null;
  conversions: number | null;
  revenue: number | null;
  source: "manual" | "youtube-analytics" | "naver" | "mock";
  measuredAt: ISODate;
}

/** 영상 URL 가져오기로 저장한 참고 영상 */
export interface ReferenceVideo {
  id: ID;
  userId: ID;
  url: string;
  platform: "youtube" | "naver" | "other";
  title: string;
  channelName: string;
  durationSec: number;
  thumbnailColor: string;
  note: string | null;
  createdAt: ISODate;
}
