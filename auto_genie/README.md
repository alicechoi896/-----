# jini-ai-marketing-brain (auto_genie)

기업 데이터를 학습해 마케팅 전략을 판단하는 AI 마케팅 운영체계. 소상공인·중소기업의 상품/고객/콘텐츠/성과 데이터를 구조화하고, AI가 전략을 비교·추천하며, 하나의 전략을 여러 플랫폼 콘텐츠로 변환하고, 성과 피드백을 다음 추천에 반영하는 전주기 마케팅 AI SaaS 프로토타입입니다.

## 기술 스택

- **프론트엔드**: Next.js 16 (App Router, Turbopack), TypeScript strict, Tailwind CSS v4, shadcn/ui (radix-ui), Lucide Icons, Recharts, @xyflow/react + dagre
- **백엔드**: Next.js Route Handlers / Server Actions, Supabase (PostgreSQL, Auth, Storage), pgvector, Zod, Vercel AI SDK
- **AI**: OpenAI(기본 provider), `generateObject` 기반 구조화 출력, 모델명은 전부 환경변수로 관리 (`lib/ai/provider.ts`가 유일한 provider 진입점 — Anthropic 등으로 교체 시 이 파일만 수정하면 됨)

> Next.js 16 참고: `middleware.ts`가 `proxy.ts`(함수명 `proxy`)로 개명되었고, `params`/`searchParams`는 항상 `Promise`입니다. 이 저장소는 이미 그 규칙을 따릅니다.

## 폴더 구조 요약

```
app/
  (app)/                 로그인 후 사이드바 레이아웃 (대시보드, 학습센터, 브레인, 전략, 오케스트레이터, 워크플로우, 성과, 기술리포트, 설정)
  login/, onboarding/, setup/   인증 및 초기 설정 화면
lib/
  ai/          provider 추상화, Zod 구조화 출력 스키마, 지식추출/전략생성/콘텐츠생성/성과분석 AI 호출
  ingestion/   URL(SSRF 가드+Readability)/파일(pdf-parse, mammoth)/청크 분할
  pipeline/    데이터 소스 분석 파이프라인 오케스트레이션
  strategy/    전략 점수 계산식 + 선호 가중치 학습 (순수 함수, 단위테스트 있음)
  performance/ 성과 비율/점수 계산식 (순수 함수, 단위테스트 있음)
  supabase/    client / server / admin 클라이언트
supabase/migrations/   전체 스키마, RLS, pgvector 검색 함수, storage 버킷 (순서대로 적용)
scripts/seed.ts        "인더업 시연 워크스페이스" 데모 데이터 시드 스크립트
tests/unit, tests/integration, tests/e2e
```

## 환경변수

`.env.example`을 `.env.local`로 복사한 뒤 값을 채웁니다.

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

OPENAI_API_KEY=
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small

NEXT_PUBLIC_APP_URL=http://localhost:3000

# 개발용 데모 로그인 버튼 계정 (프로덕션에서는 버튼 자체가 노출되지 않음)
DEMO_USER_EMAIL=demo@intheup.example
DEMO_USER_PASSWORD=demo-password-1234
```

Supabase 또는 OpenAI 환경변수가 없으면 앱은 오류 화면 대신 `/setup` 안내 화면을 보여줍니다. 실제 AI 결과는 절대 가짜로 생성하지 않습니다.

## 설치 및 실행

```bash
pnpm install

# Supabase 프로젝트 연결 (최초 1회)
pnpm dlx supabase login
pnpm dlx supabase link --project-ref <your-project-ref>

# 마이그레이션 적용 (테이블, RLS, pgvector 함수, storage 버킷)
pnpm dlx supabase db push

# 데모 데이터 시드 (인더업 시연 워크스페이스 + 데모 로그인 계정)
pnpm seed

