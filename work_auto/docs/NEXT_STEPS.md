# NEXT STEPS: 현재 상태와 다음 개발 순서

> 기준일: 2026-10-02 (v0.3.0)

## 1. 현재 구현 상태

| 영역 | 상태 | 비고 |
|------|------|------|
| 화면 / UI / 디자인 시스템 | ✅ 완료 | 23개 경로, 공통 컴포넌트 UI 28 + 레이아웃 5 + 공용 9 |
| 라우팅 / Registry | ✅ 완료 | 기능 추가 = Registry 한 줄 |
| 생성형 기능 7개 (흐름) | ✅ 완료 (Mock AI) | 입력 검증 → Context → Prompt → AI → 저장 → 피드백 |
| AI Memory (Context Injection) | ✅ 완료 (규칙 기반) | 제품, 스타일, 예시, 피드백, 성과, 트렌드 |
| 프롬프트 버전 관리 | ✅ 코드 기반 | 결과에 version 저장 |
| 정직성 가드레일 | ✅ 완료 | 프롬프트 + 생성 후 검사 + 고지 문구 |
| 제품 학습 파이프라인 | ✅ 구조 완료 | 텍스트 수집은 실제 동작, URL·이미지는 Mock |
| API 연결 센터 / 암호화 | ✅ 완료 | 서버 AES-256-GCM, 마스킹 |
| OpenAI 실제 호출 | 🟡 코드 완료, 미검증 | `PROVIDER_MODE=live` + 키 연결 후 검증 필요 |
| YouTube 실제 조회 | ✅ 구현 (실키 검증 대기) | 트렌드 + 영상 메타데이터. `PROVIDER_MODE=live` + 키 연결 시 동작 |
| NAVER 실제 조회 | ✅ v0.7.0 | 데이터랩·블로그 검색·검색광고 API (live + 키 연결 시) |
| 영구 저장소 (Supabase) | ✅ 구현 (연결 대기) | `docs/SUPABASE_SETUP.md` 대로 연결하면 동작. 미연결 시 데모 모드 |
| 로그인 / 역할 / 권한 | ✅ 구현 | 관리자·실버·골드·VIP, 사이트 관리(가입 승인·사용자·권한·활동 기록) |
| 계정 기능 | ✅ 구현 | 내 정보(이름·비밀번호), 비밀번호 찾기, 회원 탈퇴 |
| 약관 | ✅ 초안 | 이용약관·개인정보처리방침. `lib/legal.ts` 운영자 정보 입력 + 법률 검토 필요 |
| 성과 자동 수집 | 🔴 미구현 | Mock / 수동 |
| 일반 설정 | ⏳ planned | 카드만 노출 |

## 2. 아직 Mock인 기능

- AI 생성 전체 (MockAIProvider: 입력과 Context를 반영한 결정적 템플릿 문장)
- 제품 분석 (카탈로그 제품은 준비된 분석, 그 외는 규칙 기반 요약)
- URL 상세페이지 수집, 이미지 OCR
- YouTube 트렌드, 영상 메타데이터 (키를 연결하고 live 모드면 실제 데이터)
- NAVER 트렌드 (검색 추이, 급상승, 시즌, 관련 키워드, 아이디어)
- 성과 데이터
- API 연결 테스트 (Mock 모드에서는 저장·복호화만 확인)

## 3. 다음 개발 순서 (추천)

### 상품 URL 학습 후속 (v0.9.36 이후)
- 실제 Bright Data 토큰으로 쿠팡·스마트스토어 1건씩 학습 → 응답 필드 확인 후 `normalizeBrightDataRecord` 보정
- 쿠팡 상세 이미지가 부족하면 (A) Image Scraper (B) Scraper Studio 맞춤 1개 (C) 그대로 — 비용·품질 비교 후 결정 (승인 전 두 번째 Scraper 호출 없음)

### 영상 소싱 후속 (v0.9.30 이후)
- 실제 TikHub 키로 샤오홍슈·도우인 첫 검색 → 응답 구조 확인 후 `xiaohongshu/parse.ts`·`douyin/parse.ts` 보정
- 도우인 영상·썸네일 CDN 이 브라우저를 막으면(CORS·핫링크) 서버 프록시 검토 (지금은 [새 탭에서 열기])
- 영상이 많아지면 `GET /api/videos?productId=` 를 SQL where 전용 메서드로
- (완료 v0.9.31) 품질 1단계: 대본 뼈대 규칙, 정밀 생성 — docs/QUALITY_MODES.md
- (완료 v0.9.40) 2단계 생성(제목 먼저 → 제목별 대본) · Keyword Intelligence — docs/TWO_STAGE_CONTENT_GENERATION.md, docs/KEYWORD_INTELLIGENCE.md
  - 다음: 실제 YouTube·NAVER 키로 후보 품질 확인, 데이터랩 키워드 그룹 확장 여부 검토
- (완료 v0.9.34) 품질 2단계: 아웃라이어 점수, 학습 상위 3·하위 3 비교, 프롬프트 버전별 성과표 — docs/OUTLIER_SCORE.md, docs/PROMPT_STATS.md
- (완료 v0.9.37) 품질 3단계: content_profiles.audience, script_formats.bad_examples + Hook·CTA·제목 패턴을 대본 포맷으로 (Supabase 에서 schema.sql 재실행 필요)
- 품질 4단계: YouTube Analytics OAuth (클라이언트 ID·보안 비밀번호, 동의 화면 테스트 사용자) → 시청 지속률·이탈 지점

