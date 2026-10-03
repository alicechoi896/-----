# MANUAL — 자동화 지니 사용 매뉴얼 만들기·고치기

사이트 안 **사용 매뉴얼**(`/manual`)과 **PDF**(`public/manual/jadonghwa-genie-manual.pdf`)는 같은 내용·같은 화면으로 만든다.
스크린샷은 데모 서버에서 자동으로 찍고, 강조 상자(빨간 테두리·번호)는 화면 요소의 실제 좌표로 그린다.

## 1. 파일

| 파일 | 역할 |
|------|------|
| `lib/manual/content.ts` | 매뉴얼 문장 (장 → 절 → 단계 ①②③, 팁, 다음 단계, FAQ). `**굵게**` = 빨간 강조 |
| `scripts/manual/shots.mjs` | 찍을 화면 목록: 주소, 찍기 전 동작(prepare), 자를 영역(clip), 강조할 요소(marks: 번호 → 요소) |
| `scripts/manual/capture.mjs` | 스크린샷 → `public/manual/shots/{id}.png`, 강조 좌표 → `lib/manual/shots.json` |
| `scripts/manual/pdf.mjs` | `/manual-print` 화면 → A4 가로 PDF (절마다 한 쪽, 넘치는 절은 그 절 이미지만 줄임) |
| `features/manual/ManualSection.tsx` | 절 디자인 (웹·PDF 같이 씀) |
| `features/manual/ManualView.tsx` · `app/(app)/manual` | 사이트 안 매뉴얼 (목차, PDF 다운로드). 관리자 전용 장은 관리자에게만 |
| `app/manual-print` | PDF 용 화면 (사이드바 없음, 로그인 필요) |
| `tests/unit/manual.test.ts` | 절마다 스크린샷이 있는지, **단계 번호 = 강조 번호**인지, 상자가 화면 안인지 |

## 2. 다시 만드는 순서 (기능·화면을 바꿨을 때)

```bash
# 1) 문장 고치기: lib/manual/content.ts / 화면·강조 고치기: scripts/manual/shots.mjs
# 2) 데모 서버 (.env.local 의 Supabase 값 없이 → 데모 모드). 새로 띄워야 데모 데이터가 처음 상태
npm run build && npx next start -p 3000
# 3) 스크린샷 (다른 터미널). 일부만: npm run manual:capture -- 05-yt-form 07-result-top
npm run manual:capture
# 4) shots.json 이 바뀌었으므로 서버를 끄고 다시 빌드·실행한 뒤 PDF
npm run build && npx next start -p 3000
npm run manual:pdf
# 5) npm test (매뉴얼 검사 포함) → 커밋
```

- 로그인·회원가입 화면(00장)은 데모 모드에 없어서 **운영 사이트의 공개 화면**을 찍는다 (`MANUAL_PUBLIC_URL`, 입력은 하지 않음)
- 찍기 전에 데모 표시를 가린다: "데모 관리자" → "김지니", Mock 안내 숨김, 데모 예시 문장의 시각 표시 삭제
- 강조가 화면 밖에 걸치면 `! … 화면 밖에 걸칩니다` 경고가 나온다 → `viewport` 높이를 늘리거나 `scrollTo`·`clip` 조정
- 강조 대상을 못 찾으면 `✗ id: n번 강조 대상을 찾지 못했습니다` → 버튼 이름이 바뀌었는지 확인

## 3. 새 절 추가

1. `content.ts` 해당 장 `sections` 에 `{ id, title, shot: "05-new", steps: [{ n: 1, text }] }`
2. `shots.mjs` 에 `{ id: "05-new", url, marks: { 1: (p) => … } }` — 단계 번호와 같은 번호로
3. 2장 순서대로 다시 만든다

## 4. 원칙

- 실제 화면을 그대로 쓴다 (다시 그린 그림이 아님). 데모 데이터라 실제 직원 정보·키가 찍히지 않는다
- 문장은 합니다체, 버튼·메뉴 이름은 화면과 똑같이 `**[버튼]**`
- 한 절 = 한 화면 = 단계 1~3개. 길어지면 절을 나눈다
