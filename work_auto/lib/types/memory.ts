import type { ChannelId, ID, ISODate } from "./common";
import type { GeneratedValue } from "./content";

/** Style Memory: 사용자가 선호하는 글/영상 스타일 */
export interface UserStyle {
  id: ID;
  userId: ID;
  name: string;
  /** 적용 채널 (여러 개). 비어 있으면 모든 채널 */
  channelIds: ChannelId[];
  /** 적용 콘텐츠 프로필 (선택). 이 스타일로 생성하면 이 프로필을 Context 로 쓴다. 비우면 기본 프로필 */
  profileId?: ID | null;
  tone: string;
  description: string;
  rules: string[];
  examplePhrases: string[];
  bannedPhrases: string[];
  /** 자주 쓰는 Hook (초반 3초 문장) */
  hooks: string[];
  /** 자주 쓰는 CTA (마지막 행동 유도 문장) */
  ctas: string[];
  /** 제목 패턴: 최종 제목이 아니라 설득 구조 참고용. AI 가 매번 새 제목으로 재해석한다 (docs/STYLE_CONTEXT.md) */
  titlePatterns: string[];
  /** 기본 스타일: 적용 채널에서 스타일을 고르지 않고 생성하면 자동 적용 (채널마다 1개) */
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
  platform: "youtube" | "naver" | "xiaohongshu" | "other";
  title: string;
  channelName: string;
  durationSec: number;
  thumbnailColor: string;
  thumbnailUrl?: string;
  note: string | null;
  /** 연관 제품 (선택). '제품 홍보 영상 만들기'에서 참고 영상을 고를 때 함께 보인다 */
  productId?: ID | null;
  createdAt: ISODate;
}

/** 나의 스타일 파일 일괄 추가 미리보기 (POST /api/styles/import). 파일은 저장하지 않는다 */
export interface StyleImportPreview {
  fileType: "txt" | "csv";
  /** 파일에서 찾은 유효 항목 수 (파일 안 중복 포함) */
  found: number;
  /** 종류별 항목 (파일 안 중복은 뺐다). 키: hook, cta, title_pattern, rule, example_phrase, banned_phrase */
  items: Record<"hook" | "cta" | "title_pattern" | "rule" | "example_phrase" | "banned_phrase", string[]>;
  /** 파일 안에서 겹쳐 뺀 수 */
  duplicateInFile: number;
  /** 저장하지 않는 행 (알 수 없는 type, 너무 긴 줄 등). 앞 50개만 */
  errors: { line: number; reason: string }[];
  errorCount: number;
  /** 1,000개를 넘어 뒤를 읽지 않았는지 */
  truncated: boolean;
  /** UTF-8 이 아니어서 한국어 윈도우 인코딩(CP949)으로 읽었는지 */
  decodedAsCp949: boolean;
}
