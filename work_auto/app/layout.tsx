import type { Metadata } from "next";
import localFont from "next/font/local";
import { AppShell } from "@/components/layout/AppShell";
import { getProviderMode } from "@/lib/server/config";
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
  description: "YouTube, NAVER Clip, NAVER Blog 콘텐츠 제작을 자동화하는 업무용 서비스",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={pretendard.variable}>
      <body>
        <AppShell providerMode={getProviderMode()}>{children}</AppShell>
      </body>
    </html>
  );
}
