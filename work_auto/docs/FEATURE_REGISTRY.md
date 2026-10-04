# FEATURE REGISTRY: 전체 기능 목록

> **이 파일만 봐도 서비스 전체를 파악할 수 있어야 한다.**
> 코드의 단일 기준은 `lib/registry/features.ts`(기능)와 `lib/generators/configs.ts`(생성 폼)이다. 기능을 추가하거나 바꾸면 이 표도 같이 고친다.
> 상태: ✅ live (실제 연동) · 🧪 mock (Mock 데이터로 전체 흐름 동작) · ⏳ planned (준비 중, 카드만 노출)

## 1. 요약

| 채널 | 기능 수 | live | mock | planned |
|------|--------|------|------|---------|
| YouTube | 3 | 1 | 2 | 0 |
| NAVER 클립 | 3 | 0 | 3 | 0 |
| NAVER 블로그 | 4 | 0 | 4 | 0 |
| 공통 도구 | 3 | 1 | 2 | 0 |
| 설정 | 2 | 1 | 0 | 1 |
| 사이트 관리 (관리자 전용) | 5 | 5 | 0 | 0 |
| (단독) AI 학습 관리 | 1 | 0 | 1 | 0 |
| **합계** | **21** | 8 | 12 | 1 |

## 2. 전체 기능 표

