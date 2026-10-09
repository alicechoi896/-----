# ROUTES: 화면과 API 경로

> 페이지 메타(제목, 설명, 상태)는 `lib/registry`에서 가져온다. 경로를 바꾸면 Registry의 `href`와 이 문서를 함께 고친다.

## 1. 구조 원칙: Channel → Feature → Tool

```
/                         1차: 채널 선택
/{channel}                2차: 채널 허브 (기능 카드 목록)
/{channel}/{feature}      3차: 기능 실행 화면
```

### 요청 구조에서 바꾼 점과 이유

| 변경 | 이유 |
|------|------|
| `/tools/product-library/[productId]` 추가 | 제품 상세 화면이 필요하다. 수정은 별도 경로 대신 `?mode=edit`로 같은 화면에서 연다 (보던 정보를 유지한 채 수정) |
| `/settings`를 허브로 사용 | `/settings`도 채널 허브와 같은 `ChannelHub`로 만든다. "일반 설정"은 `planned` 카드로 미리 보여준다 |
| 동적 `[channel]/[feature]` 대신 **명시적 폴더** | 각 기능 화면의 UI가 서로 다르고, 폴더가 있으면 검색과 이해가 쉽다. 메뉴, 카드, 헤더는 Registry에서 자동으로 만들어지므로 중복이 없다 |
| 생성 화면은 쿼리를 초기값으로 받는다 | `?productId=`, `?trendId=`, `?topic=`처럼 **폼 필드 이름과 같은 쿼리**를 초기값으로 받아, 다른 화면에서 문맥을 그대로 넘길 수 있다 |

## 2. 페이지 목록

> 로그인 후 화면은 모두 `app/(app)/` 폴더에 있다 (괄호 폴더는 URL에 나타나지 않는 그룹). 사용자마다 메뉴와 권한이 달라서 모든 화면을 요청할 때마다 렌더링한다(Dynamic).
> "권한" 열의 키가 권한 관리 표의 한 줄이다. 기본 등급은 [AUTH_AND_PERMISSIONS.md](./AUTH_AND_PERMISSIONS.md)를 본다.

