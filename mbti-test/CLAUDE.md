# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

이 문서는 프로젝트 설명서가 아니라, 이 저장소에서 실제로 코드를 작성할 때 따라야 할 개발 가이드다. 제품 요구사항(기능, 화면 흐름, 데이터 모델 등)은 `PRD.md`를 참조할 것 — 여기서는 반복하지 않는다.

## 기술 스택

- **Next.js 16.2.x (App Router)** — Route Handler로 API를, 동적 라우트(`/result/[type]`)로 유형별 OG 메타태그를 구현한다. Pages Router나 별도 백엔드 서버를 추가하지 말 것.
- **TypeScript strict 모드**. `any` 금지 — 지표는 `Trait = 'E' | 'I' | 'S' | 'N' | 'T' | 'F' | 'J' | 'P'`처럼 유니온 타입으로 표현한다.
- **Tailwind CSS**. PRD에는 "CSS Modules 또는 Tailwind" 둘 다 후보로 적혀 있었지만, 이 프로젝트는 Tailwind로 확정한다. 스타일을 CSS Modules와 섞어 쓰지 말 것.
- **html-to-image** — 결과 카드 PNG 저장에 사용. html2canvas 등 다른 캡처 라이브러리를 추가로 들여오지 말 것.
- **Recharts (3.9.x)** — 통계 페이지 차트 전용. 다른 차트 라이브러리를 섞지 말 것.
- **Supabase(Postgres)** — `mbti_results` 테이블 하나만 사용하는 통계 로그. 개인 식별 정보를 저장하는 컬럼을 추가하지 말 것 (PRD 7.3 스키마 참고).
- **패키지 매니저: npm.**
- 새 의존성을 추가하기 전에 `npm info <package> version`으로 최신 버전을 확인하고, 이미 명시된 라이브러리로 해결 가능한 문제라면 새 라이브러리를 들이지 말 것.

## 코드 스타일

- 컴포넌트는 PascalCase(`ResultCard.tsx`), 훅/함수는 camelCase(`useTestProgress.ts`), Next.js 라우트 세그먼트는 kebab-case.
- 질문 목록, MBTI 유형 설명(강점/약점/추천 직업 등)은 컴포넌트에 하드코딩하지 말고 `data/` 아래 타입이 지정된 상수 파일로 분리한다 (예: `data/questions.ts`, `data/mbtiTypes.ts`). 컴포넌트는 이 데이터를 import해서 렌더링만 담당한다.
- 기본은 React Server Component. 사용자 상호작용이 필요한 부분(문항 답변 선택, 진행 상태, 공유 버튼 클릭 등)에만 최소 단위로 `'use client'`를 붙인다 — 페이지 전체를 클라이언트 컴포넌트로 만들지 말 것.
- ESLint(`eslint-config-next`) 기준을 따른다. 경고를 임시로 끄기보다 원인을 고친다.
- Tailwind 클래스는 레이아웃 → 타이포그래피 → 색상 → 상태(hover/dark) 순으로 나열해 diff를 읽기 쉽게 유지한다.
- 유형 그룹별 테마 컬러(NT/NF/SJ/SP)는 `tailwind.config`의 커스텀 컬러 토큰으로 정의하고, 컴포넌트에서 임의의 hex 값을 직접 쓰지 않는다.

## 개발 원칙

- **PRD의 Phase 순서를 따른다.** Phase 1(테스트+결과)이 끝나기 전에 Phase 3(공유)나 Phase 4(통계) 기능을 먼저 만들지 않는다. 단계를 건너뛰어야 할 이유가 생기면 코드를 먼저 짜지 말고 그 이유를 확인한다.
- **개인정보를 저장하지 않는다.** 통계 로그(`mbti_results`)에는 유형과 타임스탬프 외의 어떤 사용자 식별 정보도 추가하지 않는다.
- **12문항/16유형 데이터는 단일 진실 공급원(data/ 상수)에서만 관리한다.** 같은 정보를 컴포넌트, API 응답, 공유 카드 텍스트 등 여러 곳에 중복 정의하지 않는다.
- **모바일 우선으로 작업한다.** 새 화면/컴포넌트는 480px 폭 기준으로 먼저 확인한 뒤 넓은 화면에 대응한다.
- **접근성 기준(PRD 5.5)을 구현 시점에 지킨다.** 일반 인터랙티브 요소는 44px 이상, 테스트 문항 선택 버튼은 56px 이상(PRD 5.2)의 터치 영역과 WCAG AA 명도 대비를 지킨다 — 나중에 별도 접근성 패스로 미루지 않는다.
- **다크모드는 시스템 설정을 그대로 따른다(PRD 5.1).** Tailwind `dark:` variant와 `prefers-color-scheme`으로 대응하고, 별도의 다크모드 토글 UI는 만들지 않는다.
- **테스트 진행 상태(`TestProgress`)는 세션 내 메모리로만 관리한다(PRD 7.2).** localStorage나 DB에 영속화하지 않는다 — 새로고침 시 초기화되는 것이 의도된 동작이다.
- **이미지 저장·공유 등 비동기 액션은 로딩 상태(스피너)를 표시해 중복 실행을 막는다(PRD 5.5).**
- **API 엔드포인트는 PRD 7.4에 정의된 `/api/results`(POST), `/api/stats`(GET), `/result/[type]` 세 가지로 한정한다.** 새 엔드포인트가 필요해 보이면 먼저 그 이유를 확인하고, 임의로 추가하지 않는다.
- **이 서비스 규모에 맞지 않는 추상화를 들이지 않는다.** 상태 관리 라이브러리(Redux/Zustand 등), 불필요한 캐싱 레이어, 사용하지 않는 회원 기능 스캐폴딩 등은 추가하지 않는다.
- **커밋 메시지는 한글로, Conventional Commits 규칙을 따른다.** 예: `feat: 결과 이미지 저장 기능 추가`.
