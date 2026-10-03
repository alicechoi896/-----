@AGENTS.md

# 자동화 지니: 작업 규칙

작업 전에 `docs/DEVELOPMENT_GUIDE.md`를 읽는다. 기능 목록은 `docs/FEATURE_REGISTRY.md`에 있다.

- 메뉴, 카드, 페이지 제목은 `lib/registry`에서 만든다. 하드코딩하지 않는다.
- 새 기능은 `defaultTiers`(기본 접근 등급)를 반드시 정하고, 페이지는 `FeaturePage`로 감싼다. 전용 API 는 `requireAccess()`.
- 생성형 기능은 `lib/generators/configs.ts` + `ContentGenerator`로 추가한다.
- 스타일을 프롬프트에 넣을 때는 `buildStyleContext()` / `renderStyleBlocks()` 만 쓴다 (docs/STYLE_CONTEXT.md).
- 업로드 플랫폼은 `lib/publish-platforms.ts` 에만 추가한다 (DB 제한 없음, docs/UPLOADS.md).
- 학습 프로필·좋은 예시는 `buildGenerationContext()` 안에서만 읽는다 (docs/INCREMENTAL_LEARNING.md). 학습 신호가 생기는 API 는 `scheduleLearning()` 을 부른다.
- 외부 API는 `lib/server/providers`의 Provider를 통해서만 호출한다 (`getAIProvider()` 등).
- AI 호출은 반드시 `buildGenerationContext()`를 거친다. 프롬프트를 바꾸면 version을 올린다.
- API Key는 서버에서만 암호화해 다룬다. 클라이언트, 로그, localStorage에 두지 않는다.
- 색, 간격, 반경은 `app/globals.css`의 토큰을 쓴다 (`docs/DESIGN_SYSTEM.md`). 흰색 기반 라이트 테마.
- UI 문구는 한국어(합니다체).
- 기능을 추가하거나 바꾸면 `docs/FEATURE_REGISTRY.md`, `docs/CHANGELOG.md`를 갱신한다.
- 사용자가 넣은 주소로 서버가 접속할 때는 `safeFetch()` 를 쓴다 (`lib/server/security/safe-url.ts`, SSRF 방지).
- 서버 IP 로 외부 서비스를 부르는 API 에는 `rateLimit()` 을 건다 (docs/OPERATIONS.md).
- 완료 전: `npm run lint && npm run typecheck && npm test && npm run build` (자동 테스트: docs/TESTING.md)
