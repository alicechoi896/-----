# AI 드라마 스튜디오 (v0.9.81)

`/tools/drama-test` — 아이디어 → 영상 완성까지 8단계 쇼츠 드라마 제작. 기존 'AI 드라마 시험'(모델 비교)은 같은 화면의 **[모델 비교 시험]** 탭에 그대로 있다 (`features/drama-test`, `/api/drama-test/*` 변경 없음).

## 단계와 승인

| 단계 | 화면 | 서버 동작 |
|---|---|---|
| 01 아이디어 | 입력·장르·분위기·길이·비율 → 20개 카드 (선택·수정·개별 재생성·즐겨찾기·비슷한 5개) | `generate ideas / idea-one / similar` (AI 글) |
| 02 선택 | 고른 아이디어 수정·직접 작성·메모·AI 개선 제안 | `generate improve` |
| 03 로그라인 | 가제·로그라인 3개(선택/직접)·주제·목표·결핍·갈등·반전·결말·메시지·3초 후킹 | `generate story` |
| 04 등장인물 | 자동 생성·추가·삭제·개별 재생성·관계(ID 로 연결)·관계도 | `generate characters / character-one` |
| 05 캐릭터 시트 | 정면·측면·전신·표정·의상·추가 — 생성/업로드·버전·기준 고정·프롬프트 수정 | Kie 이미지 작업 |
| 06 시나리오 | 장면 수(기본 25)·결말·대사/연출 중심 → 줄거리·5막·장면(12개 필드+연속성) · 카드/전체 읽기 · 추가·삭제·순서·재작성·버전 | `generate scenario / scene-rewrite / parse-scenario / save-version / restore-version` |
| 07 스토리보드 | 장면마다 이미지(개별 작업) · 전체/한 장씩 · 끌어서 순서 · 교체·승인·다운로드 · 여러 장 일괄 업로드(파일명 번호 → 장면) | `generate en-prompts`, Kie 이미지 작업 |
| 08 영상 제작 | 모델·입력 방식·해상도·소리·길이 · 개별/묶음 · 프롬프트 수정 · 작업 목록(실패만 재시도) · 클립 비교·승인·업로드 교체 · 타임라인 · 최종 병합 | Kie 영상 작업, FFmpeg 병합 |

- 단계는 **앞 단계가 승인(또는 '중간부터 시작'으로 건너뜀)** 이어야 열린다 (`canEnter`). 자동 승인 없음.
- 승인한 단계를 고치면 그 단계는 '작업 중', 뒤에서 진행된 단계는 **'재검토 필요'** (결과는 지우지 않음, `markEdited`). 한 번 승인했던 단계는 고치는 중에도 뒤 단계를 잠그지 않는다 (`passed`).
- 승인할 때마다 버전 +1, 그때 내용을 `approvals[].snapshot` 에 남긴다 (화면 [승인 기록]).
- 중간부터 시작: 시나리오 / 캐릭터 시트 / 스토리보드(이미지 일괄 업로드 → 파일마다 장면 생성) / 영상 편집(클립 업로드).

## 저장 (DB 변경 없음)

테이블을 만들지 않고 기존 Storage 비공개 버킷 `videos` 를 쓴다 → 기존 정책(본인 폴더 + 관리자, 관리자 공용 데이터는 `getCurrentUserId()` 주인)이 그대로 적용된다.

```
{owner}/drama/index.json                      프로젝트 목록
{owner}/drama/{projectId}/rev/{번호}_{임의}.json  프로젝트 문서 — 저장마다 새 파일, 최신 15개 (v0.9.86: 같은 이름을 덮어쓰면 CDN 캐시로 예전 내용을 읽었다)
{owner}/drama/{projectId}/img/{task}.png      AI 이미지 (Kie 결과를 복사해 영구 보관)
{owner}/drama/{projectId}/clip/{task}.mp4     AI 영상
{owner}/drama/{projectId}/up/…                사용자가 올린 이미지·영상·음악
{owner}/drama/{projectId}/render/r{n}_….mp4   최종 병합 결과
```

- 화면은 부분별 자동 저장 (1.2초, `PATCH { section, value }`). 서버가 만든 이미지·클립·작업은 화면 저장이 덮지 않게 id 로 합친다 (`saveMerged`, `mergeImages`, `mergeClips`).
- 등장인물 `c_…`, 장면 `sc_…` 내부 ID 로 연결 — 이름을 바꿔도 연결 유지.
- 파일 보기는 서명 주소(1시간), Kie 에 넘기는 참고·첫 프레임 이미지는 서명 주소(24시간). Kie 결과 주소는 만료되므로 끝나면 바로 Storage 로 복사.

## Kie 모델 (docs.kie.ai, 2026-10-30 확인 — `lib/drama-studio/models.ts`)

| id | Kie model | 방식 | 길이 | 해상도 | 참고 이미지 | 최소 단가 |
|---|---|---|---|---|---|---|
| seedance-2-fast (기본) | bytedance/seedance-2-fast | 첫 / 첫+끝 / 참고 / 글 | 4~15초 | 480p·720p | 9 | 6.8 크레딧/초 |
| seedance-2 | bytedance/seedance-2 | 〃 | 4~15초 | ~1080p | 9 | 11.5 |
| seedance-2-5 | bytedance/seedance-2-5 | 〃 | 4~30초 | ~1080p | 30 | 17 |
| kling-3 | kling-3.0/video | 첫 / 첫+끝 / 인물 요소(@이름) / **멀티 샷** / 글 | 3~15초 | std·pro | 요소 3개×2~4장 | 14 |
| minimax-h3 | minimax-h3/reference-to-video | 참고만 | 4~15초 | 768P·2K | 9 | 공개 가격 없음 |

