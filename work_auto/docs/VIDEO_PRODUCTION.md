# 영상 자동 제작 (v0.9.51)

YouTube Shorts·NAVER 클립용 9:16 영상(1080×1920)을 2단계 대본으로 자동으로 만든다. 사람이 하던 브루 편집(컷 배치·자막·상단 제목·화살표·효과음·배경음악·엔딩)을 규칙으로 고정했다. 사람은 **검수 → 문제 컷만 교체 → 승인 → 업로드 예약**만 한다.

- 화면: `/youtube/video-production`, `/naver-clip/video-production` (공통 `features/video-production/VideoProductionWorkspace.tsx`)
- 엔진: `lib/server/video/*` (Vercel 함수 안에서 FFmpeg = `ffmpeg-static`)
- 설정(숫자·디자인): `lib/video-production/config.ts` — 상단 제목·자막·엔딩 템플릿, 화살표 위치·각도, 효과음 간격, 무음·크롭·블러 값
- 자료: `assets/video/{bgm,sfx,arrow,ending,meme,fonts}` (사용 권한이 확실한 자체 자료만)

## 흐름

```
① 대본 고르기 (2단계 결과 1개 + 대본 1~3 중 1편)    ← 2단계 결과의 [이 제목으로 영상 만들기]
② 소재: 샤오홍슈만 / 섞기 / AI만(준비 중) · 영상 고르기(제품 연결 먼저) · AI 음성
[컷 계획 만들기]  POST /api/video-production/plan   — AI 1회(화면용 짧은 제목)
③ 컷 확인: 상단 제목 2줄, 컷마다 자막·클립(교체 가능)·효과음·화살표·엔딩
[영상 만들기]     POST /api/video-jobs              — 작업 생성 후 바로 응답, 렌더는 after() (maxDuration 300)
④ 진행(3초마다 GET /api/video-jobs/:id) → 미리보기·자동 검사·컷별 원본 글자 처리
   [바꾼 클립으로 다시 만들기] POST /api/video-jobs/:id/rerender (컷 계획 AI 재호출 없음)
   [다운로드 (1회)] POST /api/video-jobs/:id/download   [검수 완료] → [업로드 예약하기]
```

## 컷 = 대본 한 줄

- 대본 한 줄(말 한 마디) = 한 컷 = 자막 한 줄. 긴 줄은 비슷한 길이로 쉼표·띄어쓰기에서 나눈다 (`splitScript`, AI 0회). 최대 30컷.
- 상단 2줄: 1줄 제품명(짧게), 2줄 화면용 짧은 제목/Hook. **선택한 제목은 바꾸지 않는다** (`selectedTitle` 그대로, 화면용만 AI 1회로 줄임 · 실패하면 규칙으로 자름).
- 원본 배치: 제품 연결 영상 먼저, 같은 원본이 이어지지 않게 돌아가며 (`assignSources`). 사람이 바꾼 컷은 `pinned`.
- 효과음: 대략 2컷당 1회, 첫 컷(Hook)은 항상, 숫자·비교·장점·CTA 직전 컷 우선, 연속 금지, 최대 8회 (`sfxSceneIndexes`). 같은 효과음이 이어지지 않게 돌아가며.
- 화살표(제품 버튼 쪽): 4번째 컷 + 10컷 이상이면 60% 지점 (`arrowSceneIndexes`). 왼쪽 화살표 GIF 를 -90°(아래)로 돌림 — `ARROW_PLACEMENT`.
- 엔딩: 마지막 컷에 '최저가 / 구매링크'(레시피코리아체) + 아래로 휘는 화살표(30° 기울임). 마지막 컷은 자막 대신 엔딩 (음성은 그대로).

## 렌더 순서 (`lib/server/video/render.ts`)

1. 원본 받기 — 샤오홍슈 노트 → 재생 주소(페이지, 막히면 TikHub 상세 1회) → xhscdn 에서 임시 폴더로 (80MB 제한, 허용 도메인만). **원본은 남기지 않는다.**
2. 원본 글자 검사 — 클립마다 약 1초 간격 최대 16장 → AI 이미지 읽기(8장당 1회)로 글자 상자(0~1 비율)
3. AI 음성 — 컷마다 OpenAI TTS 1회 → 앞뒤 무음 제거(-40dB) → 컷 길이 = 음성 + 0.1초 호흡 (마지막 컷 +0.6초)
4. 컷마다 원본 구간 고르기 — 0.5초 간격으로 후보 구간을 보고 글자 처리 순위가 가장 좋은 구간, 같은 원본의 겹치는 구간은 다시 쓰지 않음
5. 컷 영상(1080×1920 꽉 채우기, 30fps) → 컷 잇기(다시 인코딩 없음) → 상단 띠·제목·자막·화살표·엔딩 → 내레이션 + 배경음악(반복, 0.12) + 효과음(0.55, 컷 시작) → mp4(H.264/AAC, faststart)
6. 자동 검사 → 저장소 업로드 → 임시 폴더 삭제

