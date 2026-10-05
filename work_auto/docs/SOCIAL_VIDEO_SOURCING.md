# 영상 소싱: 샤오홍슈·도우인 검색, 도우인 링크 (v0.9.30 → v0.9.32 비용 정책)

공통 도구 › **영상 URL 가져오기**. 새 페이지나 새 저장 흐름은 없습니다. 기존 "URL 가져오기 → reference_videos → 다운로드" 앞에 검색을 붙였고, 도우인 링크도 받습니다.
v0.9.29 샤오홍슈 Provider와 파라미터는 [XIAOHONGSHU_SEARCH.md](./XIAOHONGSHU_SEARCH.md)에 있습니다.

## 0. 비용 정책 (v0.9.32, 이전 요구사항보다 우선)

1. **검색 1번 = TikHub 검색 API 1회.** TikHub는 영상 개수가 아니라 요청 1회마다 과금합니다(샤오홍슈 search_notes $0.01, 도우인 fetch_video_search_v2 $0.01, 2026-10 확인). 정책은 바뀔 수 있으니 바꾸기 전에 공식 문서를 다시 확인합니다.
2. 업체가 한 번에 준 결과는 **모두 보여 줍니다.** 임의로 끊지 않고, 문서에 없는 count·limit 파라미터도 만들지 않습니다(샤오홍슈 = page, 도우인 = cursor·search_id).
3. **자동 페이지 넘김과 자동 추가 검색이 없습니다.** 보조 중국어·영어 대체 검색, 두 플랫폼 동시 검색([둘 다])을 모두 뺐습니다. 다음 페이지는 사용자가 **[더 보기]**를 누를 때만 1회 부릅니다.
4. **검색 결과는 DB에 저장하지 않습니다.** 검색 결과, 순위, 페이지, 원본(raw) 응답, 고르지 않은 영상, 검색 기억, 검색 기록이 모두 해당합니다. 새 테이블도 없습니다.
5. **같은 조건은 30분 동안 다시 부르지 않습니다**(`socialVideoSearchConfig.searchCacheTtlMinutes = 30`).
   - 기억 키: 플랫폼 + 검색어 + 자동 변환 여부 + 정렬 + 기간 (+ page/cursor)
   - ① 화면: 메모리와 `sessionStorage`(최근 20개, 30분)에 둡니다. 이 기억이 있으면 서버도 부르지 않습니다.
   - ② 서버: 메모리 30분(`xhs-search.ts`, `social-search.ts`). Redis나 DB 기억은 없습니다.
   - TikHub `cache_url`(디버깅용)에는 기대지 않습니다.
6. **검색어 변환**: 한국어는 AI 1회로 중국어 1개를 만듭니다(프롬프트 `social.query-translate` 1.1.0). 사용자별로 서버 메모리에 6시간 기억하므로, 플랫폼을 바꿔 다시 검색해도 AI를 다시 부르지 않습니다. 중국어·영어 입력은 그대로 검색합니다.
7. **가져오기 = 고른 영상만 저장합니다.** 화면이 검색 결과에 이미 있는 제목·작성자·길이·썸네일을 `meta`로 넘기고, 서버는 상세·Resolver API 없이 `reference_videos`에 바로 저장합니다(`videoService.import`의 `fromSearch`).
8. **다운로드는 가져오기와 따로입니다.** [다운로드]를 누를 때만 재생 주소를 찾습니다.
   - **도우인**: Search V2 응답의 `video.play_addr`·`bit_rate`를 `rememberDouyinVideos()`로 서버 메모리에 20분 기억합니다. 검색 뒤 바로 다운로드하면 0회, 그 밖에는 영상당 공유 링크 API 1회(APP 응답이 비었을 때만 Web 1회 더)입니다. 같은 영상은 20분 동안 다시 부르지 않습니다.
   - **샤오홍슈**: 기존처럼 샤오홍슈 모바일 페이지에서 주소를 찾습니다(TikHub 0회).
   - 재생 주소는 만료될 수 있어 **DB에 저장하지 않습니다.**
9. **상세 API**(샤오홍슈 get_video_note_detail)는 화면에서 부르지 않습니다. [상세보기]도 검색 결과에 있는 값만 보여 줍니다. Provider에는 메서드가 남아 있지만, 쓰는 API 경로는 없습니다(`/api/videos/xhs-search/*` 삭제).
10. **기존 참고 영상**: 처음 열 때 불러오지 않습니다. 제품을 고르면 `GET /api/videos/page`로 30개씩 읽고(SQL where + range), [더 불러오기]를 누를 때만 다음 30개를 읽습니다.
11. 썸네일·mp4 파일은 Storage에 저장하지 않습니다. 썸네일은 원래 주소를 그대로 저장하고, mp4는 브라우저가 받아 바로 저장합니다.

### TikHub 호출 수

