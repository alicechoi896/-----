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

| Route | 화면 | 역할 | 주요 컴포넌트 | 렌더링 |
|-------|------|------|---------------|--------|
| `/` | 콘텐츠 자동화 센터 | 채널 카드 4개 + 최근 생성·제품·API 상태 요약 | ChannelCard, HomeOverview | Static + Client |
| `/youtube` | YouTube 자동화 | 기능 카드 3개 | ChannelHub | Static |
| `/youtube/trends` | YouTube 트렌드 찾기 | 필터 → 요약 → 트렌드 표 | YouTubeTrendExplorer | Static + Client |
| `/youtube/product-video` | 제품 홍보 영상 만들기 | 제품·트렌드·참고 영상으로 원고 생성 | ContentGenerator | Dynamic(쿼리) |
| `/youtube/info-video` | 정보성 영상 만들기 | 주제·트렌드로 원고 생성 | ContentGenerator | Dynamic |
| `/naver-clip` | NAVER Clip 자동화 | 기능 카드 3개 | ChannelHub | Static |
| `/naver-clip/trends` | 네이버 트렌드 소재 찾기 | 급상승 주제·키워드, 시즌·관련 키워드 | NaverTrendExplorer `scope="clip"` | Static + Client |
| `/naver-clip/product-content` | 제품 홍보 클립 만들기 | 클립 원고 생성 | ContentGenerator | Dynamic |
| `/naver-clip/info-content` | 정보성 클립 만들기 | 클립 원고 생성 | ContentGenerator | Dynamic |
| `/naver-blog` | NAVER Blog 자동화 | 기능 카드 4개 | ChannelHub | Static |
| `/naver-blog/trends` | 네이버 트렌드·키워드 찾기 | 검색 추이 차트, 관련 검색어, 아이디어 | NaverTrendExplorer `scope="blog"` | Static + Client |
| `/naver-blog/product-writing` | 제품 블로그 글 만들기 | 제품 글 생성 (정직성 가드레일) | ContentGenerator | Dynamic |
| `/naver-blog/info-writing` | 정보·트렌드 글 만들기 | 정보 글 생성 | ContentGenerator | Dynamic |
| `/naver-blog/auto-writing` | 자동 글쓰기 | 최소 입력으로 전체 글 생성 | ContentGenerator | Dynamic |
| `/tools` | 공통 도구 | 기능 카드 3개 | ChannelHub | Static |
| `/tools/product-learning` | 제품 상세페이지 학습 | URL/이미지/텍스트 → 분석 → 저장 | ProductLearningWorkspace | Static + Client |
| `/tools/product-library` | 제품 라이브러리 | 카드/목록, 검색, 삭제, 콘텐츠 만들기 | ProductLibrary | Static + Client |
| `/tools/product-library/[productId]` | 제품 상세 | 전체 분석·원본·생성 이력, `?mode=edit` 수정 | ProductDetailView | Dynamic |
| `/tools/video-import` | 영상 URL 가져오기 | 참고 영상 저장 | VideoImport | Static + Client |
| `/ai-learning` | AI 학습 관리 | 5개 Memory 탭 | AiLearningCenter | Static + Client |
| `/settings` | 설정 | 설정 카드 (API 연결 센터, 일반 설정 준비 중) | ChannelHub | Static |
| `/settings/api` | API 연결 센터 | OpenAI / YouTube / NAVER 연결·테스트 | ApiCenter, ApiConnectionCard | Static + Client |
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
| GET | `/api/trends/youtube?category&keyword&period&format&sort` | YouTube 트렌드 | trendService.searchYouTube |
| GET | `/api/trends/naver?scope&category&keyword&period` | NAVER 인사이트 | trendService.getNaverInsight |
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
| PATCH/DELETE | `/api/styles/:id` | 기본 지정 / 삭제 | memoryService |
| GET | `/api/performance` | 성과 데이터 | memoryService.listPerformance |
| GET | `/api/memory` | Memory 항목별 개수 | memoryService.overview |
| GET | `/api/connections` | 연결 상태 (공개 DTO) | connectionService.list |
| PUT/DELETE | `/api/connections/:provider` | 연결 (암호화 저장) / 해제 | connectionService |
| POST | `/api/connections/:provider/test` | 연결 테스트 | connectionService.test |
| GET/POST | `/api/videos` | 참고 영상 조회 / 가져오기 | videoService |
| DELETE | `/api/videos/:id` | 참고 영상 삭제 | videoService.remove |