글자·글꼴 파일은 임시 폴더 안 상대 경로로, 명령은 인자 배열로 넘긴다 (셸 없음 → 명령 주입 불가, 제목·자막은 `textfile=`).

## 원본 글자 처리 (우선순위)

`decideTreatment()` — 그 구간 양옆 샘플까지 합친 상자 + 시간 여유(0.3초) + 테두리 여유(4%)로 판단한다. 샘플 사이는 '모른다'로 보고 넉넉하게 가린다 → 어떤 프레임에서 가려지고 어떤 프레임에서 보이는 일을 막는다.

1. **글자 없는 구간** (또는 상단 검은 띠가 덮는 위치) → clean
2. **확대·크롭** — 아래쪽 자막은 위쪽만, 위쪽 글자는 띠 아래까지 오도록. 최대 확대 1.35배 (`maxCropZoom`) → crop
3. **블러** — 가운데 작은 글자(화면의 18% 이하)는 그 구간 내내 같은 상자를 블러 → blur
4. **제외** — 그래도 안 되면 다른 원본을 찾고, 없으면 그 컷을 '확인 필요'로 → rejected
5. AI 가 이미지를 못 읽으면(데모·미연결) unchecked → 영상은 **검수 필요**

## 자동 검사 → 상태

검은 화면(blackdetect), 0.8초 넘는 무음(silencedetect), 영상·음성 길이 차이, 효과음 수, 컷별 글자 처리 결과, 음성 여부.
`completed`(모두 통과) / `needs_review`(확인 필요 컷·검은 화면·음성 없음 등) / `failed`. 사람이 [검수 완료] → `approved`.
10분 넘게 진행이 없으면 실패로 정리한다.

## 저장·정리

- DB: `video_jobs` (추가만, 본인 + 관리자, schema.sql v0.9.51). 계획·검사 요약만 jsonb 로. 원본 프레임·FFmpeg 로그는 저장하지 않는다.
- 완성 mp4: Supabase Storage 비공개 버킷 `videos/{user_id}/{job_id}.mp4`. **1회 다운로드**: 받은 뒤 1시간, 안 받아도 7일 뒤 삭제 (목록을 열 때 정리). 데모는 서버 메모리.
- 원본(reference_videos)은 바꾸지 않는다.

## 외부 호출 (영상 1편)

| | 횟수 |
|---|---|
| YouTube·NAVER·Bright Data·TikHub 검색 | 0 |
| TikHub 노트 상세 | 샤오홍슈 페이지가 막힌 원본만 1회씩 (10분 기억) |
| AI 이미지 읽기(원본 글자) | 원본마다 1~2회 |
| AI 음성(OpenAI TTS) | 컷 수만큼 |
| AI 화면용 제목 | 1회 (컷 계획) |
| Kie AI (AI 컷) | [AI 컷 만들기]를 누를 때만 컷 수만큼 (+ 영어 프롬프트 AI 1회). 상태 확인·렌더 때 결과 받기는 무료 |

## AI 컷 (v0.9.60, Kie AI) — **v0.9.71 에서 뺐다**

> v0.9.71: 영상 자동 제작은 **고른 샤오홍슈 영상만**으로 잘라 붙인다. 화면의 소재 선택(섞기·AI만)·AI 컷 칸과 `/api/video-production/ai-clips*` 를 없앴고, 계획·검사는 항상 sourceMode = xhs (예전 계획의 aiClips 는 무시). 아래는 예전 기록 (lib/server/video/ai-clips.ts 는 렌더의 예전 작업 호환용으로만 남김). Kie 키는 AI 드라마 시험에서 씀.


