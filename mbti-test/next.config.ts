import type { NextConfig } from "next";

// GitHub Pages는 프로젝트 하위 경로(/-----/)에서 서빙되므로,
// GitHub Actions 빌드에서만 basePath를 적용하고 로컬/Vercel 빌드는 영향받지 않게 한다.
const isGithubPagesBuild = process.env.GITHUB_PAGES === "true";
const basePath = isGithubPagesBuild ? "/-----" : "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath,
};

export default nextConfig;