# 개발 서버
pnpm dev
```

http://localhost:3000 접속 → Supabase/OpenAI 설정이 없으면 `/setup`으로 자동 이동합니다. 설정 후에는 이메일 회원가입으로 워크스페이스를 새로 만들거나(`/onboarding`), 개발 환경에서 로그인 화면의 "개발용 데모 로그인" 버튼으로 시드된 인더업 워크스페이스에 바로 들어갈 수 있습니다.

## 검증 명령

```bash
pnpm lint        # eslint (eslint-config-next core-web-vitals + typescript)
pnpm typecheck   # tsc --noEmit
pnpm test        # vitest — 단위 테스트 + 통합 테스트 (AI/Supabase는 provider mock 사용, 외부 호출 없음)
pnpm build       # next build (Turbopack)
pnpm e2e         # Playwright E2E — 실행 중인 dev 서버 + 실제 Supabase/OpenAI 설정 필요 (별도 실행, pnpm test에는 포함 안 됨)
```

네 명령 모두 이 저장소에서 통과합니다(`pnpm e2e`는 라이브 Supabase 프로젝트가 필요해 이 세션에서는 코드만 작성하고 실행하지 않았습니다).

## 데이터베이스

`supabase/migrations/`에 순서대로 적용되는 6개 마이그레이션:

1. `20260803120000_schema.sql` — 19개 테이블(organizations ~ audit_logs), 인덱스, `updated_at` 트리거, pgvector 확장, ivfflat 벡터 인덱스
2. `20260803120100_rls.sql` — 모든 조직 스코프 테이블에 RLS 정책 (조직 멤버만 조회/쓰기, `organization_members`는 owner만 초대/변경)
3. `20260803120200_functions.sql` — `create_organization()` RPC(조직+owner 멤버십 원자적 생성), `match_document_chunks()` 벡터 유사도 검색 함수
4. `20260803120300_dedupe_constraints.sql` — 지식 개체/규칙 재분석 시 중복 대신 upsert되도록 하는 유니크 인덱스
5. `20260803120400_storage.sql` — 업로드 파일용 private storage 버킷 + RLS
6. `20260803120500_campaign_extra_fields.sql` — 캠페인 설정 폼의 "현재 문제"/"추가 조건" 컬럼

## 실제로 동작하는 핵심 흐름

1. **데이터 등록** (`/learning`): URL(SSRF 가드된 서버사이드 fetch + Readability 본문 추출) / 텍스트 직접 입력 / 파일(PDF·DOCX·TXT·Markdown, 10MB 제한, Supabase Storage 업로드) 중 하나로 등록
2. **AI 분석 파이프라인**: 본문 추출 → 정제/정규화 → 의미 단위 분할(800~1200 토큰, ~100 토큰 중첩) → OpenAI 임베딩 생성 및 pgvector 저장 → 지식 개체/관계/의사결정 규칙 추출(Zod 스키마 검증, 실패 시 1회 자동 재요청) → 브랜드 프로필 반영. 각 단계가 `processing_jobs`/`data_sources`에 실시간 기록되고 `/learning`의 xyflow 파이프라인 뷰에서 확인 가능
3. **마케팅 브레인** (`/brain`): 기업 DNA, 고객 문제지도, 전문가 사고지도(IF-THEN-BECAUSE), 지식그래프(xyflow+dagre), 의사결정 규칙을 실제 DB 데이터로 렌더링. 근거 보기 drawer에서 원문 청크·자료명·등록일·신뢰도 확인. 사용자 수정은 `learning_events`+`audit_logs`에 수정 전/후 값과 함께 기록
4. **전략 시뮬레이터** (`/strategy`): 캠페인 조건으로 벡터 검색 → 활성 의사결정 규칙 조회 → AI가 3~5개 전략 후보 생성(featureScores만 AI가 채점) → **서버가 결정론적으로** `finalScore = base*0.5 + preference*0.25 + evidence*0.25` 계산(`lib/strategy/scoring.ts`, 단위테스트 있음) → 레이더 차트 비교 → 선택 시 이유를 받아 선호 가중치를 학습률 0.05·범위 0.5~1.5로 조정 (`learning_events`에 전후값 기록)
5. **콘텐츠 오케스트레이터** (`/orchestrator`): 선택된 전략 하나로 6개 플랫폼(네이버 블로그/인스타그램/스레드/유튜브 쇼츠/뉴스레터/랜딩페이지) 콘텐츠를 동시에 AI 생성. 수정 시 원본/수정본/변경량이 `learning_events`에 기록되고, 재생성 시 이전 버전이 `generation_metadata.versions`에 보존됨
6. **성과 학습센터** (`/performance`): 콘텐츠별 성과 입력 → 0으로 나누기 없는 비율 계산 → 캠페인 목표별 가중치 프리셋으로 정규화된 성과 점수 산출(`lib/performance/scoring.ts`, 단위테스트 있음) → AI가 원인 분석 → 전략의 지배적 feature 차원에 대해 선호 가중치를 최대 ±0.05만 조정
7. **AI 기술 리포트** (`/technology`): 실제 DB 수치(데이터 소스 수, 벡터 청크 수, 지식 개체/관계 수, 의사결정 규칙 수, 누적 전략/학습 이벤트 수)와 현재 사용 중인 모델명을 표시. 구현 완료/시제품 구현/연동 예정/장기 개발 과제를 명확히 구분

## 시연용 데이터

`pnpm seed`로 "인더업 시연 워크스페이스"(주식회사 인더업)를 생성합니다. 모든 seed 데이터는 예시 데이터임을 UI에서 배지로 표시하며, 실제 AI 분석 결과와 혼동되지 않도록 구분됩니다. 데모 로그인은 `NODE_ENV !== "production"`에서만 노출됩니다.

## 현재 구현된 기능

- URL 본문 추출 / 문서(PDF·DOCX·TXT·MD) 텍스트 추출
- 의미 단위 청크 분할 + OpenAI 임베딩 + pgvector 유사도 검색
- 기업 지식 추출(개체/관계/의사결정 규칙/브랜드 프로필), 근거 추적
- 전략 4안 생성 + 결정론적 점수 계산 + 선호 학습(선형 가중치 조정, 딥러닝 아님)
- 플랫폼별 콘텐츠 동시 생성 + 수정 이력 추적
- 성과 입력 → 정규화된 점수 계산 → AI 원인 분석 → 가중치 피드백
- 멀티테넌트(조직) + RLS + 감사 로그

## 연동 예정 / 장기 과제 (허위로 "구현 완료" 표시하지 않음)

- **외부 채널 자동 발행**: 연동 예정 — `/workflow`에 명확히 "연동 예정"으로 표시됨
- **자체 파운데이션 모델 학습**: 장기 개발 과제 — 이 서비스는 OpenAI API를 호출할 뿐 자체 모델을 학습하지 않으며, "선호 학습"은 단순 선형 가중치 조정입니다

## Vercel 배포

1. GitHub에 push 후 Vercel에서 저장소 import
2. 위 환경변수를 Vercel 프로젝트 설정에 등록 (`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`는 반드시 서버 전용으로만 등록되며 클라이언트에 노출되지 않음)
3. `pnpm dlx supabase db push`로 프로덕션 Supabase 프로젝트에 동일 마이그레이션 적용
4. 배포 후 필요 시 `pnpm seed`를 로컬에서 프로덕션 `.env` 값으로 1회 실행해 데모 워크스페이스 생성