| Route | 화면 | 역할 | 주요 컴포넌트 | 렌더링 |
|-------|------|------|---------------|--------|
| `/login` | 로그인 / 회원가입 | 이메일 + 비밀번호. 데모 모드에서는 안내만 표시 | LoginForm, server actions | Dynamic |
| `/auth/callback` | (화면 없음) | 인증·재설정 메일 링크 처리 → 홈 또는 `next` | route.ts | - |
| `/pending` | 승인 대기 | 승인 전·거절된 사용자 안내, 로그아웃, 가입 취소 | WithdrawForm | Dynamic |
| `/forgot-password` | 비밀번호 찾기 | 재설정 링크 메일 발송 | ForgotPasswordForm | Dynamic |
| `/reset-password` | 비밀번호 재설정 | 메일 링크로 들어와 새 비밀번호 저장 | ResetPasswordForm | Dynamic |
| `/terms` | 이용약관 | 로그인 없이 공개 | LegalDocument | Static |
| `/privacy` | 개인정보처리방침 | 로그인 없이 공개 | LegalDocument | Static |
| `/account` | 내 정보 | 이름·비밀번호 변경, 회원 탈퇴 | AccountSettings | Dynamic |
| `/admin/approvals` | 가입 승인 | 승인 대기·거절 목록, 등급 선택 승인 | ApprovalQueue | Dynamic |
| `/admin/audit-logs` | 활동 기록 | 주요 활동 이력 (관리자) | AuditLogView | Dynamic |
| `/admin/errors` | 오류 기록 | 서버·화면 오류 모아 보기 (관리자) | ErrorLogView | Dynamic |
| `/admin` | 사이트 관리 | 관리자 전용 허브 | ChannelHub | Dynamic |
| `/admin/users` | 사용자 관리 | 사용자 목록, 역할 변경 | UserManagement | Dynamic |
| `/admin/permissions` | 권한 관리 | 등급 × 메뉴 체크 표 | PermissionMatrix | Dynamic |
| `/` | 자동화 지니 | 채널 카드 4개 + 최근 생성·제품·API 상태 요약 | ChannelCard, HomeOverview | Dynamic |
| `/youtube` | YouTube 자동화 | 기능 카드 3개 | ChannelHub | Dynamic |
| `/youtube/trends` | YouTube 트렌드 찾기 | 검색 조건(저장·기본) → 추천 키워드·주제 → 정렬 가능한 표 + 더 불러오기 → 상세 패널(AI 분석) | YouTubeTrendExplorer | Dynamic |
| `/youtube/product-video` | 제품 홍보 영상 만들기 | 제품·트렌드로 원고 생성 | ContentGenerator | Dynamic |
| `/youtube/info-video` | 정보성 영상 만들기 | 주제·트렌드로 원고 생성 | ContentGenerator | Dynamic |
| `/naver-clip` | NAVER 클립 자동화 | 기능 카드 3개 | ChannelHub | Dynamic |
| `/naver-clip/trends` | 네이버 트렌드 소재 찾기 | 급상승 주제·키워드, 시즌·관련 키워드 | NaverTrendExplorer `scope="clip"` | Dynamic |
| `/naver-clip/product-content` | 제품 홍보 클립 만들기 | 클립 원고 생성 | ContentGenerator | Dynamic |
| `/naver-clip/info-content` | 정보성 클립 만들기 | 클립 원고 생성 | ContentGenerator | Dynamic |
| `/naver-blog` | NAVER 블로그 자동화 | 기능 카드 4개 | ChannelHub | Dynamic |
| `/naver-blog/trends` | 네이버 트렌드·키워드 찾기 | 검색 추이 차트, 관련 검색어, 아이디어 | NaverTrendExplorer `scope="blog"` | Dynamic |
| `/naver-blog/product-writing` | 제품 블로그 글 만들기 | 제품 글 생성 (정직성 가드레일) | ContentGenerator | Dynamic |
| `/naver-blog/info-writing` | 정보·트렌드 글 만들기 | 정보 글 생성 | ContentGenerator | Dynamic |
| `/naver-blog/auto-writing` | 자동 글쓰기 | 최소 입력으로 전체 글 생성 | ContentGenerator | Dynamic |
| `/tools` | 공통 도구 | 기능 카드 3개 | ChannelHub | Dynamic |
| `/tools/product-learning` | 제품 상세페이지 학습 | URL/이미지/텍스트 → 분석 → 저장 | ProductLearningWorkspace | Dynamic |
| `/tools/product-library` | 제품 라이브러리 | 카드/목록, 검색, 삭제, 콘텐츠 만들기 | ProductLibrary | Dynamic |
| `/tools/product-library/[productId]` | 제품 상세 | 전체 분석·원본·생성 이력, `?mode=edit` 수정 | ProductDetailView | Dynamic |
| `/tools/video-import` | 영상 URL 가져오기 | URL 여러 개 저장(샤오홍슈·도우인·YouTube) + 영상 검색 + 소리 없는 영상 다운로드 | VideoImport | Dynamic |
| POST | `/api/memory/delete` { kind, ids[] } | AI 학습 관리 체크 삭제 (contents·products·feedback·performance) | memoryService.deleteMany |
| PATCH | `/api/videos/:id` { productId } | 영상의 연관 제품 바꾸기 | videoService.setProduct |
| POST | `/api/videos/resolve` { url } | 샤오홍슈 노트·도우인 영상의 재생 주소 (주소만, 파일은 브라우저가 직접 받음) | resolveXiaohongshu / resolveDouyin |
| POST | `/api/videos/batch` { urls[], note? } | 여러 영상 한 번에 가져오기 (최대 20개, URL 별 결과) | videoService.importMany |
| `/ai-learning` | AI 학습 관리 | 5개 Memory 탭 | AiLearningCenter | Dynamic |
| `/manual` | 사용 매뉴얼 | 장별 사용법 + 화면 강조, PDF 다운로드 | ManualView | Dynamic |
| `/manual-print` | 매뉴얼 인쇄용 | PDF 만들기용 (사이드바 없음, scripts/manual/pdf.mjs) | page | Dynamic |
| `/uploads` | 업로드 관리 | 월간 캘린더·날짜 상세·업로드 등록 (`?contentId=` 로 등록 창 열기) | UploadCalendar | Dynamic |
| `/settings` | 설정 | 설정 카드 (API 연결 센터, 일반 설정 준비 중) | ChannelHub | Dynamic |
| `/settings/api` | API 연결 센터 | OpenAI / YouTube / NAVER 연결·테스트 | ApiCenter, ApiConnectionCard | Dynamic |
| (그 외) | 404 | 홈으로 이동 | not-found.tsx | - |

