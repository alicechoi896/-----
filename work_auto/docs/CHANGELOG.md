# CHANGELOG

형식: [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/) · 날짜는 YYYY-MM-DD

## [0.1.1] - 2026-10-02

### 변경
- 채널 표기 변경: `NAVER Clip` → `NAVER 클립`, `NAVER Blog` → `NAVER 블로그` (메뉴, 카드, 페이지 제목, 메타데이터, 문서)
- 프롬프트 `naver-clip.product-content` v1.0.0 → v1.0.1 (작업 지시 안의 채널 표기 변경)
- 채널 ID와 URL(`naver-clip`, `naver-blog`)은 그대로 둔다

### 배포
- GitHub `alicechoi896/-----` 저장소의 `work_auto/` 폴더로 커밋
- Vercel 프로젝트 `work-auto`(flowai 팀) Production 배포, 환경변수 `ENCRYPTION_KEY` 설정

## [0.1.0] - 2026-10-01: V1 골격 (Mock)

빈 `work_auto` 폴더에서 새로 시작했다. 기존 코드 삭제나 대규모 변경은 없다.

### 추가: 프로젝트 기반
- Next.js 16.3 (App Router) + React 19.2 + TypeScript(strict) + Tailwind CSS v4 프로젝트 생성 (`create-next-app`)
- 의존성: `lucide-react`, `clsx`, `tailwind-merge`, `server-only`, `pretendard`(로컬 폰트)
- `npm run typecheck` 스크립트 추가
- `.env.local.example` 추가, `.gitignore`에 예시 파일 허용
- `next.config.ts`: 개발 표시 배지를 오른쪽 아래로 이동

### 추가: 디자인 시스템
- `app/globals.css`: `@theme` 디자인 토큰 (surface, border, text, brand, status, channel accent, radius, shadow, font), 라이트 테마 고정
- `components/ui`: Button / LinkButton / IconButton, Input / Textarea / Select, Badge / Tag, StatusBadge, Tabs / SegmentedControl, FormField, SectionCard / InfoRow / BulletList, DataTable, SearchInput, FilterBar / FilterItem, EmptyState / LoadingState / ErrorState / Notice, CopyButton, SaveButton, IconChip, StatTile, TrendLineChart
- `components/layout`: AppShell, AppSidebar(Registry 기반, 반응형), PageHeader, FeaturePageHeader, PageContainer
- `components/shared`: ChannelCard, FeatureCard, ChannelHub, ProductCard / CreateContentMenu, ProductThumb, ProductAnalysisView, ResultPanel, ApiConnectionCard

### 추가: 구조
- Feature Registry (`lib/registry`): 채널 5개(설정 포함), 기능 15개, 단독 페이지 1개
- Generator Config (`lib/generators`): 생성 기능 7개의 입력 필드와 출력 섹션 스키마
- 도메인 타입 (`lib/types`): User, ApiConnection, Product, ProductSource, ProductAnalysis, ContentProject, GeneratedContent, TrendItem, Keyword, UserStyle, UserFeedback, PerformanceMetric, ReferenceVideo
- 도메인 함수 (`lib/domain`): Trend Score 산식, 정직성 가드레일
- Mock 데이터 (`lib/mock`): 제품 카탈로그 4종, YouTube 트렌드 24건, NAVER 트렌드 3개 카테고리, Seed(제품 3, 스타일 3, 생성 이력 3, 피드백 2, 성과 3, 참고 영상 2)

### 추가: 서버
- Provider 계층 (`lib/server/providers`): AIProvider, YouTubeTrendProvider, NaverTrendProvider, ProductDataCollector 인터페이스 + Registry
  - Mock: AI(결정적 작성기), YouTube, NAVER, URL·이미지 Collector
  - 실제: OpenAIProvider(fetch), TextCollector, YouTube·NAVER testConnection
- AI Memory (`lib/server/ai`): ContextBuilder, 버전 관리 프롬프트 템플릿 8종, 프롬프트 렌더러
- Repository 계층: 인터페이스 + 인메모리 구현 (globalThis 싱글톤)
- 보안: AES-256-GCM API Key 암호화, 마스킹, 공개 DTO
- Service: products(수집 → 분석 → 저장), content-generation, trends, memory, connections, videos
- Route Handler 19개 (`app/api/**`)

### 추가: 화면 (23개 경로)
- 메인(채널 카드 + 요약), 채널 허브 5개, YouTube 트렌드, NAVER 트렌드(Clip/Blog), 생성 화면 7개, 제품 상세페이지 학습, 제품 라이브러리, 제품 상세(수정), 영상 URL 가져오기, AI 학습 관리(5탭), API 연결 센터, 404

### 추가: 문서
- `docs/`: PRD, ARCHITECTURE, DESIGN_SYSTEM, ROUTES, DATA_MODEL, API_PROVIDER_SPEC, AI_LEARNING_SYSTEM, FEATURE_REGISTRY, DEVELOPMENT_GUIDE, CHANGELOG, NEXT_STEPS
- `README.md` 재작성, `CLAUDE.md`에 프로젝트 규칙 추가

### 검증
- `npm run lint` 오류 0, `tsc --noEmit` 오류 0, `next build` 성공 (42개 경로)
- API 흐름 스모크 테스트 35개 항목 통과 (분석 → 저장 → 생성 → 피드백 → Memory 반영, 정직성 가드레일, 키 암호화·마스킹, 삭제)
- Playwright로 주요 화면 17개 캡처 확인, 콘솔 오류 0
