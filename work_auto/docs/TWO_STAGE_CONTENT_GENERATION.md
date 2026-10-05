# 2단계 콘텐츠 생성 (v0.9.40)

영상·클립 원고(대본·제목·Hook 이 있는 기능)는 **제목을 먼저 고르고, 고른 제목에 맞춰 대본을 만든다.**
제목과 대본이 따로 놀던 문제(제목 40개 + 대본 3편을 한 번에 만들어 대본이 어느 제목에도 맞지 않음)를 없앤다.

| 기능 | 흐름 |
|------|------|
| `yt-product-video` · `yt-info-video` · `clip-product-content` · `clip-info-content` | **2단계** (아래) |
| `blog-product-writing` · `blog-info-writing` · `blog-auto-writing` | 기존 1회 생성 + 생성 전에 NAVER Keyword Intelligence (입력 추가 없음) |

대상 판정: `supportsPrecise(config.outputs)` (`lib/generators/quality.ts`) — script·titles·hooks 가 모두 있으면 2단계.

## 1단계: 제목·Hook·CTA 후보

`POST /api/contents/stage1 { featureId, input, clientRequestId }` → `contentGenerationService.stage1`

1. `prepare()` — 입력 검사·Context(프로필·제품·스타일·포맷·학습)
2. **Keyword Intelligence** (`collectIntel`) — 플랫폼 API 는 **여기서만** 부른다 (docs/KEYWORD_INTELLIGENCE.md)
3. 출력 중 `topics`·`titles`·`hooks`·`ctas` 만 AI 1회로 생성 (+ `title_top` 추천 5개·이유)
4. 저장: `generated_contents` 1행. `context.workflow = { id, stage: 1, keywordIntelligence }`, `context.quality.titleTop`

## 2단계: 고른 제목마다 대본·키워드·태그·설명

`POST /api/contents/stage2 { stage1Id, title, hook, cta }` → `contentGenerationService.stage2`

- 제목을 여러 개 고르면 **화면이 제목마다 한 번씩 차례로** 부른다 (진행 표시, 실패한 제목만 [실패한 제목 다시]).
- 1단계 행의 입력·Keyword Intelligence 를 그대로 쓴다 → **플랫폼 API 0회**, Bright Data 0회, AI 1회.
- 규칙: 제목·Hook·CTA 를 바꾸지 않는다. 대본 3편은 제목의 약속을 실제로 전달하고 서로 다른 구조(제품: 문제 해결·결론 선공개·비교 판단 등 / 정보: 리스트·오해 바로잡기·단계별 등). 첫 줄 = Hook, 마지막 = CTA.
- 키워드: `primary_keyword` 1개 + `related_keywords [{keyword, intent}]` (Keyword Intelligence 후보에서 고름). `keywords` 출력은 핵심 + 관련으로 덮어쓴다. 태그·해시태그는 키워드에서 파생, 중복 제거. 설명은 제목·대본과 같은 약속.
- 저장: 제목마다 `generated_contents` 1행. `context.workflow = { id, stage: 2, stage1Id, selected: {title, hook, cta}, primaryKeyword, relatedKeywords }`, `headline = 제목`, `quality.scripts[].angle = 구조 이름`.

## 같은 제목 안에서 대본 추가

2단계 결과의 [추가 만들기] = 기존 `POST /api/contents/:id/regenerate { key: "script" }`.
`regenerateSection` 이 workflow 를 보고 1단계 Keyword Intelligence 를 다시 쓰고, "[2단계 · 같은 제목으로]" 지시(제목·Hook·CTA·핵심 키워드)를 붙인다 → 플랫폼 API 0회.
1단계 후보의 [추가 만들기]도 같은 API (titles·hooks·ctas).

## 화면

`ContentGenerator` → 1단계 결과면 `TwoStageWorkspace` (`features/content-generator/TwoStageWorkspace.tsx`)
- Keyword Intelligence 요약 (출처·표본 수·후보 키워드·데이터랩 상대 관심도)
- 제목 체크박스(최대 5개, ★ 추천 TOP 5 와 이유), Hook·CTA 라디오, 각 [추가 만들기]
- [선택한 제목 N개로 대본 만들기] → 제목별 탭 + 고른 제목·Hook·CTA·핵심 키워드 머리글 + `ResultPanel`(2단계 출력만)
- 생성 버튼은 `busyRef` 로 클릭 즉시 잠금, `clientRequestId` 전송 (버튼 1번 = 요청 1번)

## 이력

DB 변경 없음 (`generated_contents.context` jsonb).
- 최근 생성 이력에는 1단계·일반 결과만 보이고, 1단계 행에 "대본 N개 제목"을 표시. 누르면 그 1단계와 연결된 2단계 결과가 탭으로 열린다.
- 예전 결과(workflow 없음)는 예전처럼 `ResultPanel` 로 열린다. 예전 정밀 생성 결과의 뼈대 체크·검토 메모도 그대로 보인다.
- 프롬프트 성과(PROMPT_STATS)는 workflow 가 있으면 생성 방식 `two-stage`("2단계")로 따로 묶는다.

## 없어진 것

- 정밀 생성(AI 4회, `/api/contents/generate/precise`, `content.precise-*` 템플릿, 빠른/정밀 토글). 2단계 생성이 대신한다.

## 테스트

- `tests/api/flows.test.ts` "2단계 생성(데모)": 1단계 후보·Keyword Intelligence → 제목 2개 → 제목별 대본 3편(첫 줄 Hook·끝 CTA)·핵심 키워드·태그·설명 → 같은 제목 대본 추가 → 이력 연결 → 블로그는 1단계 거부 → 2단계 행으로 2단계 거부
- 서버 로그 `[KeywordIntel]` 은 1단계 요청에서만 1줄
