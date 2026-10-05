# 영상 소싱: 샤오홍슈·도우인 검색, 도우인 링크 (v0.9.30)

공통 도구 › **영상 URL 가져오기**. 새 페이지나 새 저장 흐름은 만들지 않았습니다. 기존 "URL 가져오기 → reference_videos → 다운로드" 파이프라인 앞에 검색을 붙이고, 도우인 링크를 받을 수 있게 했습니다.
샤오홍슈 검색 하나만 있던 v0.9.29 의 내용은 [XIAOHONGSHU_SEARCH.md](./XIAOHONGSHU_SEARCH.md)에 있습니다. 이 문서는 그 위에 더한 부분입니다.

## 1. 화면

```
영상 가져오기                       [URL로 가져오기 | 영상 검색]
 ├ URL로 가져오기: 샤오홍슈·도우인·YouTube 링크 (공유 문구 그대로, v.douyin.com 포함)
 └ 영상 검색: 플랫폼 [샤오홍슈][도우인][둘 다]  ☑ 한국어 검색어 자동 변환
             검색어 · 정렬(종합·최신순·좋아요순 / 샤오홍슈만: 댓글순·저장순) · 기간(7·21·30일·전체)
             → 플랫폼별 결과 (배지 · 유사 영상 가능성 · 플랫폼별 더 보기 · 플랫폼별 오류)
             → 체크(최대 20) + 제품·메모 → [선택한 N개 가져오기] / [제목 N개 대본 포맷에 담기]
이번에 가져온 영상   이 화면에서 가져온 것만 (이미 저장됨, 배지, 다운로드)
기존 참고 영상       [제품을 선택하세요 ▾] (전체 제품 / 제품 미연결 / 제품) — 고를 때만 GET /api/videos?productId=
```

처음 열 때는 `GET /api/videos`(전체 목록)를 부르지 않습니다. 브라우저로 확인한 결과, 첫 화면의 호출은 0회입니다.

## 2. 구조

| 층 | 파일 | 역할 |
|---|---|---|
| 공통 TikHub 클라이언트 | `lib/server/providers/tikhub/client.ts` | Bearer 인증, GET(querystring)·POST(JSON), 30초 시간 제한, 401·403·402·429 오류 구분. 키는 로그·응답에 넣지 않음 |
| 샤오홍슈 Provider | `providers/xiaohongshu/*` | v0.9.29 그대로 (공통 클라이언트를 쓰도록만 바꿈) |
| 도우인 Provider | `providers/douyin/{types,parse,tikhub-douyin-provider,mock-douyin-provider,douyin-resolver}.ts` | `DouyinProvider { searchVideos, resolveShareUrl }` + 데모 Mock |
| 레지스트리 | `getDouyinProvider()` | 데모는 Mock. 실제 모드는 TikHub 키가 있어야 하며, 없으면 `TIKHUB_NOT_CONNECTED` |
| 검색 서비스 | `lib/server/services/social-search.ts` | 변환·플랫폼별 순서·오류 분리·중복·유사 표시 |
| API | `POST /api/videos/social-search` | `requireAccess("video-import")` + `rateLimit("xhs-search")` (1분 10회) |
| 공통 모델 | `lib/types/social.ts` | `SocialVideoItem` 등. 화면은 업체 원본 응답을 쓰지 않음 |
| 화면 | `features/video-import/SocialSearchPanel.tsx` | XhsSearchPanel 대체 |

## 3. TikHub 엔드포인트 (OpenAPI V5.3.2 에서 확인)

| 용도 | 방식 | 경로 | 비용 |
|---|---|---|---|
| 샤오홍슈 검색 | GET | `/api/v1/xiaohongshu/app_v2/search_notes` (note_type=视频笔记) | $0.01 |
| 샤오홍슈 상세 | GET | `get_video_note_detail` ([상세보기]를 누를 때만) | $0.01 |
| 도우인 검색 | **POST** (JSON body) | `/api/v1/douyin/search/fetch_video_search_v2` — keyword, cursor(첫 페이지 0), sort_type(0 종합·1 좋아요·2 최신), publish_time(0·1·7·180), filter_duration "0", content_type "1", search_id, backtrace | $0.01 |
| 도우인 공유 링크 | GET | `/api/v1/douyin/app/v3/fetch_one_video_by_share_url?share_url=` → 빈 응답일 때만 `/api/v1/douyin/web/fetch_one_video_by_share_url` | $0.001 |
| 연결 테스트 | GET | `get_user_info` (무료, 잔액 표시) | 0 |

**기간 처리.** 7일은 업체 필터(샤오홍슈 一周内, 도우인 7)를 그대로 씁니다. 21·30일은 업체 필터에 없는 값이라 만들지 않았습니다. 대신 반년(半年内 / 180)으로 받은 뒤, 서버에서 실제 게시일로 다시 거릅니다(최대 페이지 안에서).

## 4. 한국어 검색어 자동 변환

