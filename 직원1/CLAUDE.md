# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

간단한 투두리스트 웹 앱. Vite + React 19 + TypeScript로 구현되어 있음.

## 기술 스택

- **React 19.x** (설치된 버전: `19.2.7`) — 최신 안정 버전 확인은 `npm info react version`.
- **TypeScript** (설치된 버전: `~6.0.2`) — 2026년 7월 8일 Go 기반으로 재작성된 **TypeScript 7.0**이 나왔지만, 출시 직후라 이 프로젝트의 Vite/린터 툴체인과의 호환이 아직 검증되지 않아 6.x를 사용 중. 업그레이드하기 전에 `tsc -v`와 `npm run build`로 호환 여부를 먼저 확인할 것.
- **빌드 도구: Vite** (`npm run dev` / `npm run build` / `npm run preview`)
- **린트: Oxlint** (`npm run lint`) — create-vite의 react-ts 템플릿 기본값으로 ESLint 대신 채택됨(Rust 기반, 더 빠름).
- **상태 관리**: 외부 상태 라이브러리 없이 `useReducer` + `localStorage`만 사용 (`src/hooks/useTodos.ts`). 투두리스트 규모에서는 이걸로 충분함.
- **테스트**: 아직 구성되어 있지 않음. 필요해지면 Vite와 동일한 트랜스폼 파이프라인을 쓰는 Vitest + React Testing Library를 우선 고려할 것.

## 아키텍처

- `src/types.ts` — `Todo`, `Filter` 타입 정의.
- `src/hooks/useTodos.ts` — 할 일 목록의 단일 진실 공급원. `useReducer`로 add/toggle/edit/delete/clearCompleted 액션을 처리하고, `useEffect`로 변경될 때마다 `localStorage`(`todo-list:todos` 키)에 동기화. 초기 상태는 `useReducer`의 세 번째 인자(lazy init)로 `localStorage`에서 로드.
- `src/components/` — `TodoForm`(입력), `TodoItem`(개별 항목, 더블클릭으로 인라인 편집), `TodoList`(목록 렌더링), `TodoFilter`(전체/진행 중/완료 필터 + 남은 개수 + 완료 항목 일괄 삭제).
- `src/App.tsx` — 위 조각들을 조합하고 `filter` 상태에 따라 보여줄 목록을 `useMemo`로 계산.
- `src/index.css` — 라이트/다크 테마 CSS 커스텀 프로퍼티(`--text`, `--bg`, `--accent` 등, `prefers-color-scheme`로 자동 전환)와 전역 리셋. `src/App.css` — 투두리스트 전용 스타일.

## 커밋 규칙

- 커밋 메시지는 한글로 작성할 것
- Conventional Commits 규칙을 반영할 것
- 예시: `feat: 할 일 완료 기능 추가`

## 문제 해결 우선순위

1. 실제 동작하는 해결책 찾기
2. 기존 코드 패턴 분석 및 일관성 유지
3. 타입 안전성 보장하기
4. 재사용 가능한 구조로 설계하기
