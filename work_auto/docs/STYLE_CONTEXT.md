# STYLE_CONTEXT — 나의 스타일을 생성에 쓰는 방식

> v0.9.9 (2026-10-03). 코드: `lib/server/ai/style-context.ts` (Style Context Builder), `lib/style-limits.ts` (한도), `lib/server/services/style-import.ts` (파일 일괄 추가)

"나의 스타일"(`user_styles`)은 **어떻게 표현할 것인가**를 담는다. 무엇을 다룰지는 콘텐츠 프로필([CONTENT_PROFILE.md](./CONTENT_PROFILE.md))이 맡는다.
이번 버전의 목표는 새 AI 학습 구조를 만드는 것이 아니라 **기존 스타일 데이터를 더 잘 쓰는 것**이다.

## 1. 필드별 역할

| 필드 (DB) | 역할 | AI 에 보내는 방식 | 저장 한도 |
|---|---|---|---|
| tone, description | 말투·전개 방식 | 그대로 | 200자 / 500자 |
| rules (`rules`) | **반드시 지킬 규칙** | **항상 전부** | 50개 · 500자 |
| bannedPhrases (`banned_phrases`) | **절대 쓰지 않을 표현** | **항상 전부** | 100개 · 100자 |
| examplePhrases (`example_phrases`) | 사용자 말투 참고 | 10개 이하 전부, 많으면 무작위 10개 | 200개 · 500자 |
| hooks | 도입부 설계 참고 | 10개 이하 전부, 많으면 무작위 10개 | 200개 · 500자 |
| ctas | 마무리(행동 유도) 방식 참고 | 10개 이하 전부, 많으면 무작위 10개 | 200개 · 500자 |
| **titlePatterns (`title_patterns`, 신규)** | 제목 **설득 구조** 참고 (최종 제목이 아님) | 10개 이하 전부, 많으면 무작위 10개 | 200개 · 500자 |
| channelIds, profileId, isDefault | 적용 채널·연결 프로필·기본 스타일 | (선택 로직에만 사용) | |

- 저장할 때 서버가 앞뒤 공백·제어 문자를 정리하고, 대소문자·공백만 다른 항목은 하나만 남긴다 (`memory.ts` `strList`).
- 표본 개수는 `STYLE_SAMPLE_CONFIG` 한 곳에서 바꾼다.

## 2. 규칙·금지 표현을 전부 보내는 이유

규칙과 금지 표현은 "참고"가 아니라 **강제 조건**이다. 무작위로 일부만 보내면 생성할 때마다 지켜지는 규칙이 달라지고,
빠진 금지 표현이 결과에 섞일 수 있다(안전성 문제). 그래서 항상 전부 보내고, 대신 저장 한도를 작게 둬서 토큰을 관리한다.

반대로 Hook·CTA·제목 패턴·자주 쓰는 표현은 **다양성**이 목적이다. 매번 전부 보내면 AI 가 늘 같은 몇 개로 수렴하므로,
많으면 매 생성마다 다른 10개를 고른다 (Fisher–Yates 무작위, 원래 순서 유지).

## 3. 영상 (YouTube · NAVER 클립)

| 항목 | 지시 |
|---|---|
| 규칙 | 반드시 모두 지킨다 |
| 금지 표현 | 절대 쓰지 않는다 |
| 자주 쓰는 표현 | 말투만 닮게, 그대로 반복하지 않는다 |
| Hook | 영상 첫 3초 Hook 설계 참고 (문제 제기·궁금증·반전 방식), 문장 복사 금지 |
| CTA | 영상 마지막 행동 유도 참고, 상황에 맞게 응용 |
| 제목 패턴 | 설득 구조를 응용해 **영상 제목 후보 약 10개** |

## 4. 블로그 (NAVER 블로그 3개 화면)

같은 스타일을 쓰지만 영상 표현을 그대로 가져오지 않도록 다르게 지시한다.

| 항목 | 지시 |
|---|---|
| Hook | 영상용 짧고 자극적인 문장을 그대로 쓰지 않는다. **자연스러운 블로그 도입 문장**으로 재해석해 첫 단락에 쓴다. 예: "이거 아직도 모르세요?" → "이 기능을 모르고 사용하는 분들이 생각보다 많습니다." |
| CTA | "고정댓글 확인하세요", "구독·좋아요" 같은 영상 CTA 금지. 다음 행동 안내 / 제품 정보 확인 / 관련 내용 추가 확인 / 글 내용 정리 중 문맥에 맞는 **자연스러운 마무리** |
| 제목 패턴 | 영상 제목 느낌 복사 금지. **검색 키워드 + 사용자 검색 의도 + 패턴의 설득 구조**를 결합한 검색형 블로그 제목 후보 약 10개. 핵심 키워드는 앞쪽 |
| 규칙·금지 표현·자주 쓰는 표현 | 영상과 같다 |

채널 판별: `styleMediumOf(channelId)` — `naver-blog` 는 blog, 나머지는 video.

## 5. 제목 패턴 → AI 재해석

1. 스타일의 제목 패턴에서 최대 10개를 고른다 (많으면 무작위).
2. 프롬프트에 다음 지시와 함께 넣는다.
   > 아래 제목 패턴은 설득 구조를 참고하기 위한 예시다. 문장이나 표현을 그대로 복사하지 마라.
   > 현재 주제, 제품, 키워드, 타깃, 채널 특성에 맞게 완전히 새로운 제목으로 재해석하라.
   + 숫자형·질문형·반전형·정보형을 섞고 같은 어미 반복 금지, 제품명·키워드 자연스럽게, [제품 정보]에 없는 성능·효능 주장 금지
