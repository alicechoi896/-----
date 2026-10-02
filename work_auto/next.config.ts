import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 개발 표시(N 배지)가 사이드바 하단을 가리지 않도록 오른쪽 아래로 옮긴다
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
