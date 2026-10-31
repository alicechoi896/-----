# AI 드라마 시험 (v0.9.62)

같은 인물 사진·같은 장면을 여러 AI 영상 모델로 만들어 **인물 유지 · 한국어 대사 · 움직임**을 비교한다. 결과를 보고 드라마 모드에 쓸 모델을 고른다.

- 화면: AI 드라마 › AI 드라마 스튜디오 › [모델 비교 시험] 탭 `/tools/drama-test` (v0.9.116 부터 AI 드라마 메뉴) (`features/drama-test/DramaTestWorkspace.tsx`), 기능 id `drama-test`
- 서버: `lib/server/drama/service.ts` · 프롬프트 `lib/drama/prompt.ts` · 모델·가격 `lib/drama/config.ts` · Provider `lib/server/providers/video-ai/kie.ts` (`uploadImage`, `createTask`)

## 흐름
1. 인물 사진 → 브라우저가 긴 쪽 1536px JPEG 로 줄여 `POST /api/drama-test/upload` → 서버가 전신 + 얼굴 확대(위 38%) JPEG 를 만들어 **Kie 파일 올리기(무료, 24시간)** → 주소 2개. 우리 서버에는 남기지 않는다
2. [시험 만들기] `POST /api/drama-test/create` → **장면 × 모델 = Kie 작업 수 (각 1회 과금)**. 자동 재시도 없음, 키·잔액 오류면 나머지 중단, 같은 clientRequestId 동시 1번. 로그 `[DramaTest]`
3. 상태 `POST /api/drama-test/status` (recordInfo, 무료) — 만드는 중이면 화면이 20초마다
4. 결과 영상은 Kie 에 14일 — 화면에서 재생·받기. 작성 내용·작업 번호는 브라우저 localStorage `drama-test:v1` (비밀값 없음)
- 인물 사진 주소는 Kie 파일 주소(redpandaai.co 등)만 받는다 (다른 주소를 모델에 넘기지 않음)

## 모델 (9:16, 8초, 소리 = 영상 모델이 직접)
| 모델 | id | 요청 | 8초 가격 |
|---|---|---|---|
| MiniMax H3 | `minimax-h3/reference-to-video` | reference_image_urls(인물 사진), aspect_ratio "9:16", duration 8(정수), resolution "768P" (기본이 2K 라 꼭 지정). 소리는 항상 | 64크레딧 ≈ $0.32 |
| Seedance 2.0 Mini | `bytedance/seedance-2-mini` | reference_image_urls, aspect_ratio "9:16", duration 8, resolution "720p", generate_audio true | ≈ 66크레딧 ≈ $0.33 |
| Kling 3.0 | `kling-3.0/video` | kling_elements [{ name "char1", description, element_input_urls [전신, 얼굴] }] (프롬프트에서 @char1), sound true, duration "8"(문자열), aspect_ratio "9:16", mode "std", multi_shots false | 160크레딧 ≈ $0.80 |

프롬프트: 영어 틀 + 한국어 장면 설명 + 한국어 대사 그대로 ("spoken aloud in natural Korean"). MiniMax·Seedance 는 참고 사진 순서("reference image 1")로 인물을 가리킨다 (문서에 참조 문법이 없음).

## 한계·다음 단계
- 한국어 대사 지원을 밝힌 모델은 Kling 3.0 뿐 — 직접 들어 보고 고른다
- 실제 사람 사진은 동의 없이 쓰지 않는다 (화면 안내)
- 다음: 고른 모델로 '드라마 모드' (장면 이어 붙이기·자막·배경음악, 인물 사진 보관)
