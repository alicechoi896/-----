import type { Metadata } from "next";
import { SITE_NAME } from "@/lib/site";
// Pretendard 동적 서브셋: 글자 범위별로 92개 조각(각 40KB 이하)으로 나뉘어,
// 화면에 실제로 쓰인 글자의 조각만 내려받는다 (전체 2MB 를 한 번에 받지 않음)
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: SITE_NAME,
    template: `%s · ${SITE_NAME}`,
  },
  description: "YouTube, NAVER 클립, NAVER 블로그 콘텐츠 제작을 자동화하는 업무용 서비스",
};

/** 최상위 레이아웃: 폰트와 전역 스타일만. 사이드바는 (app)/layout.tsx 에 있다 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