## 3. 화면 이동 관계

```
/ ──▶ /{channel} ──▶ /{channel}/{feature}
│
├─ 사이드바: 모든 채널 + 현재 채널의 하위 기능 + AI 학습 관리 + 설정
│
/tools/product-learning ──[저장]──▶ "저장된 제품 보기" ──▶ /tools/product-library/:id
/tools/product-library ──[상세보기]──▶ /tools/product-library/:id
                       ──[수정]──────▶ /tools/product-library/:id?mode=edit
                       ──[콘텐츠 만들기]──▶ /youtube/product-video?productId=:id
                                         ▶ /naver-clip/product-content?productId=:id
                                         ▶ /naver-blog/product-writing?productId=:id
/youtube/trends ──[↗ 영상 만들기]──▶ /youtube/info-video?trendId=:trendId
/naver-clip/trends ──[클립 만들기]──▶ /naver-clip/info-content?trendId=:trendId
/naver-blog/trends ──[글쓰기]──▶ /naver-blog/info-writing?topic=:아이디어
생성 화면(제품 필드 비어 있음) ──▶ /tools/product-learning
메인 요약 카드 ──▶ /ai-learning, /tools/product-library, /settings/api
```

## 4. API (Route Handler)

모든 응답은 `{ ok: true, data } | { ok: false, error: { code, message } }` 형태다.

