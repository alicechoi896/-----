# 콘텐츠 자동화 센터

YouTube, NAVER 클립, NAVER 블로그 콘텐츠 제작(소재 조사 → 제목·대본·글 → 키워드·해시태그)을 자동화하는 **업무용 웹서비스**입니다.
제품 정보, 내 스타일, 좋은 결과, 피드백, 성과를 저장해 두고 **생성할 때마다 Context로 주입**하므로, 쓸수록 결과가 나에게 맞춰집니다.

> 현재 버전 **v0.3.0**: 로그인(관리자 승인제), 등급 권한(관리자·실버·골드·VIP), 사이트 관리(가입 승인·사용자·권한·활동 기록), 내 정보·비밀번호 찾기·탈퇴, 약관, Supabase 저장소, 실제 YouTube 트렌드 조회.
> Supabase 를 연결하지 않으면 **데모 모드**(로그인 없이 데모 관리자, 메모리 저장)로 바로 실행됩니다.
> 배포 주소: https://work-auto-blush.vercel.app

---

## 빠른 시작

```bash
cd work_auto
npm install
npm run dev
# → http://localhost:3000
```

| 명령 | 설명 |
|------|------|
| `npm run dev` | 개발 서버 |
| `npm run build` / `npm start` | 프로덕션 빌드 / 실행 |
| `npm run lint` | ESLint |
| `npm run typecheck` | 라우트 타입 생성 + `tsc --noEmit` |

환경변수(선택): `.env.local.example`을 `.env.local`로 복사합니다. 기본값으로도 실행됩니다.

| 변수 | 기본 | 설명 |
|------|------|------|
| `PROVIDER_MODE` | `mock` | `live`면 API 연결 센터에서 연결한 Provider가 실제 API를 호출합니다 |
| `ENCRYPTION_KEY` | (개발용 키) | API Key 암호화 키. **운영 환경에서는 필수**입니다 |
| `OPENAI_MODEL` | `gpt-4o-mini` | live 모드의 OpenAI 모델 |
| `MOCK_LATENCY_MS` | `700` | Mock 응답 지연 (로딩 화면 확인용) |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (없음) | 설정하면 로그인 + DB 모드. 방법: [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) |
| `DEMO_ROLE` | (없음) | 데모 모드에서 등급별 화면 미리보기 (`silver` 등) |

> 데모 모드의 데이터는 서버 메모리에 있어 재시작하면 Seed 데이터로 초기화됩니다. Supabase 모드에서는 DB 에 저장됩니다.

## 둘러보기 (5분 데모)

1. **메인** `/` → 채널 카드 4개 (YouTube, NAVER 클립, NAVER 블로그, 공통 도구)
2. **공통 도구 → 제품 상세페이지 학습**: 예시 URL 입력 → [상세페이지 분석하기] → [제품 라이브러리에 저장]
3. **제품 라이브러리** → 제품 카드 [콘텐츠 만들기] → "NAVER 블로그 제품 글"
4. 메인 키워드 입력 → [블로그 글 생성하기] → "이번 생성에 사용된 학습 데이터"와 정직성 안내 확인 → [별로예요] 사유 입력
5. 같은 기능에서 다시 생성 → 피드백이 Context에 들어간 것을 확인 (**AI 학습 관리**에서도 확인)
6. **YouTube → 트렌드 찾기** → 기간·Shorts 필터 → 행의 ↗로 정보성 영상 만들기
7. **설정 → API 연결 센터** → `sk-test-1234567890` 연결 → [테스트] (화면에는 마스킹된 값만 표시)

## 서비스 구조: Channel → Feature → Tool

```
메인 (채널 선택)
├── YouTube        트렌드 찾기 · 제품 홍보 영상 · 정보성 영상
├── NAVER 클립     네이버 트렌드 소재 · 제품 홍보 클립 · 정보성 클립
├── NAVER 블로그     트렌드·키워드 · 제품 글 · 정보·트렌드 글 · 자동 글쓰기
├── 공통 도구      제품 상세페이지 학습 · 제품 라이브러리 · 영상 URL 가져오기
├── AI 학습 관리   제품 / 스타일 / 히스토리 / 피드백 / 성과
├── 설정           API 연결 센터
├── 내 정보        이름·비밀번호 변경, 회원 탈퇴
└── 사이트 관리    가입 승인 · 사용자 관리 · 권한 관리 · 활동 기록 (관리자에게만 보임)
```

