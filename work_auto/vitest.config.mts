import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * 자동 테스트 (docs/TESTING.md)
 *  npm test          — 기능 규칙(unit) + DB 권한(PGlite). 서버 없이 몇 초
 *  npm run test:api  — 실행 중인 서버(데모 모드)에 실제 요청 (API_BASE_URL, 기본 http://localhost:3000)
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // 서버 전용 표시 패키지: 테스트에서는 빈 모듈
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
  },
});
