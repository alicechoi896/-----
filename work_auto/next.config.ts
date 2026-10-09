import type { NextConfig } from "next";

/**
 * 보안 헤더 (모든 화면·API).
 * - 다른 사이트가 우리 화면을 iframe 으로 몰래 띄우는 것(클릭재킹)을 막는다
 * - 파일 형식 추측 금지, 다른 사이트로 넘어갈 때 주소 전체를 보내지 않는다
 * - 카메라·마이크·위치는 쓰지 않으므로 막는다
 * CSP 는 깨질 위험이 없는 항목만 건다 (영상 엔진은 CDN·blob 워커를, 샤오홍슈 영상은 외부 CDN 을 쓴다).
 */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // 개발 표시(N 배지)가 사이드바 하단을 가리지 않도록 오른쪽 아래로 옮긴다
  devIndicators: { position: "bottom-right" },
  poweredByHeader: false,
  // 영상 자동 제작 (v0.9.51): FFmpeg 실행 파일·영상 자료·기본 글꼴을 렌더 함수에 함께 올린다
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/video-production/engine": ["./node_modules/ffmpeg-static/ffmpeg*"],
    "/api/video-jobs": ["./node_modules/ffmpeg-static/ffmpeg*", "./assets/video/**/*", "./node_modules/pretendard/dist/public/static/Pretendard-Black.otf"],
    "/api/video-jobs/*/rerender": ["./node_modules/ffmpeg-static/ffmpeg*", "./assets/video/**/*", "./node_modules/pretendard/dist/public/static/Pretendard-Black.otf"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
