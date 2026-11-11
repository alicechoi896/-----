---
name: script-format
description: work_auto 원고·대본 생성과 대본 포맷(AI 학습 관리 › 대본 포맷) — 말투 규칙('~니다.' 금지, 한 줄 8~10자, 평점 금지), 포맷을 얼마나 반영하는지, 생성 뒤 포맷 검수, 대본 파일(ref/script 등)을 학습해 포맷에 넣는 SQL 만들기. 원고·대본·Hook·CTA·제목·대본 포맷을 고치거나 학습할 때 쓴다.
---

# 원고·대본 포맷

## 고정 규칙 (사용자가 '안 풀거야'라고 정함)
- **'~니다.'로 끝나는 문장 금지** (습니다·합니다·입니다). 참고 대본이 '~합니다'를 써도 '~해요/~이에요'로.
- YouTube 제품 홍보 영상·자동 제작 대본: **한 줄 공백 포함 8~10자**, 띄어쓰기 자리에서만 나눔 (`lib/script-format.ts wrapScript`, 낱말 중간 '지/금' 금지).
- 평점·별점·리뷰 수·순위('만족도 1위' 등) 이야기 금지 (`isRatingTalk`, `NO_RATING_RULE`).
- 가격·할인·배송은 제품 정보에 근거가 있을 때만. 제품 장점은 제품 라이브러리 '구매 포인트'로.

## 포맷이 반영되는 방식
- 고르는 포맷: 생성 폼에서 고른 것 → 스타일에 연결된 것(최대 3개, 대본마다 돌아가며) → 유형·채널 기본 포맷 (`lib/server/ai/context-builder.ts`, `services/script-formats.ts chooseScriptFormats`).
- 포맷 항목(참고 대본+제목+Hook+CTA+섬네일) 100개 미만 → 결과의 약 50% / 100개 이상 → 80% 지시 (`formatStrength`).
- 프롬프트에 보이는 참고 대본: **지금 제품·주제와 비슷한 8편(600자), 큰 포맷 10편(700자)** (`similarExamples`). 가이드라인은 항상 전부. CTA 는 100% 목록에서, Hook 은 70~80% 그 구조로.
- 생성 뒤 **포맷 검수** (`content-generation.ts enforceFormat`, AI 1회): 어긴 대본만 고침. 지어낸 숫자·'~니다.' 증가·길이 ±40% 넘으면 고친 것을 버림. 그다음 `enforceEndings`(말끝), `wrapScriptLines`.
- 프롬프트를 바꾸면 `lib/server/ai/prompts/templates.ts` 의 version·changelog 를 올린다.

## 대본 파일을 학습해 포맷에 넣기 (예: ref/script)
1. 파일을 읽고 대본마다 제목·조회수('4.2만회' → 42000)·본문을 나눈다. 받아쓰기 오타는 뜻이 분명할 때만 고친다 (예: 공원→공홈, 쉽기 합 방수→10기압 방수). 제목·내용이 안 맞거나 잘린 대본, 순위 표현은 뺀다.
2. 구조(단계 순서·역할)·Hook 유형·스펙 나열 방식·혜택·CTA·리듬을 정리해 가이드라인(3000자 안)으로. 위 고정 규칙에 맞게 쓴다.
3. SQL: `public.script_formats` 의 해당 포맷 한 줄만 update. 참고 대본은 예전+새 것 합쳐 같은 제목 하나만·조회수 순 30개(앱 한도), hooks/ctas/title_patterns/thumbnail_titles 는 예전 뒤에 붙이고 중복 제거, 가이드라인은 새 것 앞+예전 뒤. ① 확인 select ② update. JSON 은 `$j$…$j$::jsonb` 달러 인용. **실행하지 않고** 파일(`ref/...`, 커밋 안 됨)로 주고, PGlite 로 미리 돌려 본다.
4. 사용자에게 학습 결과(구조·Hook 유형·리듬·뺀 것)를 한국어로 보고.

## 숙소 대사
- AI 숙소 영상 대사도 고른 포맷(없으면 기본 제품 홍보 포맷)을 따른다 (`lib/server/stay/service.ts stayFormat`) — 자세한 건 stay-video 스킬.