## 어디를 보면 되나

| 알고 싶은 것 | 문서 |
|-------------|------|
| 왜, 누구를 위해, 무엇을 만드는가 | [docs/PRD.md](docs/PRD.md) |
| 전체 구조, 데이터 흐름, 폴더 | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| **모든 기능 한눈에 보기** | [docs/FEATURE_REGISTRY.md](docs/FEATURE_REGISTRY.md) |
| 화면 경로, API 경로 | [docs/ROUTES.md](docs/ROUTES.md) |
| 디자인 규칙 (다른 프로젝트에도 재사용) | [docs/DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md) |
| 데이터 모델, DB 설계 | [docs/DATA_MODEL.md](docs/DATA_MODEL.md) |
| **Supabase 연결 방법 (DB + 로그인)** | [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) |
| 로그인, 역할, 등급 권한 구조 | [docs/AUTH_AND_PERMISSIONS.md](docs/AUTH_AND_PERMISSIONS.md) |
| OpenAI, YouTube, NAVER 연동과 키 보안, Claude/Gemini 추가 | [docs/API_PROVIDER_SPEC.md](docs/API_PROVIDER_SPEC.md) |
| AI 학습(Memory + Context Injection) 설계 | [docs/AI_LEARNING_SYSTEM.md](docs/AI_LEARNING_SYSTEM.md) |
| **이어서 개발하는 방법, 금지 사항** | [docs/DEVELOPMENT_GUIDE.md](docs/DEVELOPMENT_GUIDE.md) |
| 현재 상태와 다음 순서 | [docs/NEXT_STEPS.md](docs/NEXT_STEPS.md) |
| 변경 이력 | [docs/CHANGELOG.md](docs/CHANGELOG.md) |

## 폴더 한눈에 보기

```
app/(app)            로그인 후 화면 (사이드바)
app/(auth)/          로그인 · 회원가입 · 승인 대기 · 비밀번호 찾기/재설정
app/(legal)/         이용약관 · 개인정보처리방침 (운영자 정보: lib/legal.ts)
app/api              Route Handler
proxy.ts             세션 갱신 + 비로그인 시 로그인 화면으로
supabase/schema.sql  DB 테이블 · RLS · 가입 트리거
components/ui        원자 컴포넌트 (Button, DataTable, Tabs, States …)
components/layout    AppShell, AppSidebar, PageHeader
components/shared    FeatureCard, ProductCard, ResultPanel, ApiConnectionCard …
features/            기능별 화면 로직 (content-generator, youtube-trends, product-learning …)
lib/registry         ★ Feature Registry: 메뉴, 카드, 헤더의 단일 기준
lib/generators       ★ Generator Config: 생성 기능의 입력·출력 스키마
lib/types            Entity 타입
lib/server/providers ★ Provider Pattern: AI, 트렌드, 상품 수집 (Mock / 실제)
lib/server/ai        ★ AI Memory: ContextBuilder, 버전 관리 프롬프트
lib/server/services  유스케이스
lib/server/repositories  저장소 (V1 인메모리 → V2 Supabase)
docs/                설계 문서
```

## 재사용 가능한 패턴

이 프로젝트는 비슷한 "채널 × 자동화 기능 × AI 생성" 서비스를 만들 때 참고하는 기준 프로젝트입니다.

- **Feature Registry**: 기능을 데이터로 정의하면 메뉴, 카드, 헤더가 자동으로 만들어집니다 → ARCHITECTURE 4.1
- **Channel → Feature → Tool 3단계 구조** → PRD 5장
- **Generator Config + ContentGenerator**: 생성 기능은 설정만 추가합니다 → DEVELOPMENT_GUIDE 5장
- **Provider Pattern + Mock 우선**: 외부 API 없이 전체 UX를 완성합니다 → API_PROVIDER_SPEC
- **AI Memory 구조**: 저장, Context 주입, 버전, 피드백 순환 → AI_LEARNING_SYSTEM
- **Product Library 구조**: Collector와 Analyzer를 분리하고, 한 번 분석해 계속 재사용합니다 → ARCHITECTURE 5.1
- **Design System**: 흰색 기반 업무용 SaaS 토큰과 컴포넌트 → DESIGN_SYSTEM

## 기술 스택

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Supabase (Auth + Postgres) · lucide-react · Pretendard
