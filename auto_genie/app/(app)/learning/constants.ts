// Plain constants shared between the "use server" actions file and client
// components. Kept out of actions.ts because a "use server" module may only
// export async functions to client code — a plain const export there breaks
// at runtime in the client bundle.
export const CONTENT_CATEGORIES = [
  "상품정보",
  "회사소개",
  "강의자료",
  "기존 콘텐츠",
  "고객 질문",
  "고객 후기",
  "상담 기록",
  "마케팅 노하우",
  "브랜드 가이드",
] as const;