- 한글이 있고 자동 변환이 켜져 있을 때만, 기본 AI(`getAIProvider()`, Claude/OpenAI 중 사용자가 정한 것)를 **1회** 부릅니다. 프롬프트는 `social.query-translate` v1.0.0입니다.
- 출력 형식은 `{original, primary_zh, alternate_zh, english}`입니다. 브랜드·모델명은 남깁니다(예: `戴森 无线吸尘器` / `Dyson 无线吸尘器`). OR 문법이나 여러 검색어를 이어 붙인 것은 버립니다.
- 중국어·영어 입력과 자동 변환을 끈 경우에는 AI 없이 입력 그대로 검색합니다.
- 변환 결과는 사용자별로 서버 메모리에 6시간 기억합니다. DB에는 저장하지 않습니다.
- 변환에 실패하면 "검색어 자동 변환에 실패했습니다"를 안내하고 원문으로 검색합니다.

## 5. 검색 순서 (플랫폼마다 따로)

```
1순위(primary_zh) → 결과 < 15 면 보조(alternate_zh) → 그래도 < 15 면 영어(english)
```

- 검색어 하나당 최대 3페이지를 부르고, 15개(`minimumUsefulResults`)가 모이면 멈춥니다.
- **둘 다**: 변환은 1번만 하고, 두 플랫폼을 `Promise.allSettled`로 동시에 검색합니다. 보조 검색은 모자란 플랫폼만 합니다. 예를 들어 샤오홍슈 20개·도우인 5개면 도우인만 보조 검색어를 부릅니다.
- 한쪽이 실패해도 다른 쪽은 그대로 보여 줍니다(예: "도우인 검색에 실패했습니다. …"). 첫 검색어부터 실패하면 그 플랫폼은 오류로 표시합니다. 보조 검색어에서 실패하면 이미 받은 결과를 그대로 둡니다.
- [더 보기]: 그 플랫폼의 마지막 검색어만 이어서 부릅니다. 번역이나 다른 플랫폼은 다시 부르지 않습니다.
- 중복: 같은 플랫폼 안에서 같은 영상(platform+sourceId)은 1순위·보조 결과를 합쳐 한 번만 보여 줍니다.
- 유사 영상: 다른 플랫폼 사이에서는 지우지 않고 **유사 영상 가능성**으로 표시만 합니다. 기준은 검색어를 뺀 제목의 2글자 겹침 70% 이상, 길이 ±2초입니다.
- 설정값은 `socialVideoSearchConfig`(minimumUsefulResults 15, maxPagesPerQuery 3, maxImportSelection 20, enableEnglishFallback true, recentDays [7, 21, 30])입니다.

## 6. 가져오기·다운로드

- 가져오기는 기존 `api.videos.importMany()`(`/api/videos/batch`)를 쓰고, 원본 URL과 제목을 넘깁니다. 그다음 reference_videos 저장 → "이번에 가져온 영상" 순서로 이어집니다.
- 도우인 URL 감지 대상은 `douyin.com`, `www.douyin.com`, `v.douyin.com`, `iesdouyin.com`입니다. 공유 문구의 암호·"复制打开抖音，看看"·"【…的作品】"는 제목에서 뺍니다.
- 도우인을 가져올 때는 공유 링크 API로 제목·작성자·길이를 채웁니다. TikHub가 미연결이거나 오류가 나면 공유 문구의 제목으로 저장합니다. 이것은 샤오홍슈와 같은 방식입니다.
- 도우인 [다운로드]도 기존 버튼과 같은 길로 받습니다. `/api/videos/resolve`가 TikHub 응답의 재생 주소만 넘기고(10분 기억), 브라우저가 받아 소리를 뺍니다.
  - 재생 주소는 만들어 붙이지 않습니다. 응답에 주소가 없으면 `DOUYIN_NO_MEDIA`를 돌려줍니다.
  - 워터마크가 없다고 가정하지 않습니다.
  - 도우인 CDN이 브라우저 직접 받기(CORS)를 막으면 **[새 탭에서 열기]** 링크를 보여 줍니다.

## 7. DB

변경은 없습니다. `reference_videos.platform`은 text라서 `"douyin"`을 그대로 넣을 수 있습니다. 검색 결과와 변환 결과는 저장하지 않습니다.

## 8. 테스트

- `tests/unit/social-search.test.ts`: CASE 1·2·3·5·6·7·8, 변환 실패, 더 보기, 도우인 응답 읽기, CASE 4 링크 감지, 유사 표시
- `tests/api/flows.test.ts`: 데모 서버에서 둘 다 검색, 도우인만 보조 검색, 도우인 결과·v.douyin.com 가져오기, 제품별 목록(CASE 9), 재생 주소 없음 처리

## 9. 남은 위험

- 실제 키로 검증하지 않았습니다. 샤오홍슈·도우인 응답 구조는 문서 기준이라, 실제 키로 첫 검색을 해 보고 `parse.ts`를 보정해야 할 수 있습니다.
- 도우인 영상·썸네일 CDN이 브라우저 요청(CORS·핫링크)을 막을 수 있습니다. 막히면 새 탭으로 안내하거나 서버 프록시를 검토해야 합니다.
- 변환·검색 기억은 서버 인스턴스 메모리에 있어서, 인스턴스 사이에 공유되지 않습니다.
- `GET /api/videos?productId=`는 지금 저장소 목록을 읽은 뒤 서버에서 거릅니다. 영상이 아주 많아지면 SQL where 전용 메서드로 바꿉니다.
