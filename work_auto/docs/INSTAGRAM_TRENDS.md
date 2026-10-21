# 인스타그램 트렌드 찾기 (v0.9.53)

릴스는 YouTube 와 같은 영상을 올리므로, Instagram 메뉴는 **트렌드 찾기만** 둔다. 찾은 소재는 YouTube 영상 원고·영상 자동 제작으로 이어 간다.

- 화면: `/instagram/trends` (`features/instagram-trends/InstagramTrendExplorer.tsx`)
- 서비스: `lib/server/services/instagram-trends.ts` · Provider: `lib/server/providers/instagram/*` (registry `getInstagramProvider`)
- 업체: TikHub Instagram V2 — `GET /api/v1/instagram/v2/search_reels` (keyword, pagination_token). 공식 SDK(V5.3.2) 기준 경로. 응답 본문 구조는 문서에 없어 `parse.ts` 가 흔한 위치·이름(code, caption.text, play_count|ig_play_count|view_count, like_count, comment_count, taken_at, user.username, image_versions2…)을 너그럽게 읽고, 없는 값은 null 로 둔다.
- 키: API 연결 센터의 TikHub (샤오홍슈·도우인과 같은 키). 서버에서만, 로그·오류에 남기지 않는다.

## 공식 API 병행 (v0.9.57) — 기본
TikHub 비용을 줄이려고 **해시태그 검색은 Meta 공식 Instagram Graph API(무료)** 를 기본으로 쓴다. TikHub 는 사용자가 고르거나 [TikHub 로 찾기]를 누를 때만 (자동 전환 없음).

| | 공식 API (`meta-instagram`) | TikHub |
|---|---|---|
| 비용 | 무료 | 1회 약 $0.01 |
| 검색 | 해시태그만 (띄어쓰기·# 제거: `lib/instagram.ts` toHashtag) | 키워드 |
| 한도 | 계정 1개당 **7일에 서로 다른 해시태그 30개** (이미 찾은 것·[더 보기]는 안 셈) | - |
| 결과 | 인기(top_media)·최근 24시간(recent_media), 영상만, 좋아요·댓글·캡션·게시일·media_url | 조회수·작성자·팔로워 포함 |

- Provider: `lib/server/providers/instagram/meta-graph.ts` (Graph API v23.0, 토큰은 Authorization 헤더로만)
  1. `GET /{ig-user-id}/recently_searched_hashtags` — 이번 주 찾은 해시태그 (한도 확인, 한도에 안 셈). 30개 찼고 새 해시태그면 **부르지 않고** META_QUOTA
  2. `GET /ig_hashtag_search?user_id=&q=` — 새 해시태그일 때만 (이때 한도 1개)
  3. `GET /{hashtag-id}/top_media|recent_media?fields=id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count&limit=50` — after 커서로 [더 보기]
- 같은 사용자·종류·해시태그·페이지 30분 기억, 동시 요청 1번. 로그 `[IgMeta]` (clientRequestId, 개수, 한도 — 토큰 없음)
- 공식 API 결과의 ▶ 는 media_url 로 재생, 없으면 TikHub 를 부르지 않고 '인스타그램에서 보기' 안내
- 화면 시작 때 `GET /api/trends/instagram/status` (DB 만): 공식 API 연결 → 기본 공식 API
- 오류 코드: META_NOT_CONNECTED · META_QUOTA · META_AUTH(토큰 만료) · META_PERMISSION · META_RATE_LIMIT · META_NOT_FOUND

### 준비 (한 번)
1. Instagram 계정을 **비즈니스(또는 크리에이터)** 로 바꾸고 **Facebook 페이지**에 연결 (광고 계정은 필요 없음)
2. developers.facebook.com → 앱 만들기 (비즈니스 유형) → Instagram Graph API 추가
3. 권한 `instagram_basic`, `pages_show_list` + 기능 **Instagram Public Content Access** (앱 검수·비즈니스 인증 필요)
4. 토큰: 비즈니스 설정 › 시스템 사용자 토큰(만료 없음) 권장. 사용자 토큰은 60일마다 바꿔야 함
5. Graph API 탐색기 `GET me/accounts?fields=instagram_business_account` → 비즈니스 계정 ID
6. API 연결 센터 › Instagram 공식 API (Meta) 에 토큰·계정 ID → [테스트] (계정 이름·이번 주 한도, 무료)

## 비용 규칙 (TikHub)
- [검색] 1번 = 1회, [더 보기] 1번 = 1회 (약 $0.01). 자동 재시도·자동 다음 페이지 없음
- 같은 사용자·검색어·페이지는 30분 기억 → 0회. 동시에 같은 요청은 1번으로 합침. 로그 `[IgSearch]` (clientRequestId)
- 정렬·기간 필터는 받은 결과 안에서 (추가 호출 없음). 결과는 저장하지 않는다

## 확인이 필요한 것
- 실제 TikHub 응답 필드는 아직 실키로 확인하지 못했다. 숫자가 비어 보이면 응답 한 건을 보고 `parse.ts` 만 고친다.
- 인스타그램 썸네일 주소는 만료되거나 다른 사이트에서 막힐 수 있다 (안 보이면 빈 칸).

## 테스트
`tests/unit/instagram.test.ts` — 응답 읽기(중복·사진 제외·해시태그), 1회·캐시·동시 요청·[더 보기]
