# 인스타그램 트렌드 찾기 (v0.9.53)

릴스는 YouTube 와 같은 영상을 올리므로, Instagram 메뉴는 **트렌드 찾기만** 둔다. 찾은 소재는 YouTube 영상 원고·영상 자동 제작으로 이어 간다.

- 화면: `/instagram/trends` (`features/instagram-trends/InstagramTrendExplorer.tsx`)
- 서비스: `lib/server/services/instagram-trends.ts` · Provider: `lib/server/providers/instagram/*` (registry `getInstagramProvider`)
- 업체: TikHub Instagram V2 — `GET /api/v1/instagram/v2/search_reels` (keyword, pagination_token). 공식 SDK(V5.3.2) 기준 경로. 응답 본문 구조는 문서에 없어 `parse.ts` 가 흔한 위치·이름(code, caption.text, play_count|ig_play_count|view_count, like_count, comment_count, taken_at, user.username, image_versions2…)을 너그럽게 읽고, 없는 값은 null 로 둔다.
- 키: API 연결 센터의 TikHub (샤오홍슈·도우인과 같은 키). 서버에서만, 로그·오류에 남기지 않는다.

## 비용 규칙
- [검색] 1번 = 1회, [더 보기] 1번 = 1회 (약 $0.01). 자동 재시도·자동 다음 페이지 없음
- 같은 사용자·검색어·페이지는 30분 기억 → 0회. 동시에 같은 요청은 1번으로 합침. 로그 `[IgSearch]` (clientRequestId)
- 정렬·기간 필터는 받은 결과 안에서 (추가 호출 없음). 결과는 저장하지 않는다

## 확인이 필요한 것
- 실제 TikHub 응답 필드는 아직 실키로 확인하지 못했다. 숫자가 비어 보이면 응답 한 건을 보고 `parse.ts` 만 고친다.
- 인스타그램 썸네일 주소는 만료되거나 다른 사이트에서 막힐 수 있다 (안 보이면 빈 칸).

## 테스트
`tests/unit/instagram.test.ts` — 응답 읽기(중복·사진 제외·해시태그), 1회·캐시·동시 요청·[더 보기]
