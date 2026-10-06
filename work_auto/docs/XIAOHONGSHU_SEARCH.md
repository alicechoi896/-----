# XIAOHONGSHU_SEARCH — 샤오홍슈 영상 검색 (TikHub)

> v0.9.32 비용 정책이 이 문서보다 우선한다 (검색 1번 = 1회, 자동 페이지 넘김·상세 자동 호출 없음, `/api/videos/xhs-search` 경로 삭제). v0.9.30 부터 화면은 **[영상 검색]** 탭(샤오홍슈 또는 도우인, 한국어 자동 변환)으로 바뀌었다 → [SOCIAL_VIDEO_SOURCING.md](./SOCIAL_VIDEO_SOURCING.md). 아래 샤오홍슈 Provider·파라미터·비용은 그대로다.
>
> v0.9.29. 공통 도구 › **영상 URL 가져오기** 화면의 **[샤오홍슈 검색]** 탭. 새 페이지·새 저장 흐름을 만들지 않고, "URL 을 찾아 붙여넣는 과정" 앞에 검색만 더했다.

## 1. 흐름

```
[샤오홍슈 검색] 탭 → 검색어 (+ 선택: AI 중국어 검색어 추천)
  → POST /api/videos/xhs-search  (TikHub search_notes, 영상만)
  → 결과(화면에만, 저장 안 함) → 체크 (최대 20개) + 연관 제품 + 메모
  → [선택한 N개 가져오기] = POST /api/videos/batch  ← URL 가져오기와 같은 videoService.importMany()
  → reference_videos 저장 → '저장된 참고 영상' 목록 → 기존 다운로드·제품 연결·ZIP
```

- 기본 탭은 **URL로 가져오기** (기존 기능 그대로)
- 가져오기는 검색 결과의 **원본 URL**(`https://www.xiaohongshu.com/discovery/item/{noteId}?xsec_token=…&xsec_source=app_share`)과 제목(titleHint)을 넘긴다. 이후 처리(샤오홍슈 페이지에서 제목·작성자·길이 읽기, 실패하면 제목 힌트로 저장)는 URL 입력과 완전히 같다

## 2. Provider 구조 (업체 교체 대비)

| 파일 | 역할 |
|------|------|
| `lib/server/providers/xiaohongshu/types.ts` | `XiaohongshuSearchProvider` interface (`searchVideos`, `getVideoDetail`, `testConnection`), `XhsSearchError` |
| `.../tikhub-xiaohongshu-provider.ts` | TikHub 구현 |
| `.../mock-xiaohongshu-provider.ts` | 데모 모드 (외부 호출 없음) |
| `.../parse.ts` | 응답 → `XhsNote` (응답 구조가 문서에 없어 여러 위치·이름을 너그럽게 읽음) |
| `lib/server/providers/registry.ts` `getXiaohongshuSearchProvider()` | live: TikHub 키 필요 (없으면 `TIKHUB_NOT_CONNECTED`, 가짜 결과로 바꾸지 않음) / 데모: Mock |
| `lib/server/services/xhs-search.ts` | 기간 처리·페이지 제한·캐시·오류 변환·AI 검색어 추천 |

다른 업체로 바꿀 때는 interface 를 구현한 클래스 1개 + registry 1줄만 바꾼다. 화면은 그대로다.

## 3. TikHub API (공식 OpenAPI V5.3.2 에서 확인, 2026-10-05)

- Base `https://api.tikhub.io`, 헤더 `Authorization: Bearer {키}` (서버에서만)
- 검색 `GET /api/v1/xiaohongshu/app_v2/search_notes`
  - `keyword`, `page`(1부터), `sort_type` = general / time_descending / popularity_descending / comment_descending / collect_descending
  - `note_type` = **`视频笔记`(영상만)** 고정, `time_filter` = 不限 / 一天内 / 一周内 / 半年内
  - 다음 페이지: 첫 응답의 `search_id`, `search_session_id`
- 상세 `GET /api/v1/xiaohongshu/app_v2/get_video_note_detail?note_id=` — [상세보기]에서 설명이 없을 때만
- 연결 테스트 `GET /api/v1/tikhub/user/get_user_info` — **무료**, 잔액 표시
- 비용 (get_endpoint_info): 검색 1회 **$0.01**, 상세 1회 $0.01, 무료 크레딧 사용 불가. 초당 10회
- 오류: 401 키 오류·만료 / 403 권한·계정 / **402 잔액 부족** / 429 너무 많음 / 시간 초과 30초 → 화면에 쉬운 문장으로 (키·헤더는 노출하지 않음)

## 4. 기간 처리

| 화면 | TikHub `time_filter` | 서버 처리 |
|---|---|---|
| 최근 7일 | 一周内 | 그대로 |
| 최근 21일 / 30일 | 半年内 | **게시일로 다시 거름** (정확한 필터가 없어 없는 파라미터를 만들지 않음). 게시일이 없는 결과는 뺀다 |
| 전체 | 不限 | 그대로 |

최신순 + 21·30일이면, 한 페이지가 모두 기간 밖일 때 더 부르지 않는다.

## 5. 비용·부하 줄이기

- `XHS_SEARCH_CONFIG`: [검색]·[더 보기] 한 번에 **최대 3페이지**, 20개가 모이면 멈춤
- 같은 사용자·같은 조건은 **10분 동안 서버 메모리 캐시** (다시 눌러도 0회)
- 검색할 때 상세 API 를 자동으로 부르지 않는다. 상세는 1시간 기억, 화면에서도 한 번만
- AI 중국어 검색어 추천은 **누를 때만** 기본 AI 1회 (프롬프트 `xhs.search-keywords`)
- 호출 한도: `xhs-search` 1분 10회, 검색어 추천은 `ai-generate` 한도

## 6. 저장 정책

- 검색 결과·TikHub 원본 응답(raw JSON)은 **DB 에 저장하지 않는다**
- 가져온 영상만 기존 `reference_videos` 에 기존 형식으로 저장 (새 테이블 없음)
- TikHub 키는 기존 `api_connections` (provider = `tikhub`, AES-256-GCM) — **DB 변경 없음** (provider 컬럼은 text, 제한 없음)

## 7. 장애 분리

- TikHub 미연결·오류 → [샤오홍슈 검색] 탭에만 안내 ("API 연결하러 가기"). **URL로 가져오기는 그대로 동작**
- 가져온 뒤 다운로드는 기존 샤오홍슈 다운로드(TikHub 와 무관)

## 8. 아직 확인하지 못한 것

- TikHub 문서에 검색 **응답 본문 구조**가 없다. `parse.ts` 가 `data.data.items[].note` 등 여러 위치를 읽도록 만들었지만, 실제 키로 처음 검색할 때 결과가 비어 있으면 응답 구조를 확인해 `parse.ts` 만 고친다

## v0.9.50: 다운로드 대체 경로

영상 검색으로 담은 노트가 샤오홍슈 페이지에서 막히면(XHS_BLOCKED·XHS_PARSE) `resolveXiaohongshuWithFallback()`:
1. xsec_source 를 app_share → pc_search → pc_feed 로 바꿔 다시 (샤오홍슈 페이지, 비용 0)
2. 그래도 막히면 TikHub `get_video_note_detail` 1회($0.01)로 재생 주소(H.264)를 받는다. 같은 노트 10분 기억·동시 요청 1번. 로그 `[XhsResolve]`.
영상 파일은 여전히 사용자 브라우저가 xhscdn 에서 직접 받는다.