| 상황 | 검색 API | 상세·Resolver API | 합계 |
|---|---|---|---|
| 샤오홍슈 검색 1회 | 1 | 0 | **1** (+ 한국어면 AI 1회) |
| 도우인 검색 1회 | 1 | 0 | **1** |
| 같은 검색어 다시 검색 (30분 안) | 0 | 0 | **0** |
| [더 보기] 클릭 | 1 | 0 | **1** |
| 영상 10개 골라 참고 영상 저장 | 0 | 0 | **0** |
| 저장한 영상 1개 다운로드 | 0 | 샤오홍슈 0 · 도우인 0~1 | **0~1** |
| 저장한 영상 10개 다운로드 | 0 | 샤오홍슈 0 · 도우인 개당 0~1 | **0~10** |

도우인 다운로드가 0회인 경우는 검색 후 20분 안에 받을 때입니다. 링크만 붙여 넣어 가져온 도우인은 정보가 없어서, 가져올 때 공유 링크 API를 1회 부릅니다. 이 결과도 20분 동안 기억하므로 바로 다운로드하면 0회입니다.

## 1. 화면

```
영상 가져오기                       [URL로 가져오기 | 영상 검색]
 ├ URL로 가져오기: 샤오홍슈·도우인·YouTube 링크 (공유 문구 그대로, v.douyin.com 포함)
 └ 영상 검색: 플랫폼 [샤오홍슈][도우인]  ☑ 한국어 검색어 자동 변환
             검색어 · 정렬(종합·최신순·좋아요순 / 샤오홍슈만: 댓글순·저장순) · 기간(7·21·30일·전체)
             → 한 번에 받은 결과 전부 ('이미 검색한 결과 · API 호출 없음' 표시) → [더 보기]
             → 체크(최대 20) + 제품·메모 → [선택한 N개 가져오기] / [제목 N개 대본 포맷에 담기]
이번에 가져온 영상   이 화면에서 가져온 것만 (이미 저장됨)
기존 참고 영상       [제품을 선택하세요 ▾] → 30개씩 + [더 불러오기]
```

## 2. 구조

| 층 | 파일 |
|---|---|
| 공통 TikHub 클라이언트 | `lib/server/providers/tikhub/client.ts` (키는 서버에서만, 로그·응답에 넣지 않음) |
| 샤오홍슈 | `providers/xiaohongshu/*`, `services/xhs-search.ts` (1페이지·30분 기억·21/30일 게시일 거르기) |
| 도우인 | `providers/douyin/*`, `douyin-resolver.ts` (`rememberDouyinVideos`, 20분 기억) |
| 검색 | `services/social-search.ts`, `POST /api/videos/social-search` { keyword, platform, autoTranslate, sort, period, next? } |
| 저장 | `videoService.importMany(items[{url, titleHint, meta}])`, `VideoRepository.findUrls` (중복 확인 1번) |
| 기존 영상 | `GET /api/videos/page?productId=&offset=`, `VideoRepository.listPage` |
| 화면 | `features/video-import/SocialSearchPanel.tsx` (세션 기억), `VideoImport.tsx` |

## 3. 응답에서 쓰는 값 (문서 기준, 실제 키로 확인 필요)

| 값 | 샤오홍슈 search_notes | 도우인 Search V2 |
|---|---|---|
| sourceId | note id | aweme_id |
| 제목·작성자 | display_title·user.nickname 등 (문서에 본문 구조 없음 → 너그럽게 읽음) | desc 첫 줄·author.nickname |
| 썸네일 | 이미지 목록 첫 번째 | video.cover.url_list |
| 원본 주소 | note id + xsec_token 으로 만든 공유 주소 | share_url |
| 재생 주소 | 쓰지 않음 (다운로드는 모바일 페이지에서) | video.play_addr / bit_rate[].play_addr (다운로드에 재사용) |

## 4. DB

마이그레이션은 없습니다. `reference_videos`에 저장하는 값은 url, platform, title, channel_name, duration_sec, thumbnail_color, thumbnail_url, note, product_id, user_id, created_at입니다. 모두 기존 컬럼입니다.

## 5. 테스트

- `tests/unit/social-search.test.ts`: 검색 1회, 같은 조건 0회, [더 보기] 1회, 플랫폼을 바꿔도 변환 1회, 21·30일 1회, 둘 다 거부, 도우인 검색 결과로 바로 다운로드할 때 0회, 응답 읽기, 링크 감지
- `tests/unit/video-import-cost.test.ts`: 검색 결과 10개 저장 시 Resolver 0회, 저장 필드 최소, 링크만 넣었을 때 1회, 중복 확인 1번
- `tests/api/flows.test.ts`: 데모 서버에서 위 흐름 + 제품별 30개씩 읽기

## 6. 남은 위험

- 실제 키로 검증하지 않았습니다. 응답 구조가 문서와 다르면 `parse.ts`를 보정해야 합니다.
- 도우인 CDN이 브라우저의 직접 받기를 막을 수 있습니다. 이 경우 [새 탭에서 열기]로 대신합니다.
- 서버 기억은 인스턴스 메모리라서, 서버가 여러 대이거나 콜드 스타트가 일어나면 다시 부를 수 있습니다. 화면 세션 기억이 1차로 막아 줍니다.
- 21·30일은 반년치 한 페이지에서 게시일로 거르기 때문에, 한 페이지에 보이는 수가 적을 수 있습니다([더 보기]로 보충).
