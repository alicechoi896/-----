import type { ID, ISODate } from "./common";

/**
 * 콘텐츠 업로드 기록 (content_publications).
 * 콘텐츠 "생성"(generated_contents)과 실제 "업로드"를 나눈다:
 *   콘텐츠 1개 → YouTube 업로드 + NAVER 클립 업로드 = 업로드 기록 2개
 * 같은 콘텐츠를 다른 날 다시 올리거나, 예약해 두거나, 생성 시스템 밖에서 만든 콘텐츠를 올린 것도 기록한다.
 * 팀 공용: 승인된 직원은 모두 볼 수 있고, 수정·삭제는 등록자·담당자·관리자만. (docs/UPLOADS.md)
 */
export type PublicationStatus = "draft" | "scheduled" | "published" | "failed";

export interface ContentPublication {
  id: ID;
  /** 등록한 사람 */
  userId: ID;
  /** 생성 시스템에서 만든 콘텐츠면 연결 (직접 등록이면 null) */
  contentId: ID | null;
  productId: ID | null;
  /** youtube / naver-clip / naver-blog … (lib/publish-platforms.ts) */
  platform: string;
  /** 채널·계정 이름 */
  accountName: string;
  title: string;
  /** 원고 유형 (예: 제품 홍보 영상) */
  contentType: string;
  /** 제품명 (등록할 때 복사해 둔다. 다른 직원의 제품은 RLS 로 읽을 수 없어서) */
  productName: string;
  status: PublicationStatus;
  scheduledAt: ISODate | null;
  publishedAt: ISODate | null;
  platformUrl: string | null;
  assigneeId: ID | null;
  assigneeName: string;
  note: string | null;
  createdAt: ISODate;
  updatedAt: ISODate;
}

export type ContentPublicationInput = Pick<
  ContentPublication,
  "contentId" | "productId" | "platform" | "accountName" | "title" | "contentType" | "status" | "scheduledAt" | "publishedAt" | "platformUrl" | "assigneeId" | "note"
>;

/** 생성 콘텐츠의 업로드 상태 (업로드 기록에서 계산한다. generated_contents 에 따로 저장하지 않는다) */
export type ContentUploadState = "none" | "scheduled" | "published";

/** 화면에서 쓰는 목록 응답: 내가 고칠 수 있는지 함께 */
export type ContentPublicationView = ContentPublication & { canEdit: boolean; canDelete: boolean };