| 채널 | ID | 기능 | Route | 종류 | 상태 | 필요 API | 입력 데이터 | 출력 데이터 | 구현 |
|------|----|------|-------|------|------|----------|-------------|-------------|------|
| YouTube | `yt-trends` | YouTube 트렌드 찾기 | `/youtube/trends` | trend | ✅ | YouTube Data API | 국가, 카테고리, 키워드, 게시일 범위(최근 N일), 구독자·조회수·댓글 범위, Shorts/롱폼, 저장한 조건 | Shorts/롱폼, 키워드·태그, 정렬(Trend Score·조회수·게시일·일평균·댓글), 추천 키워드, AI 추천 주제, 잘된 이유·추천 제목, 찜, 50개씩 더 불러오기 | `features/youtube-trends` |
| YouTube | `yt-product-video` | 제품 홍보 영상 만들기 | `/youtube/product-video` | generator | ✅ | OpenAI | 제품*, 참고 트렌드, 주요 키워드, 영상 길이, 콘텐츠 스타일 | 추천 제목 5개, Hook, 대본, 설명글, 주요 키워드, 해시태그 | ContentGenerator |
| YouTube | `yt-info-video` | 정보성 영상 만들기 | `/youtube/info-video` | generator | ✅ | OpenAI | 카테고리*, 트렌드, 주제, 주요 키워드, 영상 길이 | 추천 주제, 제목(3), Hook, 대본, 설명글, 키워드 | ContentGenerator |
| NAVER 클립 | `clip-trends` | 네이버 트렌드 소재 찾기 | `/naver-clip/trends` | trend | ✅ | NAVER API | 카테고리, 검색어, 최근 기간 | 급상승 주제, 급상승 키워드, 시즌 키워드, 관련 키워드 | `features/naver-trends` (clip) |
| NAVER 클립 | `clip-product-content` | 제품 홍보 클립 만들기 | `/naver-clip/product-content` | generator | ✅ | OpenAI | 제품*, 트렌드, 콘텐츠 스타일, 주요 키워드 | 제목, Hook, 클립 대본, 설명글, 키워드, 해시태그 | ContentGenerator |
| NAVER 클립 | `clip-info-content` | 정보성 클립 만들기 | `/naver-clip/info-content` | generator | ✅ | OpenAI | 카테고리*, 현재 트렌드, 키워드 | 추천 주제, 제목, 대본, 설명글, 키워드 | ContentGenerator |
| NAVER 블로그 | `blog-trends` | 네이버 트렌드·키워드 찾기 | `/naver-blog/trends` | trend | ✅ | NAVER API | 검색어, 카테고리, 최근 기간 | 관련 검색어, 최근 검색 추이(차트), 급상승 키워드, 시즌 키워드, 콘텐츠 아이디어 | `features/naver-trends` (blog) |
| NAVER 블로그 | `blog-product-writing` | 제품 블로그 글 만들기 | `/naver-blog/product-writing` | generator | ✅ | OpenAI | 제품*, 메인 키워드*, 서브 키워드, 글 스타일, 글 길이, **제품 사진(최대 10장, 브라우저 처리)**, 실제 경험(선택) | 제목 후보 5, 전체 본문(+[사진n] 자리 · 사진 미리보기 · ZIP), 소제목, 제품 장점, 정보, CTA, 키워드, 해시태그 | ContentGenerator + PhotoField + 정직성 가드레일 |
| NAVER 블로그 | `blog-info-writing` | 정보·트렌드 글 만들기 | `/naver-blog/info-writing` | generator | ✅ | OpenAI | 글 유형*(일반 정보/트렌드/IT/AI/생활정보), 주제*, 참고 트렌드, 메인 키워드, 글 길이 | 제목 후보 5, 전체 본문, 소제목, 키워드, 해시태그 | ContentGenerator |
| NAVER 블로그 | `blog-auto-writing` | 자동 글쓰기 | `/naver-blog/auto-writing` | generator | ✅ | OpenAI | 주제*, 글 유형, 제품(선택) | 제목 후보 3, 전체 본문, 키워드, 해시태그 | ContentGenerator (Memory 최대 활용) |
| 공통 도구 | `product-learning` | 제품 상세페이지 학습 | `/tools/product-learning` | tool | ✅ | OpenAI (+수집처) | URL / 상세 이미지 / 텍스트 | 기본 정보, AI 제품 요약, 콘텐츠 제작용 데이터 → 라이브러리 저장 | `features/product-learning` |
| 공통 도구 | `product-library` | 제품 라이브러리 | `/tools/product-library` (+ `/[productId]`) | tool | ✅ | - | 검색어, 카테고리 | 제품 카드/목록, 상세(연결된 영상: 샤오홍슈 다시 받기·글자 흐리게·링크 추가·연결 해제), 수정, 삭제, 콘텐츠 만들기 | `features/product-library` |
| 공통 도구 | `video-import` | 영상 URL 가져오기 | `/tools/video-import` | tool | ✅ | YouTube Data API | 영상 URL 여러 개(줄바꿈, 최대 20), 메모 | 영상 메타데이터, 참고 영상 목록, 샤오홍슈: 워터마크 없는 원본(H.265)을 소리 없이 바로 저장·ZIP, [글자 흐리게] AI 가 덧씌운 글자 위치를 찾아 자동 흐리게 → H.264 (원작자 허락 확인) / YouTube: 다운로드 명령(yt-dlp, 내 PC) | `features/video-import`, `lib/video-download.ts`, `lib/video-links.ts` |
| 설정 | `api-center` | API 연결 센터 | `/settings/api` | settings | ✅ | - | API Key, Client ID/Secret | 연결 상태, 테스트 결과 | `features/api-center` |
| 사이트 관리 | `admin-approvals` | 가입 승인 | `/admin/approvals` | admin | ✅ | - | 승인 등급, 거절 사유 | 승인 대기 목록 | `features/admin` (관리자 전용) |
| 사이트 관리 | `admin-users` | 사용자 관리 | `/admin/users` | admin | ✅ | - | 역할 | 승인된 사용자 목록, 역할 변경 | `features/admin` (관리자 전용) |
| 사이트 관리 | `admin-permissions` | 권한 관리 | `/admin/permissions` | admin | ✅ | - | 등급별 허용 여부 | 권한표 | `features/admin` (관리자 전용) |
| 사이트 관리 | `admin-audit-logs` | 활동 기록 | `/admin/audit-logs` | admin | ✅ | - | 종류 필터, 검색 | 활동 기록 | `features/admin` (관리자 전용) |
| 사이트 관리 | `admin-errors` | 오류 기록 | `/admin/errors` | admin | ✅ | - | 기간·종류 필터, 검색, 같은 오류 묶음, 스택 보기, 삭제 | 오류 기록 | `features/admin/ErrorLogView.tsx` (관리자 전용, v0.9.21) |
| (단독) | `uploads` | 업로드 관리 | `/uploads` | - | ✅ | - | 플랫폼, 제품, 상태, 담당자 | 월간 캘린더, 날짜 상세, 업로드 등록(기존 콘텐츠·직접), 업로드 상태 배지 | `features/uploads` |
| (단독) | `ai-learning` | AI 학습 관리 | `/ai-learning` | - | ✅ | - | - | 제품 데이터, 나의 스타일(제목 패턴, 원하는 유형 Hook·CTA·제목 각 10개·예시 만들기, 파일 일괄 추가 .txt/.csv), 대본 포맷(제품 홍보·정보성, 메모장 대본 → AI 포맷, 유형별 기본 자동 적용), 콘텐츠 히스토리(최근 300건 자동 정리), 학습 프로필(팀 공통 6개, 자동·수동 학습, 되돌리기), 피드백, 성과 데이터 | `features/ai-learning` |
| (단독) | `manual` | 사용 매뉴얼 | `/manual` | - | ✅ | - | - | 장별 목차, 단계 ①②③ + 실제 화면 강조, 팁, PDF 다운로드 | `features/manual` (docs/MANUAL.md, v0.9.25) |

`*` = 필수 입력

## 2-1. 기본 접근 등급 (defaultTiers)

| 등급 묶음 | 기능 |
|-----------|------|
| `ALL` (실버·골드·VIP) | yt-trends, yt-info-video, clip-trends, clip-info-content, blog-trends, blog-info-writing, video-import, api-center, ai-learning |
| `GOLD_UP` (골드·VIP) | yt-product-video, clip-product-content, blog-product-writing, product-learning, product-library |
| `VIP_ONLY` | blog-auto-writing |
| 관리자 전용 | admin-approvals, admin-users, admin-permissions, admin-audit-logs, admin-errors |
| 권한 대상 아님 (모든 승인 사용자) | 내 정보 `/account` |