| Method | Path | 설명 | Service |
|--------|------|------|---------|
| GET | `/api/trends/youtube?country&categoryId&keyword&publishedFrom&publishedTo&recentDays&format&minSubscribers&maxSubscribers&minViews&maxViews&minComments&pageToken` | YouTube 트렌드 한 페이지 (50개 조회 후 범위 조건으로 거름) | trendService.searchYouTube |
| POST | `/api/trends/youtube/analyze` { video } | 잘된 이유 + 추천 제목 (AI) | youtubeInsightService.analyzeVideo |
| POST | `/api/trends/youtube/topics` { videos, keywords } | 추천 주제 (AI) | youtubeInsightService.suggestTopics |
| GET/POST | `/api/trends/youtube/filters` | 저장한 검색 조건 목록 / 저장 (같은 이름 덮어씀) | savedTrendService |
| PATCH/DELETE | `/api/trends/youtube/filters/:id` | 이름·기본 지정 / 삭제 | savedTrendService |
| GET/POST | `/api/trends/youtube/saved` | 찜 목록 / 찜하기 | savedTrendService |
| DELETE | `/api/trends/youtube/saved/:id` | 찜 해제 | savedTrendService |
| GET | `/api/trends/naver?scope&keyword&period&profileId&category` | NAVER 인사이트 (기간 7일~3년, 프로필 범위, 검색량·문서 수) | trendService.getNaverInsight |
| GET | `/api/trends/options?source=youtube\|naver` | 생성 폼의 트렌드 선택지 | trendService.listOptions |
| GET | `/api/products` | 제품 목록 | productService.list |
| POST | `/api/products` | 분석 결과(Draft) 저장 | productService.save |
| POST | `/api/products/analyze` | Collector → Analyzer (저장 안 함) | productService.analyze |
| GET | `/api/products/:id` | 제품 + 분석 + 원본 | productService.getDetail |
| PATCH | `/api/products/:id` | 제품, 콘텐츠 제작용 데이터 수정 | productService.update |
| DELETE | `/api/products/:id` | 삭제 (분석, 원본 포함) | productService.remove |
| POST | `/api/contents/generate` | **모든 생성 기능의 단일 진입점** | contentGenerationService.generate |
| GET | `/api/contents?featureId&productId` | 생성 이력 | memoryService.listContents |
| PATCH | `/api/contents/:id` | 좋은 결과로 저장 `{isExemplar}` | memoryService.setExemplar |
| GET/POST | `/api/feedback` | 피드백 조회 / 등록 | memoryService |
| GET/POST | `/api/styles` | 스타일 조회 / 생성 | memoryService |
| PUT/PATCH/DELETE | `/api/styles/:id` | 수정 / 기본 지정 / 삭제 | memoryService |
| POST | `/api/contents/describe-photos` { images[{mediaType,data}], productName? } | 블로그 사진 설명 (AI Vision, 512px 미리보기만, 저장 안 함) | photoCaptioner |
| GET/POST | `/api/profiles` | 콘텐츠 프로필 목록 / 만들기 (`{ example: true }` = 가전 콘텐츠 예시) | contentProfileService |
| PUT/PATCH/DELETE | `/api/profiles/:id` | 수정 / 기본 프로필로 설정 / 삭제 | contentProfileService |
| POST | `/api/styles/extract` { text, channelIds } | 참고 자료 → 스타일 초안 (AI, 원문 저장 안 함) | styleExtractor |
| GET / POST | `/api/script-formats` | 대본 포맷 목록 / 만들기 | scriptFormatService |
| PUT / PATCH / DELETE | `/api/script-formats/:id` | 수정 / 기본으로 / 삭제 | scriptFormatService |
| POST | `/api/script-formats/analyze` { examples, contentType } | 참고 대본 → 포맷 가이드라인 (AI, 저장 안 함) | scriptFormatService.analyze |
| POST | `/api/contents/stage1` { featureId, input, clientRequestId } | 2단계 생성 ① 제목·Hook·CTA 후보 + Keyword Intelligence (영상·클립만) | contentGenerationService.stage1 |
| POST | `/api/contents/stage2` { stage1Id, title, hook, cta } | 2단계 생성 ② 고른 제목 1개 → 대본 3편·키워드·태그·설명 (플랫폼 API 0회) | contentGenerationService.stage2 |
| POST | `/api/script-formats/titles` { formatId? \| newFormat, titles } | [대본 포맷에 담기]: 제목칸에만 (기존 포맷에 더하기 / 새 포맷) | scriptFormatService.addTitles |
| POST | `/api/styles/type-examples` { kind, types, tone?, existing? } | 원하는 유형으로 Hook·CTA·제목 패턴 예시 10개 (AI, 저장 안 함) | styleTypeExamples |
| GET | `/api/performance` | 성과 데이터 | memoryService.listPerformance |
| GET | `/api/memory` | Memory 항목별 개수 | memoryService.overview |
| GET | `/api/connections` | 연결 상태 (공개 DTO) | connectionService.list |
| PUT/DELETE | `/api/connections/:provider` | 연결 (암호화 저장) / 해제 | connectionService |
| POST | `/api/connections/:provider/test` | 연결 테스트 | connectionService.test |
| GET/POST | `/api/videos` | 참고 영상 조회 / 가져오기 | videoService |
| POST | `/api/videos/social-search` { keyword, platform, autoTranslate, sort, period, next? } | 샤오홍슈 또는 도우인 검색 = TikHub 1회 (한국어는 AI 1회 변환, 30분 기억, 저장 안 함) | socialSearchService.search |
| POST | `/api/products/learn-url` { url, clientRequestId, force?, productId? } | 상품 URL 학습 시작: 기존 제품이면 existing (외부 0회), 새 상품이면 Bright Data Trigger 1회 | productUrlLearning.start |
| POST | `/api/products/learn-url/status` { jobId, url } | 같은 수집 작업 상태만 (새 Trigger 없음) | productUrlLearning.status |
| POST | `/api/products/analyze-collected` { raw } | 수집한 상품 정보 → AI 분석 (Bright Data 0회) | productUrlLearning.analyze |
| POST | `/api/products/:id/relearn` { draft } | 다시 학습 결과 저장 (분석 버전 +1) | productService.relearn |
| POST | `/api/trends/youtube/outliers` { items: [{ videoId, channelId, views }] } | 아웃라이어 점수 (채널 최근 15개 중앙값 대비, 누를 때만) | youtubeOutlierService.scores |
| GET | `/api/performance/prompts` | 프롬프트 버전별 성과표 | memoryService.promptStats |
| POST | `/api/videos/translate-titles` { items: [{ id, title }] } | 검색 결과 중국어 제목 → 한국어 (한 페이지 묶어 AI 1회, 저장 안 함) | titleTranslateService.translate |
| GET | `/api/videos/page?productId=&offset=` | 기존 참고 영상 30개씩 (제품 id / none / all) | videoService.page |
| DELETE | `/api/videos/:id` | 참고 영상 삭제 | videoService.remove |
| GET | `/api/admin/users` | 사용자 목록 (관리자) | adminService.listUsers |
| PATCH | `/api/admin/users/:userId` | 역할 변경 `{role}` (관리자, 자기 자신 제외) | adminService.updateRole |
| POST | `/api/admin/users/:userId/approve` | 가입 승인 `{role}` | adminService.approve |
| POST | `/api/admin/users/:userId/reject` | 가입 거절 `{reason?}` | adminService.reject |
| GET | `/api/admin/audit-logs` | 활동 기록 (관리자) | adminService.listAuditLogs |
| GET / DELETE | `/api/admin/errors?days` | 오류 기록 조회 / 삭제 `{ids: [...] | "all"}` (관리자) | errorLogService |
| POST | `/api/errors` | 화면 오류 보고 (로그인 사용자, 1분 20회) | errorLogService.capture |
| POST | `/api/publications/:id/views` { views, likes?, comments? } | 업로드의 조회수 직접 입력 → 성과 데이터 (생성 콘텐츠와 연결된 내 업로드만, 학습 신호) | youtubeStatsService.recordManual |
| GET | `/api/publications/stats?ids=` | YouTube 업로드 조회수·좋아요·댓글 (지금 + 1일·7일 후) | youtubeStatsService.stats |
| GET / PATCH | `/api/account` | 내 프로필 / 이름 변경 (승인 전에도 가능) | accountService |
| POST | `/api/account/password` | 비밀번호 변경 `{currentPassword, newPassword}` | accountService.changePassword |
| POST | `/api/account/withdraw` | 회원 탈퇴 `{password}` | accountService.withdraw |
| GET / PUT / DELETE | `/api/admin/permissions` | 권한표 조회 / 한 칸 변경 `{role, permissionKey, allowed}` / 기본값 복원 | adminService |

**API 권한**: 로그인하지 않으면 401, 등급 권한이 없으면 403. 트렌드·제품·생성·연결·영상 API는 해당 기능 권한을 확인한다 (`requireAccess`).

## 영상 자동 제작 (v0.9.51)

| 메서드 | 경로 | 설명 |
|---|---|---|
| GET | `/api/video-production/options?channelId=` | 고를 대본(2단계)·샤오홍슈 영상·자료 상태 |
| POST | `/api/video-production/plan` | 컷 계획 (AI 1회: 화면용 제목) |
| GET/POST | `/api/video-jobs` | 내 작업 목록 / [영상 만들기] (after 렌더) |
| GET | `/api/video-jobs/:id` | 진행·결과 + 미리보기 주소 |
| POST | `/api/video-jobs/:id/rerender` · `/approve` · `/download` | 다시 만들기(클립 교체) · 검수 완료 · 1회 다운로드 |
