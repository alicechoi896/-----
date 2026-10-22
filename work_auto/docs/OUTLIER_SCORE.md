# 아웃라이어 점수 (v0.9.34, 품질 2단계)

YouTube 트렌드 찾기 › 트렌드 영상 표에서 **[아웃라이어 점수 계산]**을 누르면 "아웃라이어" 열이 채워집니다.

## 계산

```
점수 = 이 영상 조회수 ÷ 같은 채널 최근 업로드 15개 조회수의 중앙값
```

- 3배 이상이면 **터진 영상** 배지를 붙입니다(`OUTLIER_CONFIG.hitRatio`, `lib/domain/outlier.ts`).
- 표본이 5개 미만이거나 중앙값이 0이면 "비교 불가"로 둡니다.
- 구독자가 많은 채널의 높은 조회수와, 내용 덕분에 평소보다 터진 영상을 구분하기 위한 점수입니다. 터진 영상의 제목은 [대본 포맷에 담기]로 모아 제목 패턴으로 씁니다.

## YouTube 할당량 (사용자 키)

| 호출 | 비용 |
|---|---|
| 채널 최근 업로드 `playlistItems.list` (업로드 재생목록 = "UU" + 채널 ID 뒷부분, channels.list 없음) | 채널당 1 unit |
| 조회수 `videos.list` (statistics) | 영상 50개당 1 unit |

- 검색 결과 50개(채널 40개)면 약 40 + 12 = 52 units로, 트렌드 검색 1번(약 102 units)의 절반 정도입니다.
- 버튼을 누를 때만 계산합니다(자동 계산 없음).
- 채널별 최근 조회수는 서버 메모리에 6시간 기억합니다. DB에는 저장하지 않습니다.
- 호출 한도는 `youtube-outlier` 1분 10회입니다.

## 구조

- `lib/domain/outlier.ts`: 중앙값·점수·터진 영상 판정 (화면·서버 공용)
- `lib/server/services/youtube-outlier.ts`: 채널 기억과 계산
- `POST /api/trends/youtube/outliers` { items: [{ videoId, channelId, views }] } → `requireAccess("yt-trends")`
- `YouTubeTrendProvider.getChannelRecentVideoIds()`: 실제 API와 데모(가짜 ID 15개)

## 채널 정보 · 최근 6개월 뜬 영상 (v0.9.61)

- 트렌드 표·영상 상세의 **채널 이름**을 누르면 `ChannelDrawer` (features/youtube-trends) → `GET /api/trends/youtube/channel?channelId=`
- `YouTubeTrendProvider.getChannelInsight(channelId, 180)`: channels.list 1 + 업로드 재생목록 playlistItems.list 페이지당 1 (최신순, 180일보다 오래된 영상이 나오면 멈춤, 최대 4페이지 = 200개) + videos.list 50개당 1 → **약 3~9 units** (돈 0, 하루 무료 할당량 안)
- `channelRatios()` (lib/domain/outlier.ts): **Shorts·롱폼 따로 조회수 중앙값**(표본 5개 이상), 영상마다 배수. 1.5·2·3배 거르기는 화면에서 (추가 호출 없음)
- 같은 채널은 서버 메모리 30분 기억 (공개 정보라 사용자 사이에 같이 씀, 0 units), 동시 요청 1번. 로그 `[YtChannel]`. 호출 한도 `youtube-outlier`

## 한계

- 업로드 목록에는 쇼츠와 롱폼이 섞여 있어, 둘을 다 올리는 채널은 점수가 덜 정확합니다.
- 최근 15개에 오래된 영상이 포함되면 중앙값이 높게 나올 수 있습니다(누적 조회수 기준).
- 데모 모드는 채널 최근 조회수가 가짜 값이라 점수가 크게 나옵니다.
