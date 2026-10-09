# 트렌드 스크랩 (v0.9.54)

YouTube·NAVER·Instagram 트렌드 찾기에서 마음에 든 영상·주제를 **분류(폴더 이름)** 를 골라 저장하고, `/scraps` 에서 모아 본다.

- 저장: `saved_trends` 테이블 그대로 (YouTube 찜 = 분류 없음 스크랩). 추가 컬럼 `folder`(분류 이름, '' = 분류 없음)·`meta`(좋아요·댓글·캡션·NAVER 증가율 등)
- 분류는 별도 테이블 없이 이름으로 묶는다. 새 분류 = 스크랩할 때 이름을 적으면 생긴다. 이름 바꾸기 = 그 분류의 스크랩을 모두 옮김
- 같은 항목(출처+ID)을 다시 스크랩하면 분류만 바뀐다. 최대 1,000개
- 주소는 출처별로 만든다 (YouTube watch, Instagram reel, NAVER 검색) — 다른 사이트 주소는 저장하지 않는다
- 외부 API 호출 0 (화면에 있던 정보만)

| 파일 | |
|---|---|
| `lib/server/services/scraps.ts` | 저장·목록·분류·옮기기·삭제 |
| `app/api/scraps` (GET/POST), `/[id]` (PATCH/DELETE), `/folders` (PATCH) | API (권한: scraps) |
| `components/shared/ScrapButton.tsx` | 트렌드 화면의 [스크랩] (분류 고르기·새로 만들기) |
| `features/scraps/ScrapBoard.tsx` | 스크랩 화면 |
