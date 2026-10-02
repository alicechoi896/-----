import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const pretendard = localFont({
  src: "../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  variable: "--font-pretendard",
  weight: "45 920",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "콘텐츠 자동화 센터",
    template: "%s · 콘텐츠 자동화 센터",
  },
  description: "YouTube, NAVER 클립, NAVER 블로그 콘텐츠 제작을 자동화하는 업무용 서비스",
};

/** 최상위 레이아웃: 폰트와 전역 스타일만. 사이드바는 (app)/layout.tsx 에 있다 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={pretendard.variable}>
      <body>{children}</body>
    </html>
  );
}
