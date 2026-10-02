import { SITE_NAME } from "./site";
/**
 * 이용약관·개인정보처리방침에 들어가는 운영자 정보.
 * ⚠️ 정식 운영 전에 [대괄호] 값을 실제 정보로 바꾸고, 문서 전체를 법률 검토 받으세요.
 * 내용을 바꾸면 version 과 effectiveDate 를 함께 올립니다.
 */
export const LEGAL_INFO = {
  serviceName: SITE_NAME,
  operatorName: "[운영자 또는 회사명]",
  representative: "[대표자 이름]",
  contactEmail: "[문의 이메일]",
  privacyOfficer: "[개인정보 보호책임자 이름]",
  privacyOfficerEmail: "[개인정보 보호책임자 이메일]",
  version: "1.0",
  effectiveDate: "2026년 10월 2일",
  /** 탈퇴 회원의 활동 기록 보관 기간 */
  auditLogRetention: "1년",
};
