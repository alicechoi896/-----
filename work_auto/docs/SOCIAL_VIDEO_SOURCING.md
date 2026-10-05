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

## 0-0. 호출 제어 (v0.9.35, 최우선)

- [검색] 클릭·Enter handler 에서만 부릅니다. mount·useEffect·조건(플랫폼·정렬·기간) 변경·번역 완료·▶ 재생·창 포커스로는 부르지 않습니다.
- 잠금은 ref(`busyRef`)로 클릭 즉시 겁니다. 그래서 더블클릭이나 검색 중 Enter를 눌러도 우리 API 요청은 1회입니다.
- 한국어는 handler 안에서 순서대로 처리합니다. 서버가 한 요청 안에서 변환 결과를 지역 변수로 받아 바로 검색하므로, 변환 1회 + 검색 1회입니다.
- 서버는 같은 사용자·조건의 동시 요청을 `inFlightSearches`·`inFlightTranslations`로 합칩니다. TikHub는 1회만 부르고 결과를 나눠 씁니다.
- 자동 재시도는 없습니다. 실패하면 오류 문구만 보여 주고, 사용자가 다시 누를 때만 새로 요청합니다.
- 로그: `[SocialSearch] tikhub-search {requestId, platform, query, page, at}` 형식입니다. 목표는 requestId 1개 → tikhub-search 1줄입니다.

## 0-1. 검색 화면 UX (v0.9.33, 이전 화면 요구사항보다 우선)

- **상세보기 Drawer 삭제**: 카드만 보고 고릅니다. 카드에는 플랫폼 배지, 체크, 썸네일, 길이, 한국어 제목, 원문 제목, 작성자, 게시일, 좋아요, 댓글, 저장, 공유, ▶, 원본이 들어갑니다.
- **[대본 포맷에 담기]를 검색 화면에서 삭제**: 샤오홍슈·도우인 제목은 학습 데이터로 저장하지 않습니다. YouTube·NAVER 트렌드의 [대본 포맷에 담기]는 그대로 둡니다(별도 기능, `/api/script-formats/titles` 공용).
- **카드 안 미리보기**
  - 카드 전체가 아니라 **▶**를 눌렀을 때만 썸네일 자리가 플레이어로 바뀝니다.
  - 그 전에는 `<video>` 요소도 주소도 없어서 미디어 요청이 0개입니다. 플레이어는 `preload="none"`입니다.
  - 닫으면(✕) pause 후 src를 지웁니다.
  - **동시에 한 영상만**: 미리보기 상태가 하나(`preview.key`)뿐이라, 다른 카드의 ▶를 누르면 앞 플레이어가 사라집니다.
  - 재생 주소 순서: ① 화면 기억(`mediaCache`, 플랫폼 + sourceId, 20분, `SEARCH_PREVIEW_CONFIG.mediaCacheTtlMinutes`) → ② 검색 응답의 재생 주소(검색 후 20분 안) → ③ 그 영상 1개만 `/api/videos/resolve`.
  - 샤오홍슈의 ③은 모바일 페이지에서 찾으므로 TikHub를 쓰지 않습니다. 도우인의 ③은 공유 링크 API 1회입니다(서버에서도 20분 기억).
  - 재생에 실패하면(CORS·코덱·만료·403) 그 카드에만 "영상 미리보기를 재생할 수 없습니다"와 [다시 시도]·[원본 보기]가 나옵니다.
  - 재생은 저장하지 않습니다(DB insert 0).
- **제목 한국어 번역**
  - 결과는 원문 제목으로 바로 보여 주고, 뒤에서 그 페이지의 중국어 제목만 묶어 `POST /api/videos/translate-titles`로 **AI 1회** 번역합니다(프롬프트 `social.title-translate` 1.0.0).
  - 번역이 끝나면 카드 제목이 한국어로 바뀌고, 원문은 아래에 작게 남습니다.
  - 대상: 한글이 없고, 한자가 2자 이상이며, 한자 비중이 40% 이상인 제목(`isChineseTitle`). 영어는 원문 그대로입니다.
  - 제목만 보냅니다(해시태그 제외). 응답은 id(플랫폼:sourceId)로 짝을 맞춥니다.
  - 기억: `sessionStorage`(플랫폼 + sourceId + 원문 제목). DB에는 저장하지 않습니다. 가져온 영상은 원문 제목으로 저장합니다(schema 변경 없음).

### 호출 수 (v0.9.33)

| 상황 | TikHub 검색 | TikHub 상세·Resolver | AI 번역 |
|---|---|---|---|
| A. 샤오홍슈 검색 1회 → 결과 10개 → 재생 안 함 | 1 | 0 | 1 (+ 한국어 검색어면 변환 1) |
| B. 영상 1개 ▶ | 1 | 샤오홍슈 0 · 도우인 0 (검색 응답 주소) | 1 |
| C. 영상 5개 차례로 ▶ | 1 | 샤오홍슈 0 · 도우인 0 (주소가 없을 때만 영상당 1) | 1 |
| D. 같은 영상 재생 → 정지 → 다시 재생 | 0 | 0 (20분 기억) | 0 |

샤오홍슈는 검색 응답에 H.264 주소가 있으면 그것을 씁니다(`video_info_v2.media.stream.h264[].master_url`). 없으면 모바일 페이지에서 찾으며, 이때 TikHub는 0회이고 우리 서버 요청이 1회 생깁니다.

## 1. 화면

```
영상 가져오기                       [URL로 가져오기 | 영상 검색]
 ├ URL로 가져오기: 샤오홍슈·도우인·YouTube 링크 (공유 문구 그대로, v.douyin.com 포함)
 └ 영상 검색: 플랫폼 [샤오홍슈][도우인]  ☑ 한국어 검색어 자동 변환
             검색어 · 정렬(종합·최신순·좋아요순 / 샤오홍슈만: 댓글순·저장순) · 기간(7·21·30일·전체)
             → 한 번에 받은 결과 전부 ('이미 검색한 결과 · API 호출 없음' 표시) → 제목 한국어 (뒤에서) → [더 보기]
             → 카드 ▶ = 카드 안 재생 (하나만) · 원본 · 체크(최대 20) + 제품·메모 → [선택한 N개 가져오기]
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
