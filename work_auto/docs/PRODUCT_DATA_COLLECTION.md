# 상품 상세페이지 수집 (Bright Data, v0.9.36)

제품 상세페이지 학습 › **상품 URL** 탭에서 쓰는 기능입니다. 쿠팡과 네이버 스마트스토어 상세페이지를 Bright Data Web Scraper API로 수집하고, 지니의 AI(Claude/OpenAI 중 기본)가 분석해 제품 라이브러리에 저장합니다.
서버가 쇼핑몰에 직접 접속하던 수집은 v0.9.11에서 뺐고, 이번에 다시 만들지 않았습니다(자동 대체 경로도 없음).

## 1. 지원 URL (로컬 판별, 외부 호출 0회 — `lib/product-url.ts` `parseSupportedProductUrl`)

WHATWG URL 파서로 hostname과 pathname을 정확히 비교합니다. 문자열 포함 여부로 판별하지 않습니다.

| 쇼핑몰 | host | path | 같은 상품 키 | Bright Data 로 보내는 주소 |
|---|---|---|---|---|
| 쿠팡 | `coupang.com`, `www.coupang.com` | `/vp/products/{숫자}` | `coupang:{productId}` | `https://www.coupang.com/vp/products/{id}` + `itemId`·`vendorItemId`만 |
| 스마트스토어 | `smartstore.naver.com` | `/{스토어}/products/{숫자}` | `naver-smartstore:{스토어}:{productId}` | `https://smartstore.naver.com/{스토어}/products/{id}` |

**거부하는 주소** (외부 0회, DB 기록 없음)
- https가 아닌 주소, 계정·포트가 붙은 주소
- 다른 쇼핑몰: 11번가·G마켓·아마존 등
- 네이버의 다른 주소: brand / shopping / m.smartstore 등
- 상품 상세가 아닌 쿠팡 주소: 카테고리·홈 등
- 위장 주소: `coupang.com.evil.com`, `evil.com/?url=coupang.com…`

## 2. Bright Data API (`lib/server/providers/product/brightdata.ts` `brightDataConfig`)

| | |
|---|---|
| Host | `https://api.brightdata.com` |
| 인증 | `Authorization: Bearer {토큰}` (API 연결 센터 `brightdata`, AES-256-GCM 암호화, 서버에서만) |
| Trigger | `POST /datasets/v3/trigger?dataset_id=…&format=json&uncompressed_webhook=true`, body `[{ "url": … }]` → `{ snapshot_id }` (배열이 바로 오면 그 결과를 쓴다) |
| 상태 | `GET /datasets/v3/progress/{snapshot_id}` → `starting / running / ready / failed` |
| 결과 | `GET /datasets/v3/snapshot/{snapshot_id}?format=json` → `[record]` |
| Dataset | 쿠팡 `gd_mcsxmfqptpufr191p` · 스마트스토어 `gd_m9qqjxxr1hab7okefj` (실제 계정 값이 다르면 설정만 바꾼다) |
| 연결 테스트 | `GET /datasets/list` (무료, 두 Dataset이 목록에 있는지 표시). 상품을 학습할 때는 연결 테스트를 부르지 않는다 |

`/datasets/v3/scrape`(동기 방식)는 쓰지 않습니다. 1분이 넘으면 결국 snapshot을 돌려줘서, Trigger와 상태 확인을 처음부터 나누는 편이 구조가 단순합니다.

## 3. 호출 흐름 (`lib/server/services/product-url-learning.ts`, 화면 `lib/product-learn-flow.ts`)

```
[상세페이지 학습] 클릭 (버튼 handler 만, ref 잠금 · useEffect 없음)
 → POST /api/products/learn-url { url, clientRequestId }
     로컬 URL 검사 → 같은 상품 키로 기존 제품 확인 (products.source_url 을 같은 규칙으로 풀어 비교)
       있음 → { status: "existing" }  ← Bright Data 0회, AI 0회
       없음 → Trigger 정확히 1회 → { status: "collecting", jobId }
 → POST /api/products/learn-url/status { jobId, url }  3초 간격 · 최대 20번 (같은 작업 상태만)
       ready → 결과 1번 → 내부 모델로 정리 → { status: "collected", raw }
 → POST /api/products/analyze-collected { raw }  ← AI 분석만 (실패해도 다시 누르면 AI 만)
 → [제품 라이브러리에 저장]  POST /api/products (같은 상품이면 DUPLICATE_PRODUCT)
```

