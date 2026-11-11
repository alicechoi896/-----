---
name: ship-checklist
description: work_auto 기능을 고친 뒤 마무리·배포할 때의 순서 — 빌드, 로컬 서버 재시작, 전체 테스트(unit·db·api), 사용 매뉴얼(내용·캡처·PDF), 버전·CHANGELOG, work_auto 만 커밋, Vercel 배포. "배포해줘", 작업 마무리, 버전 올리기, 매뉴얼 다시 만들기 때 쓴다.
---

# 마무리·배포 체크리스트

## 1. 검사
```
npx tsc --noEmit -p .
npx eslint <바꾼 폴더>
```

## 2. 빌드 + 로컬 서버 다시 켜기 (PowerShell)
- 끄기 — **next/3000 프로세스만** (node 전체를 끄지 않는다):
```
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match "next" -and $_.CommandLine -match "3000" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```
- 빌드: `npx next build`
- 켜기: `Start-Process cmd -ArgumentList '/c "npx next start -p 3000 > %TEMP%\next-start.log 2>&1"' -WindowStyle Hidden` → 8초 기다림

## 3. 전체 테스트 (새로 켠 서버에서)
- `npm test` (tests/unit + tests/db) · `npm run test:api` (서버 필요, 약 3분)
- 실패하면 원인을 보고한다. 기대 동작이 바뀐 테스트만 고치고, 그 이유를 적는다.
- 데모 흐름 시험 스크립트는 `work_auto/_xxx.tmp.mjs` 로 만들어 돌리고 **바로 지운다** (@napi-rs/canvas 가 work_auto 에서만 불러와짐).

## 4. 사용 매뉴얼 (화면·버튼·동작이 바뀌면)
- `lib/manual/content.ts` 단계 문구 + `scripts/manual/shots.mjs` 강조 표시를 같이 고친다. **단계 수 = 강조 수** (`tests/unit/manual.test.ts`).
- 캡처 다시: `node scripts/manual/capture.mjs <shot-id>` (예: `05-stay`). 강조가 화면 밖이면 shots.mjs 의 viewport 높이를 늘린다.
- PDF: `npm run manual:pdf`.

## 5. 버전·기록
- `package.json` 의 version 을 올린다 (0.9.x).
- `docs/CHANGELOG.md` 맨 위에 `## [0.9.x] - YYYY-MM-DD: 제목` + 고침/바뀜/추가.
- 기능 목록이 바뀌면 `docs/FEATURE_REGISTRY.md`.

## 6. 커밋·푸시 (모노레포 루트에서, work_auto 만)
```
cd C:/Users/choi/클로드코드
git add -- work_auto
git commit -m "<type>(work_auto): 한국어 요약 (v0.9.x)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- work_auto
git push
```
- `ref/`·`*.mp4`·`assets/video` 가 들어가지 않았는지 `git status --short -- work_auto` 로 본다.

## 7. 배포
- work_auto 에서 `npx vercel --prod --yes` → 결과의 `"message"` 에 `ready. Production URL: https://work-auto-blush.vercel.app` 확인.
- 크론을 더하면 `vercel.json` 의 `crons` 에 경로를 넣는다 (`/api/cron/*`, `CRON_SECRET` 확인).

## 8. 보고 (한국어)
- 고친 것·원인·확인한 것·**확인 못 한 것**(예: 실제 Kie 결과는 데모로 못 봄)을 나눠서. 사용자가 해 줄 일(환경변수·SQL 실행 등)은 마지막에.