관리자는 모든 기능에 접근한다. 실제 적용 값은 **사이트 관리 → 권한 관리**에서 바꿀 수 있다 ([AUTH_AND_PERMISSIONS.md](./AUTH_AND_PERMISSIONS.md)).

## 3. 생성형 기능 상세 (Generator Config)

| Feature ID | promptId | submitLabel | productField | trendField | experienceField | headlineKey |
|------------|----------|-------------|--------------|------------|-----------------|-------------|
| `yt-product-video` | `youtube.product-video` | 영상 원고 생성하기 | productId | trendId | - | titles |
| `yt-info-video` | `youtube.info-video` | 영상 원고 생성하기 | - | trendId | - | titles |
| `clip-product-content` | `naver-clip.product-content` | 클립 원고 생성하기 | productId | trendId | - | title |
| `clip-info-content` | `naver-clip.info-content` | 클립 원고 생성하기 | - | trendId | - | title |
| `blog-product-writing` | `naver-blog.product-writing` | 블로그 글 생성하기 | productId | - | experience | titles |
| `blog-info-writing` | `naver-blog.info-writing` | 블로그 글 생성하기 | - | trendId | - | titles |
| `blog-auto-writing` | `naver-blog.auto-writing` | 자동으로 글 완성하기 | productId | - | - | titles |

모든 생성 기능은 `POST /api/contents/generate`로 실행되고, `GeneratedContent`로 저장되며, Memory(제품, 스타일, 예시, 피드백, 성과, 트렌드)를 주입받는다.

## 4. 기능 간 연결

| From | 행동 | To |
|------|------|----|
| 제품 상세페이지 학습 | [제품 라이브러리에 저장] | 제품 라이브러리 / 제품 상세 |
| 제품 라이브러리 | [콘텐츠 만들기] | 제품 홍보 영상 · 클립 · 블로그 (`?productId=`) |
| YouTube 트렌드 | [↗] · 상세 패널 [이 트렌드로 정보성 영상 만들기] · 추천 주제 [만들기] | 정보성 영상 (`?trendId=&topic=&keywords=`) |
| YouTube 트렌드 상세 | [제품 홍보 영상 만들기] | 제품 홍보 영상 (`?trendId=&keywords=`) |
| YouTube 트렌드 상세 | [스타일로 저장] | AI 학습 관리 > 나의 스타일 (`?tab=styles&styleRef=`, 영상 제목·설명·태그로 AI 초안) |
| 네이버 트렌드 | 급상승·시즌·관련 키워드 클릭 | 같은 화면에서 그 키워드로 바로 조회 |
| 나의 스타일 | 생성 폼 "스타일" 선택 (모든 생성 기능 공통) | 고른 스타일 적용, 비우면 채널 기본 스타일 |
| 콘텐츠 프로필 | 생성 폼 "콘텐츠 프로필" 선택 (프로필 2개 이상일 때만 보임) | 고른 프로필 → 스타일에 연결된 프로필 → 기본 프로필 |
| 영상 URL 가져오기 | 안내 링크 | 영상 음성 제거 (다른 사람 영상 다운로드는 제공하지 않음) |
| 콘텐츠 프로필 (AI 학습 관리 첫 탭) | 기본 프로필 자동 적용 | YouTube·NAVER 클립·NAVER 블로그 트렌드의 "현재 분석 기준" + 생성 Context (docs/CONTENT_PROFILE.md) |
| 트렌드 화면 "현재 분석 기준" 바 | [프로필 수정 →] | AI 학습 관리 > 콘텐츠 프로필 (`?tab=profiles`) |
| YouTube 트렌드 | ☆ 찜 · 기본 조건 | 생성 화면 "참고 트렌드" 목록 (★ 찜 → 기본 조건 상위 20개) |
| 네이버 트렌드 (Clip) | [클립 만들기] | 정보성 클립 (`?trendId=`) |
| 네이버 트렌드 (Blog) | [글쓰기] | 정보·트렌드 글 (`?topic=`) |
| 영상 URL 가져오기 | 저장 | 제품 라이브러리의 연결된 영상 (생성 화면 "참고 영상" 칸은 v0.9.24 에서 뺌) |
| 모든 생성 결과 | 좋은 결과 / 피드백 | AI 학습 관리 → 다음 생성 Context |
| API 연결 센터 | 연결 | Provider Registry (live 모드에서 실제 API) |

## 5. 새 기능을 추가할 때 이 표에 적을 것

1. 2장 표에 한 줄: 채널, ID, 기능, Route, 종류, 상태, 필요 API, 입력, 출력, 구현 위치
1. 2-1장에 기본 접근 등급
2. 생성형이면 3장 표에 한 줄
3. 다른 기능과 연결되면 4장에 한 줄
4. 1장 요약의 숫자

절차는 [DEVELOPMENT_GUIDE.md](./DEVELOPMENT_GUIDE.md)를 본다.