**중복 방지**
- 화면: 클릭하는 순간 ref로 잠급니다. 버튼은 "학습 중…"으로 바뀝니다.
- 서버: `사용자 + 상품 키`로 진행 중인 작업을 15분 기억합니다. 같은 요청이 동시에 오면 Trigger Promise를 나눠 쓰고, 진행 중에 다시 누르면 같은 jobId를 돌려줍니다.

**자동 재시도는 없습니다.** 실패하면 안내만 하고, 사용자가 다시 누를 때만 새로 수집합니다. 상태 확인 20번이 끝나도 준비되지 않으면 안내만 합니다. 이때 같은 버튼을 다시 누르면 진행 중인 작업을 이어서 확인하며, 새로 수집하지 않습니다.

**다시 학습**: 제품 상세 › [상세페이지 다시 학습] → 확인 창의 [다시 학습]을 누를 때만 Trigger 1회(`force` + 그 제품 id) → `POST /api/products/:id/relearn`으로 저장합니다. 분석 version이 올라가고 수집 원본은 최신 1개만 남습니다. 제품 id, 만든 콘텐츠, 연결 영상은 그대로입니다.

**로그**: `[BrightData] {requestId, operation: trigger|status|result, platform, canonicalKey, user(앞 8자), at}` 형식입니다. 토큰, 헤더, 응답 본문은 남기지 않습니다.

## 4. 수집 데이터 → 내부 모델 (`normalizeBrightDataRecord`)

실제 응답 구조는 아직 키로 확인하지 못했습니다(아래 6). 그래서 문서 예시 필드와 흔한 이름을 너그럽게 읽고, 없는 값은 비워 둡니다.

| 내부 | 읽는 이름 (앞에서부터) |
|---|---|
| title | title · product_name · name |
| brand | brand · brand_name · manufacturer |
| price / 정가 | final_price · price · sale_price / initial_price · original_price |
| category | category · categories · breadcrumbs |
| description | description · product_description · details + features (최대 8,000자) |
| specs | specifications · specs · attributes (`{키: 값}` 또는 `[{name, value}]`, 최대 40개) + 옵션·평점·리뷰 수 |
| images | images · image_urls · main_image · detail_images (https, 최대 10개) |
| seller | seller_name · seller · store_name |
| 리뷰 | top_reviews (최대 5개, 200자) |

**상세 이미지**: 설명 글이 400자보다 짧고 실제 AI가 이미지를 읽을 수 있을 때만 처리합니다.
- 쇼핑몰 이미지 서버(`*.coupangcdn.com`, `*.pstatic.net`, `*.naver.net`)에서 받은 이미지만 대상입니다.
- 최대 6장, 장당 3.5MB 이하만 AI Vision으로 1회 읽습니다.
- 이미지는 저장하지 않고, 읽은 글만 설명에 더합니다.

## 5. 저장하는 것 / 하지 않는 것 (DB 변경 없음)

| 저장 | 테이블 | 크기 |
|---|---|---|
| 제품 목록 정보 (이름·브랜드·카테고리·판매자·대표 이미지 **주소**·수집 주소 = `source_url`) | products | 약 1KB |
| 정리된 수집 데이터 (위 4의 필드 + `canonicalKey`·`platform`·`externalProductId`, 원본 응답 아님) | product_sources.raw | 최대 약 10KB (설명 8,000자 상한) |
| AI 분석 (기존 형식) | product_analyses | 약 2~4KB |

**저장하지 않는 것**: 원본 HTML, Bright Data 전체 응답, 작업 응답, 디버그·프록시 정보, 이미지 파일, base64, URL 검사 실패 기록.

새 테이블과 컬럼은 없습니다. 같은 상품 판별은 `products.source_url`을 같은 규칙으로 풀어서 비교합니다.

## 6. 남은 확인 (실제 토큰 필요)

- **실제 응답 필드**: 쿠팡과 스마트스토어 각각에서 title / brand / category / price / description / specs / options / images / seller가 있는지는 실제 토큰으로 1건씩 확인해야 합니다. 지금 매핑은 문서 예시 기준입니다.
- **쿠팡 상세 이미지**: 쿠팡 기본 Product Scraper는 상세 설명이 이미지로만 되어 있는 경우가 많습니다. 결과를 보고 아래 셋 중 하나를 정합니다. 승인 전에는 두 번째 Scraper를 자동으로 부르지 않습니다.
  - (A) Image Scraper를 추가 호출
  - (B) Scraper Studio로 맞춤 Scraper 1개 제작
  - (C) 지금 데이터로 충분
- **진행 중 작업 기억**: 서버 인스턴스 메모리에 있어서, 다른 인스턴스에서 같은 상품을 동시에 누르면 Trigger가 1번 더 생길 수 있습니다. 화면 잠금이 1차로 막습니다.
