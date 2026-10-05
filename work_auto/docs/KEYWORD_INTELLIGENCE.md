# Keyword Intelligence (v0.9.40)

생성 직전에 **실제 플랫폼 데이터**로 키워드 후보를 모아 프롬프트 Context 에 넣는다.
최종 콘텐츠가 아니라 참고 자료다. 검색량·SEO 점수처럼 API 가 주지 않는 숫자는 만들지 않는다.

코드: `lib/server/services/keyword-intelligence.ts` · 타입 `lib/types/keyword-intel.ts` · 프롬프트 블록 `lib/server/ai/prompts/render.ts`

## 언제, 몇 번 부르나

| 기능 | 플랫폼 | 호출 (생성 1번당 최대) |
|------|--------|------|
| YouTube 제품·정보성 영상 (1단계) | YouTube Data API | `search.list` 1 (part=id, regionCode KR, relevanceLanguage ko, 최대 25개) + `videos.list` 1 (snippet·statistics) |
| NAVER 클립 제품·정보성 (1단계) | NAVER | 블로그 검색 1 (50개, sort=sim) + 데이터랩 1 (상위 키워드 최대 5개, 최근 12주 주간) |
| NAVER 블로그 3종 (생성) | NAVER | 위와 같음 |
| 2단계 · [추가 만들기] | — | **0** (1단계에 저장한 결과 재사용) |

- 자동 재시도·다음 페이지 없음. useEffect 로 부르지 않음 (버튼 클릭만).
- 같은 사용자·플랫폼·검색어는 **30분 서버 메모리 캐시** (`keywordIntelConfig.cacheMs`), 동시에 같은 요청은 1번으로 합침.
- 실패하면 생성은 계속하고 `source = "fallback_ai"` + 안내 문구(note). 결과의 학습 데이터 메모에도 남는다.
- 로그: `[KeywordIntel] {requestId, platform, calls, seed}` (키·응답 원문은 남기지 않음).

## 검색어 (seed) — 1개만

`pickSeed(featureId, input, ctx)`:
- 제품 영상·클립: 주요 키워드 첫 번째 → 제품명 → 트렌드 제목
- 정보성 영상·클립: 주요 키워드 첫 번째 → 주제 → 트렌드 제목 → 카테고리
- 블로그 제품 글: 메인 키워드 → 제품명 / 정보 글: 메인 키워드 → 주제 → 트렌드 / 자동 글: 주제
최대 40자. 없으면 플랫폼 호출 0회 (fallback_ai).

## 후보 뽑기

제목·태그·설명에서 1~3단어 n-gram 을 모아 가중치를 더한다.
- 태그 3 · 제목 2 · 설명 0.6 (문서 하나에서 같은 표현은 1번)
- 문서 가중치: 최근성(30일 1.3 / 180일 1.1 / 그 외 0.9) × 조회수(log) (YouTube)
- 제목+태그 합쳐 2번 이상 나온 표현만, 검색어 단어를 포함하면 ×1.6, 여러 단어 표현 ×1.15
- 긴 표현이 짧은 표현을 거의 다 덮으면 짧은 것은 뺀다. 최대 20개, `score` 는 같은 조회 안의 상대값(0~100)
- `evidence`: "관련 영상 25개 중 제목 6·태그 4" 처럼 근거를 그대로 보여 준다

데이터랩은 **상대 관심도**(0~100, 검색량 아님)와 방향(최근 4주 vs 이전 4주 ±15%)만.

## 저장

원본 응답은 저장하지 않는다. 압축한 결과(후보 15개·신호)만 `generated_contents.context.workflow.keywordIntelligence`(2단계 기능) 또는 `context.keywordIntel`(블로그)에 남는다. DB 변경 없음.

## 테스트

`tests/unit/keyword-intelligence.test.ts` — 플랫폼 호출 횟수(1회·캐시 0회·동시 요청 1회), NAVER 데이터랩 5개 이하, 실패 시 fallback_ai·재시도 없음, 검색어 없음 0회.
