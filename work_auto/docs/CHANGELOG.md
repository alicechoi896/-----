# CHANGELOG

형식: [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/) · 날짜는 YYYY-MM-DD

## [0.3.1] - 2026-10-02: 속도 개선

### 원인
- Vercel 서버 함수가 미국 동부(iad1), Supabase 는 서울 → DB 조회마다 태평양 왕복(약 0.2초)
- 로그인 확인(getUser)이 요청마다 Supabase Auth 서버에 네트워크 호출
- Mock 기능에 데모용 인위적 지연 0.7초
- 폰트 파일 2MB 를 첫 방문에 통째로 다운로드

### 변경
- `vercel.json`: 서버 함수 지역을 **서울(icn1)** 로 → Supabase 와 같은 지역
- 로그인 확인 `getUser()` → `getClaims()` (비대칭 키로 토큰을 서버에서 직접 검증, 네트워크 호출 없음) — proxy, getSession
- Mock 지연 기본값 0 (`MOCK_LATENCY_MS` 로만 켬)
- 폰트: Pretendard 동적 서브셋 (92개 조각, 화면에 쓰인 글자 조각만 다운로드)
- 브라우저 조회 캐시 30초 (`api-client`): 화면 이동 시 즉시 표시, 저장·수정·삭제·로그아웃·다시 시도 시 비움
- AI 생성 Context 조회 8개를 병렬 실행
- DB (`schema.sql`): 사용자별·외래키 인덱스 14개 추가, RLS 정책의 `auth.uid()`·`is_admin()`·`is_active()` 를 `(select …)` 로 감싸 요청당 1번만 계산, `profiles.approved_by` 외래키, `analyze`

## [0.3.0] - 2026-10-02: 가입 승인 · 활동 기록 · 내 정보 · 약관

### 추가
- **가입 승인제**: `profiles.status` (pending / active / rejected). 승인 전에는 `/pending` 안내 화면만. 사이트 관리 → **가입 승인** 화면 (등급 선택 승인, 거절 사유, 다시 승인)
- **활동 기록**: `audit_logs` 테이블, `auditService`, 사이트 관리 → **활동 기록** 화면 (종류 필터, 검색)
- **내 정보** `/account`: 이름 변경, 비밀번호 변경, 회원 탈퇴 (`delete_my_account()`)
- **비밀번호 찾기** `/forgot-password` → 재설정 메일 → `/reset-password`
- **이용약관** `/terms`, **개인정보처리방침** `/privacy` (운영자 정보는 `lib/legal.ts`), 회원가입 시 필수 동의 체크
- 보관 기간이 지난 데이터 자동 삭제 `purge_expired_data()` + pg_cron (거절 30일, 탈퇴자 기록 1년)
- DB: `is_active()`, 본인 프로필 수정 정책 + 보호 트리거, 승인된 사용자만 서비스 데이터 접근
- 데모 모드 예시 회원 3명 (승인 대기 2명)

### 수정
- 보호 트리거가 SQL Editor 의 첫 관리자 지정까지 되돌리던 문제 → `security invoker` + `current_user` 로 앱 요청만 제한 (PGlite 로 검증)

### 결정
- 사용량 제한 없음: 외부 API 는 회원 본인 키로 호출되므로 비용이 회원에게 청구된다. 등급은 메뉴 접근만 정한다
- 메일 발송 서비스(SMTP)는 나중에. 비밀번호 재설정은 Supabase 기본 메일 사용

## [0.2.0] - 2026-10-02: 로그인 · 등급 권한 · Supabase · 실제 YouTube 트렌드

### 추가
- **실제 YouTube 트렌드 조회** (`YouTubeDataApiProvider`): search.list → videos.list → channels.list → Trend Score, 실제 썸네일, 6시간 캐시, 할당량·키 오류 안내. 영상 URL 가져오기도 실제 메타데이터 조회
- **Supabase 저장소** (`supabase-store.ts`): Repository 인터페이스 구현. 환경변수가 있으면 Supabase, 없으면 인메모리(데모 모드)
- **DB 스키마** `supabase/schema.sql`: 테이블 11개, RLS, 가입 트리거(실버), `is_admin()`
- **로그인 / 회원가입** `/login` (이메일 + 비밀번호), 인증 메일 콜백 `/auth/callback`, 로그아웃
- **역할**: 관리자 / 실버 / 골드 / VIP (`profiles.role`)
- **권한 체계**: Registry `defaultTiers` + `role_permissions`(바꾼 칸만 저장), `lib/permissions.ts`
- **사이트 관리** (관리자 전용 메뉴): 사용자 관리(역할 변경), 권한 관리(등급 × 메뉴 체크 표)
- 화면 차단 `FeaturePage` / `AdminPage`, 허브 잠금 카드("골드 이상"), 사이드바 권한 필터, 사용자 정보·로그아웃
- API 권한 확인 `requireAccess` / `requireAnyAccess` / `requireAdmin`
- `proxy.ts`: 세션 갱신 + 비로그인 시 로그인 화면으로 (3초 타임아웃)
- 공용 컴포넌트 `Checkbox`, `VideoThumb`
- `DEMO_ROLE` 환경변수 (데모 모드에서 등급별 화면 미리보기)
- 문서: `SUPABASE_SETUP.md`, `AUTH_AND_PERMISSIONS.md`

### 변경
- 화면 폴더를 `app/(app)/`(사이드바 있는 화면)와 `app/(auth)/`(로그인)로 나눔. URL 은 그대로
- 기능 페이지를 `FeaturePage`로 감쌈 (권한 확인 포함)
- `getCurrentUserId()`가 실제 로그인 사용자를 반환 (데모 모드는 `demo-user`)
- 사용하지 않던 `User` Entity·저장소 제거 → `UserProfile`(profiles)로 대체
- 기능 상태: YouTube 트렌드 찾기, 영상 URL 가져오기, API 연결 센터 → `live`

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
