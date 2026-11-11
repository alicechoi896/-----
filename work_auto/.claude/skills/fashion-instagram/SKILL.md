---
name: fashion-instagram
description: work_auto 인스타그램 쪽 기능 — AI 패션 사진·영상(릴스 8·피드 5 유형), 인스타그램 캐러셀(그림은 Kie, 글자는 직접 그리기), 인스타그램 트렌드 찾기의 릴스 읽기. 이 기능들을 고치거나 레퍼런스(ref/fashion 등)를 반영할 때 kie-generation 과 같이 쓴다.
---

# 인스타그램 (패션·캐러셀·릴스 읽기)

## AI 패션 (/instagram/fashion)
- 파일: `lib/fashion/formats.ts`(유형), `lib/fashion/prompts.ts`, `lib/server/fashion/{service,tasks,render,store}.ts`, 화면 `features/fashion/FashionEditor.tsx`.
- 릴스 유형 8: 룩북·일상·요일(엘리베이터 문)·얼굴 없음·캐릭터·언박싱·워킹(AI 영상)·1인 리뷰(AI 영상). 피드 유형 5: 모델+제품 카드·라벨 카드·문자 섬네일 플랫레이·코디 플랫레이·색 조합.
- [AI 로 문구 쓰기]는 유형에 맞게 (`formatGuide`). 음악 없음 (인스타·쇼츠 자체 음악). POV 문구 자리는 사용자가 끌어서 정함.
- 결과물(out/)은 3일 뒤 삭제.

## 캐러셀 (/instagram/carousel)
- 제품 전용이 아니라 모든 캐러셀: 주제·제목·내용 → [글 만들기](AI 1번) → 장마다 그림.
- **그림만 Kie(nano-banana 4:5), 글자는 캔버스로 직접 그림** (AI 그림 속 한글 깨짐 방지). 테마 4가지·참고 이미지로 디자인 고르기.
- 마케팅 심리 원칙(coreyhaines31/marketingskills 'marketing-psychology') 적용 체크.

## 릴스 읽기 (/instagram/trends?tab=read)
- 옛 /tools/reel-read 는 여기로 이동. 여러 주소(엔터 구분) 한 번에, 캐러셀 사진, 원본 ZIP.
- TikHub `fetch_post_info` 는 확인 후 1회 (safety-rules: TikHub 최소화). 받아쓰기 OpenAI whisper-1.
- [대본 포맷에 담기]: 받아쓴 말 → 참고 대본, 첫 3초 → Hook.

## 레퍼런스
- 사용자가 `ref/…`, `reference/…` 에 넣은 이미지·영상을 보고 반영한다. 이 폴더는 **커밋 금지**, 매뉴얼 캡처에도 쓰지 않는다.