3. **별도 AI 호출 없이** 기존 콘텐츠 생성 호출 안에서 `titles`(제목 후보) 10개를 함께 만든다.
   - 7개 생성 화면 모두 제목 후보 10개를 출력한다. NAVER 클립은 기존 `title`(최종 제목)을 그대로 두고 `titles` 를 추가했다.
4. 공통 규칙(BASE_SYSTEM 7·8번)에도 "패턴·Hook·CTA 는 구조만 참고, 복사 금지", "규칙 전부 준수, 금지 표현 금지"를 넣었다.

패턴 작성 팁: 바뀌는 자리는 `[제품]` `[숫자]` `[키워드]` `[대상]` `[행동]` 처럼 대괄호로 적는다.

## 6. 생성 기록 (generated_contents.context)

새 테이블 없이 기존 `context` JSON 에 `styleSamples` 를 추가해 **이번 생성에 실제로 보낸 표본**을 남긴다.

```json
"styleSamples": {
  "styleId": "sty_…", "medium": "video",
  "hooks": ["…10개"], "ctas": ["…"], "titlePatterns": ["…10개"], "examplePhrases": ["…"],
  "rulesCount": 30, "bannedCount": 12,
  "totals": { "hooks": 200, "ctas": 3, "titlePatterns": 14, "examplePhrases": 15 }
}
```

결과 화면의 "이번 생성에 사용된 학습 데이터" 상자에서 [스타일 참고 ▼]를 누르면 볼 수 있다. 예전 결과에는 없다(선택 필드).

## 7. AI Provider 독립 구조

```
style        = 생성 폼에서 고른 스타일 → 채널 기본 → 모든 채널 기본     (context-builder.ts)
styleContext = buildStyleContext({ style, channelId })                  (style-context.ts, Provider 와 무관)
messages     = renderContentPrompt(template, config, input, ctx)         (render.ts → renderStyleBlocks)
provider     = getAIProvider()                                            (기본 AI: Claude 또는 OpenAI, 변경 없음)
result       = provider.generateStructured({ messages, … })
```

Claude 전용·OpenAI 전용 코드가 없다. API 연결 센터와 `preferred_ai` 는 바꾸지 않았다.

## 8. 파일 일괄 추가 (.txt / .csv)

나의 스타일 수정·추가 화면 위쪽 **[파일로 일괄 추가]**.

- **TXT**: 한 줄 = 항목 1개. 올리기 전에 넣을 항목(Hook / CTA / 제목 패턴 / 규칙 / 자주 쓰는 표현 / 금지 표현)을 고른다.
- **CSV**: `type,text`. type = `hook` `cta` `title_pattern` `rule` `example_phrase` `banned_phrase` (한국어 별칭도 받는다). 첫 줄 머리글은 건너뛴다. 따옴표 안 쉼표·줄바꿈·`""` 처리. 모르는 type 은 저장하지 않고 행 번호와 함께 알려 준다.
- **미리보기 먼저**: 종류별 개수, 중복 제외(파일 안 + 이미 있는 항목), 한도 초과, 오류 행을 보여 주고 확인을 받는다.
  - 수정 중인 스타일: [N개 저장] → 바로 저장 / 새 스타일: [N개 추가] → 폼에 넣고 [저장]
- 정리 규칙: 빈 줄 제거, 앞뒤 공백 제거, 대소문자·공백만 다른 중복 제거.
- **추천 예시 300개 불러오기**: Hook 100 · CTA 100 · 제목 패턴 100 (`public/samples/style-starter.csv`). 같은 서버 검사·미리보기를 거친다.

### 파일 보안

| 항목 | 처리 |
|---|---|
| 저장 | **파일을 어디에도 저장하지 않는다.** 요청 메모리(`request.formData()`)에서 읽고 응답 후 버린다. 디스크 임시 파일·public 경로·DB 에 파일 없음 (DB 에는 사용자가 확인한 문자열만) |
| 확장자 | `.txt` `.csv` 만 (서버에서 다시 확인, 415) |
| MIME | txt: `text/plain` / csv: `text/csv` `application/csv` `application/vnd.ms-excel`(윈도우 Excel) `text/plain`. 빈 값은 확장자로 판단 |
| 크기 | 본문을 읽기 전 Content-Length 로 1MB 초과 거부(413), 읽은 뒤 한 번 더 확인 |
| 내용 | 앞 8KB 에 null byte 가 많으면 바이너리로 보고 거부. UTF-8(BOM 제거), 깨지면 CP949(예전 Excel CSV)로 읽고 안내 |
| 항목 | 파일당 1,000개, 항목당 500자(넘으면 오류 행), null byte·제어 문자 제거 |
| 파일명 | 확장자 확인에만 쓴다. 경로·저장에 쓰지 않는다 |
| 로그 | 파일 내용을 남기지 않는다 (오류 행은 번호와 이유만) |
| 권한 | `requireAccess("ai-learning")` + 1분 20회 (`rateLimit("style-import")`) |

## 9. DB 변경

```sql
alter table public.user_styles add column if not exists title_patterns text[] not null default '{}';
```

- 추가만 한다. 기존 행은 `'{}'`, 기존 컬럼·데이터·RLS(`own_rows`) 그대로 (PGlite 로 기존 데이터 위 실행 검증).
- Supabase 에 아직 실행하지 않았어도 앱은 멈추지 않는다: 컬럼이 없으면(PGRST204) 빈 값은 빼고 저장, 값이 있으면 "schema.sql 재실행 필요"를 안내한다 (`supabase-store.ts` `PENDING_COLUMNS`).