이미지: `google/nano-banana`(글만), `google/nano-banana-edit`(참고 이미지 최대 10장) — 4 크레딧/장부터. 기준 이미지가 없으면 글만 모델로 자동 전환.

- **입력 방식은 서로 배타적**: 첫 프레임 / 첫+끝 프레임 / 참고 이미지는 한 요청에 하나만 (`buildVideoInput`, 보내기 전 `hasConflictingInputs` 재확인). 화면과 서버가 같은 `validateVideo` 를 쓴다.
- 한 요청 길이는 모델 최대를 넘지 않는다. 긴 드라마는 장면별 요청 → 타임라인 병합.
- **묶음 생성**: Kling 3.0 멀티 샷(최대 5장면, 컷 1~12초, 합 3~15초, 첫 장면 이미지만 첫 프레임)만 순서대로 만든다. 다른 모델의 '참고 이미지' 묶음은 "장면 순서와 컷 전환을 보장하지 않음"을 표시.
- 프롬프트(`lib/drama-studio/prompts.ts`): `[FORMAT] [REFERENCES] [SUBJECT] [ACTION] [DIALOGUE] [ENVIRONMENT] [CAMERA] [LIGHTING] [COLOR & TEXTURE] [SOUND] [CONSTRAINTS]`. Kling 인물 요소만 문서에 있는 `@이름` 문법, 나머지는 문서에 참조 문법이 없어 "reference image N" 으로 글로 설명 (`@Image1` 쓰지 않음). 한국어 시나리오 → 영어 조각은 `generate en-prompts` (AI 글).

## 비용·호출 규칙

- 이미지·영상은 **확인 창**(작업 수·최소 예상 크레딧·$) 뒤에만 실행 — 서버도 `confirmed: true` 가 없으면 거절.
- 같은 `clientRequestId` 는 다시 만들지 않는다 (저장된 작업 + 진행 중 Map). 자동 재시도 없음. 키·잔액 오류면 남은 작업은 만들지 않음.
- 실패한 작업만 골라 다시 (`retryTaskIds`, 확인 창). 성공한 결과는 그대로.
- 예상은 kie.ai 공개 '최소 단가' 기준, 실제 사용량은 Kie `creditsConsumed` 를 작업마다 따로 표시.
- 상태 확인(무료)은 화면이 열려 있을 때 10초마다, 다시 들어오면 바로. **콜백은 쓰지 않는다**: 서버에 서비스 키를 두지 않아(Storage 쓰기는 로그인 세션 필요) 콜백 요청으로는 프로젝트를 저장할 수 없기 때문. 페이지를 떠나도 Kie 작업은 계속되고, 다시 열면 결과를 가져온다.

## 최종 병합 (`lib/server/drama-studio/render.ts`)

타임라인 순서대로 승인 클립 → 앞뒤 다듬기 → 비율 맞춤(여백, 잘리지 않음) 720p·30fps → 원본 소리 켜기/끄기(무음 트랙) → 페이드(선택) → concat → 배경음악(반복·볼륨·끝 1.5초 페이드) → 제목 메타데이터 → Storage. 응답 뒤 `after()` 로 같은 함수에서 (최대 800초). 최대 80클립·10분, 결과 48MB 이하 (Supabase 무료 50MB). 실패해도 클립은 그대로, 15분 넘게 '진행 중'이면 실패 처리.

## API

| 메서드 | 경로 | |
|---|---|---|
| GET/POST | `/api/drama-studio` | 모델·목록 / 새 프로젝트 `{title, settings, startStep}` |
| GET/PATCH | `/api/drama-studio/:id` | 열기(진행 작업 상태 확인) / 부분 저장 |
| POST | `/:id/approve` `{step}` | 단계 승인 |
| POST | `/:id/generate` `{action,…}` | AI 글 (maxDuration 300) |
| POST | `/:id/images` `{jobs, modelId, clientRequestId, confirmed}` | Kie 이미지 |
| POST | `/:id/videos` `{jobs | retryTaskIds, clientRequestId, confirmed}` | Kie 영상 |
| POST | `/:id/sync` | 상태 확인·결과 보관 |
| POST | `/:id/upload-url` → `/:id/register` | 직접 올리기 (서명 주소) → 단계에 잇기 |
| POST | `/:id/render` | 최종 병합 (maxDuration 800) |
| GET | `/:id/export` | 기획 Markdown |

권한: 기존 기능 키 `drama-test` (`requireAccess`). Kie 키는 기존 **API 연결 센터의 Kie AI** (사용자별 암호화 저장, 브라우저에 노출 안 됨) — 새 환경변수 없음.

## 테스트

- `tests/unit/drama-studio-rules.test.ts`: 모델 범위·배타 입력·멀티 샷·예상 크레딧·프롬프트 문법·단계 규칙
- `tests/unit/drama-studio-flow.test.ts`: Mock AI·Mock Kie 로 아이디어 → 25장면 → 스토리보드 25컷 → 개별·묶음 영상 → 일부 실패 → 실패만 재시도 → 타임라인 순서 변경 → 실제 FFmpeg 병합 → 다시 열기 → 앞 단계 수정 시 재검토, 스토리보드부터 시작(업로드)