- Provider: `lib/server/providers/video-ai/kie.ts` (registry `getVideoAIProvider`, API 연결 센터 `kie`). 서비스: `lib/server/video/ai-clips.ts`. 모델·가격은 `AI_CLIP_CONFIG` (lib/video-production/config.ts)
- 계획: 소재 '섞기'·'AI만' + AI 컷 수(1~10) → `plan.aiClips` (ai1…), 컷의 `sourceVideoId = "ai:ai1"`. 섞기는 고르게 n 컷(고정), AI만은 모든 컷을 돌아가며. 이때 Kie 호출 0
- [AI 컷 만들기] `POST /api/video-production/ai-clips`: 아직 안 만든(또는 실패한) 컷만, 컷 1개 = Kie 작업 1개(과금). AI 1회로 영어 프롬프트. 자동 재시도 없음, 키·잔액 오류면 나머지 중단, 같은 clientRequestId 동시 1번. 로그 `[KieClip]`
  - product: 제품 사진(그 원고 제품의 사진만) → 720×1280 JPEG(흐린 배경 + 가운데 제품) → Kie 파일 올리기(무료, 24시간) → `wan/2-6-flash-image-to-video` 5초 720p audio:false (20크레딧 ≈ $0.10)
  - text (v0.9.61): `grok-imagine-video-1-5-preview` (사진 없이 = 글 → 영상) 9:16 5초 720p, 초당 4.5크레딧 = 22.5크레딧(약 $0.11). 소리는 항상 만들어지지만 렌더할 때 뺀다 (-an). 끝나면 creditsConsumed 표시
- 상태 `POST /api/video-production/ai-clips/status` (recordInfo, 무료) — 화면이 만드는 중일 때 20초마다
- 작업 번호는 브라우저 localStorage(`vp-ai-clips:{contentId}:{script}`, 비밀값 아님)에 남겨 같은 대본 계획을 다시 만들어도 이어서 쓴다
- [영상 만들기]: 쓰는 AI 컷이 모두 success 여야 한다 (아니면 AI_NOT_READY). 렌더할 때 taskId 로 결과 주소를 새로 받아(화면이 보낸 주소를 믿지 않음) 임시 폴더에 받고 지운다. AI 컷은 글자 검사 없이 '글자 없음', 짧으면 반복(stream_loop), 여러 컷에 시작 위치를 바꿔 나눠 쓴다
- 받지 못한 AI 컷은 검사 결과에 이유를 남기고 다른 영상으로 채운다

## 음성·자막·AI 컷 옵션 (v0.9.63)

- 음성: `VOICE_OPTIONS` 13가지 + 말투 `VOICE_STYLES` (TTS instructions). `POST /api/video-production/voice-preview` 미리 듣기 (OpenAI 1회, mp3)
- 자막: `plan.captionStyle` { font: jua|dohyeon|recipe|pretendard, color #RRGGBB, stroke #RRGGBB|none, size s|m|l } → `renderCaption` (cleanCaptionStyle 로 검사)
- 샤오홍슈 원본: 영상 서버 주소 제한 없음 (xhscdn·rednotecdn 등). safeFetch 가 내부망을 막는다
- AI 컷: 사람은 현대 한국인(KOREAN_PEOPLE 문장을 모든 프롬프트에), `plan.aiPrompt` 공통 프롬프트(최대 2,000자), 제품 사진 직접 올리기 `POST /api/video-production/ai-clips/image` (9:16 → Kie 파일)

## 컷 매칭·주목 효과·엔딩 (v0.9.64)

- 컷 원본 고르기: 정한 원본 → 같은 종류의 다른 원본. **AI 컷(ai:…)은 AI 로 정한 컷에만** 후보가 된다. 샤오홍슈 원본이 하나도 안 되면(받기 실패·rejected) AI 컷으로 대신하고 `scene.issue` 에 이유
- 주목 효과: `scene.attention` (planner: `attentionSceneIndexes` — 효과음 컷 중 첫·마지막·화살표 컷 제외, 최대 4). 렌더: assets/video/meme GIF 가 있으면 GIF, 없으면 `renderSticker`(canvas) PNG → overlay x=650, y 가 sin 으로 튀게, 컷 앞 1.4초
- 엔딩 컷 길이 ≥ `endingMinSec` 2.5초 (음성은 뒤를 무음으로 채움)

## 아직 안 된 것 (다음 단계)

- AI 컷: 제품 사진 직접 올리기, 모델 고르기 (Kling·Seedance 등), 드라마(인물 참고 사진·대사 음성 유지)
- 움직이는 글자 추적 블러, 제품 중심 리프레이밍, 장면 의미 맞추기(Vision 캡션 → 대본 매칭)
- 최종 영상 글자 재검사(AI 이미지 읽기), 웃긴 짤(Giphy 선택 기능, 저작권 확인 필요 안내), 구글 드라이브로 보내기

## 테스트

- `tests/unit/video-render.test.ts` — 컷 나누기, 효과음·화살표 규칙, 글자 처리 판단, 실제 FFmpeg 렌더(데모 시험 영상)
- `tests/api/flows.test.ts` "영상 자동 제작(데모)" — 대본 → 계획 → 렌더 → 검수 필요 → 1회 다운로드 → 승인, 동시 2개 막기
