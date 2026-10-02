import type { AiProviderId, ID, ISODate } from "./common";

/** 사용자별 설정 (한 사용자당 1행, id = 사용자 ID). 작은 값만 담는다 */
export interface UserSettings {
  id: ID;
  userId: ID;
  /** OpenAI 와 Claude 를 모두 연결했을 때 기본으로 쓸 AI. null 이면 연결된 것 중 Claude → OpenAI 순 */
  preferredAi: AiProviderId | null;
  /** 예시 콘텐츠 프로필(가전 콘텐츠)을 자동으로 만든 시각. 한 번만 만든다 (지워도 다시 만들지 않는다) */
  profileSeededAt?: ISODate | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type UserSettingsInput = Partial<Pick<UserSettings, "preferredAi">>;