### 학습 루프 후속 (v0.9.18 이후)
- 학습 프로필 버전별 👍 비율·수정량·업로드율 집계 화면 (기존 데이터로 계산)
- 성과 데이터 입력(현재 수동·데모) → 업로드 URL 로 조회수 자동 수집
- 충분히 쌓이면 Fine-tuning 검토 (docs/INCREMENTAL_LEARNING.md 9장 기준)

### Step 1. Supabase 연결 + 실제 YouTube 확인 (사용자 작업 필요)
- `docs/SUPABASE_SETUP.md` 1~7단계 → 첫 관리자 지정 → YouTube 키 연결 → 트렌드 화면 확인
- (코드 작업 완료: 저장소, 로그인, 역할, 권한, YouTube Provider)

### Step 1-1. 운영 보완 (Supabase 연결 후)
- `lib/legal.ts` 의 운영자 정보([대괄호]) 채우기 + 약관 법률 검토
- 메일 발송 서비스(SMTP) 연결 — 사용자가 늘면 (Supabase 기본 메일은 시간당 한도)
- 가입 승인 대기 알림 (관리자에게 메일 또는 사이드바 숫자 배지)
- 데이터가 많아지면 `list(filter)` 를 SQL 조건 조회로 승격 (DEVELOPMENT_GUIDE 7장)
- (사용량 제한은 두지 않기로 결정: 회원 본인 API 키 사용)

### Step 2. OpenAI 실제 연동 검증
- `PROVIDER_MODE=live`, `ENCRYPTION_KEY` 설정 → API 연결 센터에서 키 연결 → 생성 7종과 제품 분석 실행
- 출력 JSON 형식이 어긋나는 경우 정규화 로직 보강, 필요하면 JSON Schema(Structured Outputs)로 전환
- 사용량(토큰)을 `GeneratedContent`에 저장하고, 사용자별 일일 상한을 둔다
- 프롬프트를 실제 결과에 맞춰 다듬는다 → version 1.1.0

### Step 3. 제품 수집 실제화
- 이미지: Vision 모델로 상세 이미지 → 텍스트 (`VisionImageCollector`, AIProvider 사용)
- URL: 스마트스토어 → 쿠팡 순서로 서버 측 수집기를 만든다 (약관 확인, 실패 시 이미지·텍스트 입력 안내)
- 재분석 기능 (원문 보존 → 분석 version 증가)

### Step 4. YouTube 고도화
- ✅ `searchTrends` / `getVideoMeta` 구현 완료 (서버 메모리 6시간 캐시)
- 남은 것: 캐시를 DB(`trend_snapshots`)로 옮겨 서버 인스턴스끼리 공유, 카테고리를 YouTube videoCategoryId 와 매핑
- API 키 정책 결정: 사용자별 키(현재) vs 관리자 공용 키 + 등급별 사용량 한도

### Step 5. NAVER API 연동
- ✅ 데이터랩(검색 추이·급상승·시즌), 블로그 검색(문서 수), 검색광고 API(검색량·연관 키워드) — v0.7.0
- ✅ 콘텐츠 프로필로 조사 범위 자동 적용 (docs/CONTENT_PROFILE.md)
- 남은 것: 쇼핑인사이트(카테고리별 클릭 추이), 글감 아이디어를 AI 로 고도화(선택, 버튼형), 캐시를 DB 로 옮기기

### Step 5.5 미디어 (v0.8.0 완료)
- ✅ 블로그 제품 사진 (브라우저 처리, [사진n] 배치, ZIP)
- ✅ 영상 음성 제거 (ffmpeg.wasm)
- 남은 것: NAVER 블로그 에디터에 사진까지 한 번에 붙여넣기 (공식 글쓰기 API 없음 → 현재는 ZIP 순서대로 올리기), 사진 워터마크·밝기 보정 옵션

### Step 6. AI Memory 고도화
- 결과 섹션별 편집기 + 수정본 저장 (`content_revisions`)
- 좋은 결과, 수정본 임베딩 → 의미 검색 RAG (pgvector)
- 피드백 통계 화면 (기능별·프롬프트 버전별 좋아요 비율)
- 평가 세트로 프롬프트 변경 회귀 테스트

### Step 7. 성과 데이터 연동
- YouTube Analytics API (OAuth 필요), 블로그 통계, 판매 데이터 (쿠팡 파트너스 리포트 등)
- 콘텐츠 ↔ 게시 URL 연결 UI → 자동 수집 배치

### Step 8. 운영 기능
- 일반 설정 (기본 채널, 기본 AI, 생성 기본값), ContentProject UI
- Claude / Gemini Provider 추가 (API_PROVIDER_SPEC 8장)
- 암호화 키 회전, 감사 로그, 오류 모니터링
- 테스트: 서비스 단위 테스트(Vitest), 주요 흐름 E2E(Playwright)

### 이후 후보 기능 (Registry에 planned로 먼저 추가)
- YouTube: 썸네일 문구, 쇼츠 자막 분할, 댓글 분석
- Clip: 장면 구성표(콘티), 자막 파일 생성
- Blog: 이미지 배치 가이드, 상위 노출 글 구조 분석, 발행 일정
- 공통: 무음 제거 + 자막(V1 제외 항목), 일괄 생성(여러 제품 × 채널), 결과 내보내기(Docs, txt)
- 신규 채널: Instagram Reels, TikTok, Threads
