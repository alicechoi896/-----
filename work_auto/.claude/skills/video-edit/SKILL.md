---
name: video-edit
description: work_auto 영상 편집(원고로 영상 만들기 /youtube/video-production, 제품 영상 자동 제작 /youtube/auto-video)의 편집 프리셋과 렌더 구조 — 제품 정가운데, 원본 자막·중국어 가리기, 대사-장면 매칭, 선명도, 자동 검수, 원본 보관. 영상 렌더·컷 고르기·확대·자막 가리기·검수·장면 매칭을 고치거나 사용자가 영상 결과에 불만을 말할 때 쓴다.
---

# 영상 편집

## 편집 프리셋 (사용자가 정한 기본 규칙 — 모든 영상)
1. 제품 기준으로 화면 **정가운데**, 제품이 잘리지 않게 (고치라고 한 컷만이 아니라 전부).
2. 원본 속 자막·로고·워터마크는 **확대로 가리고**, 안 되면 제품을 가리지 않게 깔끔한 블러.
3. 대사와 맞는 장면 — 직접 찾아 매칭 (배터리처럼 보여 주기 어려운 말 → 착용·사용 장면, 빈 상자·배경 금지. 수영 → 물·바다 장면).
4. 화질 **선명**한 장면 (흐림·초점·흔들림 피함).
5. 제품·기기 화면 속에 **중국어가 보이는 장면은 쓰지 않음**.

### 과하면 안 되는 것 (사용자 지적)
- 자동 확대 최대 **1.7배** (`VIDEO_RENDER_CONFIG.autoCropMaxZoom`), 넘는 글자는 블러. 사람이 정한 화면 한도 2.4배는 별개.
- **제품 자체의 이름·브랜드 로고·모델명은 가릴 글자가 아니다**.
- 자동 검수는 **그 컷에 정한 영상 안에서만** 다른 구간을 고른다. 고르지 않은 다른 영상으로 바꾸지 않고, 시작 초·화면을 직접 정한 컷은 손대지 않는다.

## 구조 (파일)
- `lib/server/video/render.ts` — 컷마다 원본 구간 고르기 → 인코딩 → 자동 검수 → 이어 붙이기.
  - 고르는 순서: 사람이 정한 시작 초(`startAt`) → 영상 구간(`rangeOf`/`sequentialStart`) → AI 컷 → 바로 앞 컷과 같은 영상이면 이어서(`prevPick`) → `pickSegment`.
  - 사람이 정한 화면(`cutWindows`/`manualFilter`)도 `guardWindows`(window-guard.ts)로 글자가 보이면 더 확대.
- `lib/server/video/text-scan.ts` — 원본 프레임 AI 검사(`scanText`, `SCAN_VERSION` — 프롬프트를 바꾸면 올린다, 올리면 원본마다 한 번 다시 검사): 글자 상자·제품 위치(`product`)·제품 속 중국어(`cn`)·점수·장면 설명. `decideTreatment`/`findCrop`/`coverAll`/`centerOn`(제품 가운데). `pickSegment` 감점: 중국어 12, 제품 안 보임 9.
- `lib/server/video/scene-match.ts` — 대본 줄 ↔ 장면 설명 매칭 (AI 1회). 맞는 장면 없으면 `findHint`(검색어) → 화면 [맞는 원본 찾기] (누를 때만 TikHub 1번).
- `lib/server/video/cut-review.ts` — 자동 검수 (컷마다 프레임 2장, `getVisionProvider` = OpenAI 우선, `OPENAI_VISION_MODEL`). 최대 `qaRounds` 10번, `qaBudgetMs` 560초.
- 자동 제작(`lib/server/automation/auto-video.ts`)도 같은 plan → `renderVideo` 를 쓴다 → 규칙이 같다 (사람이 컷마다 손으로 고치는 것만 없음).

## 저장 공간
- 원본 보관: 7일·합계 3GB (`sourceCacheDays`, `sourceKeepMaxBytes`, `vault.ts enforceSourceQuota`).
- 완성 영상: 다운로드 1시간 뒤 · 7일 (`videoJobService.cleanup`). 매시간 크론 `/api/cron/cleanup`.

## 고칠 때
- 가전 영상 동작을 바꾸는 변경은 신중히 — 숙소 등은 `job.plan.stay` 로 가둔다.
- 테스트: `tests/unit/video-render.test.ts`, `video-qa.test.ts`, `window-guard.test.ts`, `product-center.test.ts`. 테스트 mock 에 `getVisionProvider` 도 넣는다.
- 사용자 스크린샷의 문제는 "어떤 규칙이 왜 안 먹었는지"를 코드에서 찾아 원인과 함께 보고한다.
