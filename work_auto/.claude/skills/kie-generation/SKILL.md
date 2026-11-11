---
name: kie-generation
description: work_auto 에서 Kie AI 로 이미지·영상을 만드는 기능 공통 규칙 — 모델·크레딧 비용, 확인 창, 다시 만들기, 상태 확인, Kie 서버 시간 초과 오류, 결과물 보관·3일 삭제. AI 숙소 영상·AI 패션·AI 메이크업·캐러셀 그림·상세페이지 이미지·AI 컷을 만들거나 고칠 때 쓴다.
---

# Kie 생성 공통

## 비용·모델 (1 크레딧 = $0.005, `AI_CLIP_CONFIG.creditUsd`)
- 이미지: `google/nano-banana(-edit)` 1장 = 4크레딧 (≈ $0.02) — 숙소 다른 각도, 패션 룩·플랫레이·언박싱, 캐러셀 그림.
- 사진→영상: `wan/2-6-flash-image-to-video` 5초 720p = 20크레딧 (≈ $0.10) — 숙소 AI 컷, 원고 영상 AI 컷 (`AI_CLIP_CONFIG.product`).
- 글→영상: `grok-imagine-video-1-5-preview` (`AI_CLIP_CONFIG.text`).
- 메이크업: `bytedance/seedance-2-mini` / `seedance-2-5` — `reference_video_urls`, 입력+출력 초로 과금.
- 실제 차감은 상태 확인 때 `creditsConsumed` 로 비용 대시보드에 기록 (`recordCostLater`).

## 호출 규칙 (safety-rules 와 같이)
- 만들기(createTask)는 확인 창 + `confirmed: true` 뒤에만, 1클릭 1번, 자동 재시도 없음. 확인 창에 장수 × 단가($)를 보여 준다.
- **다시 만들기는 고른 것만** (`keys`). 실패·안 만든 다른 항목을 같이 만들지 않는다.
- 상태 확인(`provider.status(taskId)`, 무료)은 만드는 중일 때만 6~8초마다. 응답이 늦게 오면 지금 보는 프로젝트일 때만, 그사이 저장한 게 있으면 버린다.
- 결과 주소는 오래 안 가니 필요한 결과(사진·미리보기 영상)는 받아서 저장소에 둔다 (`safeFetch`, https 만). 데모 모드(`mock://`)는 원래 사진 등으로 흐름만 시험.
- Kie 사진은 24시간이라 만들 때마다 `uploadImage`.

## 오류
- `upstream … timed out`: Kie 영상 모델 서버 시간 초과 (Kie 쪽 문제, 2026-11-10 부터 잦음) → '잠시 뒤 다시'로 안내, 실패 항목만 다시.
- `VideoAIError` AUTH·PAYMENT 면 남은 작업을 멈춘다.

## 결과물 보관
- 패션(out)·드라마(render)·메이크업(result/input)·캐러셀(slide)·상세페이지(s01/full) 결과물은 만든 지 **3일 뒤 삭제** (`lib/server/video/output-sweep.ts`). 숙소 AI 컷 미리보기는 1시간.
- 프로젝트 목록은 저장소 JSON, 저장할 때는 **쓰기 직전에 다시 읽어 그 항목만 바꾼다** (오래 걸리는 요청이 그사이 바뀐 것을 덮지 않게 — 숙소 `save`/`saveStatus` 참고).
