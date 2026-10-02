# CHANGELOG

형식: [Keep a Changelog](https://keepachangelog.com/ko/1.1.0/) · 날짜는 YYYY-MM-DD

## [0.9.7] - 2026-10-02: 보안 보강

### 보안
- **서버가 내부 주소로 접속하는 것 차단 (SSRF)**: `lib/server/security/safe-url.ts`
  - 상품 URL 수집은 localhost·사설망·클라우드 내부 주소(169.254.169.254)를 막고, 리다이렉트도 매번 다시 검사한다
  - 샤오홍슈는 도메인이 정확히 `xhslink.com` / `xiaohongshu.com` 일 때만 접속한다 (공유 문구 전체를 붙여 넣어도 첫 주소만 쓴다)
- **보안 헤더**: 다른 사이트의 iframe 삽입 금지(클릭재킹), 파일 형식 추측 금지, Referrer·카메라/마이크 제한, X-Powered-By 제거 (`next.config.ts`)
- **운영에서 데모 모드 차단**: Vercel production 에 Supabase 설정이 빠지면 로그인 없는 관리자 데모로 열리지 않고 "서비스 점검 중"(503)
- **로그인·가입 반복 시도 캡차**: 15분 안에 같은 IP·이메일로 5번 넘게 시도하면 Cloudflare Turnstile (`lib/server/security/auth-guard.ts`)
  - 로그인은 실패만, 가입은 모든 시도를 센다. 15분 30번을 넘으면 캡차를 풀어도 막는다
  - 캡차 키가 없으면 5번 넘은 뒤 15분 동안 막는다

## [0.9.6] - 2026-10-02: 이름 "자동화 지니", 새 로고, 생성 이력 300건 정리

### 변경
- 서비스 이름 "콘텐츠 자동화 센터" → **자동화 지니** (`lib/site.ts` 한 곳에서 관리)
- 로고를 램프 이미지로 교체 (`components/layout/BrandMark.tsx`, `public/logo.png`), 파비콘·홈 화면 아이콘 (`app/icon.png`, `app/apple-icon.png`, `app/favicon.ico`). 원본은 `assets/brand/icon-original.png`

### 추가
- **생성 이력 자동 정리**: 사용자별 최근 300건만 보관 (`lib/server/services/content-history.ts`)
  - ★ 우수 사례, 👍/👎 피드백, 성과가 있는 이력은 지우지 않고 개수에도 세지 않는다
  - 콘텐츠 히스토리·최근 생성 이력에 "오래된 이력은 자동으로 정리됩니다" 안내

## [0.9.5] - 2026-10-02: 부하·장애 대비 (사용자 100명 기준 점검)

자세한 내용은 docs/OPERATIONS.md 참고.

### 추가
- **사용자별 1분 호출 한도** (`lib/server/rate-limit.ts`)
  - 대상: 샤오홍슈 주소 찾기·영상 가져오기·글자 위치 찾기·AI 생성/분석·트렌드
  - 넘으면 "N초 뒤에 다시 시도"를 안내한다
- 샤오홍슈 결과 **10분 기억** + 동시 요청 합치기 + 단축 링크 기억 → 샤오홍슈에 가는 요청 수를 줄여 서버 IP 차단 위험을 낮춘다
- NAVER 자동완성 키워드별 **6시간 기억**
- 영상 엔진 CDN 예비 경로: unpkg 가 안 되면 jsDelivr

### 변경
- AI 글자 위치 찾기: 30장 한 번 → **10장씩 3번 동시에** (빨라짐, 실패한 묶음만 다시). 한 번에 12장·장당 200K 글자 상한
- AI 호출 제한 시간: 100초가 넘으면 원인 안내와 함께 중단 (Claude 재시도 1번, OpenAI 도 같은 안내)
- 글자 흐리게는 3분 이하 영상만 (다운로드는 제한 없음)

### 문서
- docs/OPERATIONS.md 추가: 처리 위치별 부하, 위험 지점과 대응, 요금제 한도
  - Vercel Hobby 는 비상업용
  - Supabase Free 는 1주 비활성 시 일시정지

## [0.9.4] - 2026-10-02: 글자 자동 흐리게 (편집기 제거)

### 변경
- **편집기 제거 → [글자 흐리게] 버튼 하나로 자동 처리** (샤오홍슈 영상마다, 여러 개는 ZIP)
  1. 워터마크 없는 원본(H.265)을 받는다
  2. 1초 안팎 간격으로 최대 30장 화면을 뽑는다 (가로 360px)
  3. AI(Vision)가 **덧씌운 글자**만 찾는다: 자막·작성자 이름·워터마크·글자 로고. 제품 포장·라벨처럼 장면 속 글자는 그대로 둔다
     - 프롬프트 `video.text-detect` v1.0.0, `POST /api/videos/detect-text`
  4. 이어지는 화면의 같은 위치를 하나로 묶어 **나오는 구간만** 흐리게 처리하고, 소리를 뺀 H.264 mp4 로 저장
- 처음 누를 때 "원작자에게 사용·로고·자막 제거 허락을 받았는지" 한 번 확인한다
- AI 비용: 영상 1개에 작은 화면 15~30장 (Claude 기준 약 2~5센트). 시간: 29초 영상 약 3분 (브라우저 처리)
- 문자 인식 엔진(Tesseract) 방식도 시험했지만 영상 배경(줄무늬 등)을 글자로 잘못 읽어 쓰지 않았다

### 수정
- 흐리기 반경이 상자 크기에 비해 크면 ffmpeg 가 거부하던 문제 (색 정보 해상도가 절반이라 짧은 변의 1/4 미만으로)

## [0.9.3] - 2026-10-02: 영상 편집기(로고·자막 지우기) · 샤오홍슈 워터마크 없는 원본

### 추가
- **영상 편집기** (영상 URL 가져오기 → 샤오홍슈 [편집], [내 PC 영상 편집])
  - 화면 위에 상자를 그려 로고·자막을 **지우기**(delogo, 주변 색으로 메움) / **흐리게** / **가리기**(색 채움)
  - 상자 이동, 상자별 적용 구간(여기부터·여기까지), "이 화면 미리보기"로 처리 결과 확인
  - 내보내기: 로고·자막 처리 + 소리 제거 → **H.264 mp4** (재인코딩, 29초 720×1280 기준 약 1분 20초)
  - **원작자에게 사용·로고·자막 제거 허락을 받았습니다** 체크를 해야 저장된다
  - 브라우저 안에서만 처리 (`lib/video-edit.ts`, 서버 저장·비용 0)
- 샤오홍슈 [다운로드]가 **워터마크 없는 원본(H.265)**을 먼저 받는다
  - 같은 노트라도 H.264 스트림에는 화면 아래 샤오홍슈 로고·작성자 이름이 있고, H.265 에는 없다 (2026-10 확인)
  - Mac·iPhone 에서도 열리도록 `hvc1` 표시를 붙인다

### 수정
- ffmpeg.wasm(core 0.12.10) 안정화: **작업마다 새 엔진**을 쓰고 순서대로 실행한다 (`runExclusive`)
  - 한 엔진에서 명령을 두 번 실행하거나 동시에 실행하면 "Unrecognized option 'y'" → Aborted 로 멈추던 문제
  - 미리보기 화면은 JPEG 파일 출력(image2) 대신 원시 화소(rawvideo)로 받아 캔버스로 그린다 (image2 출력이 엔진을 멈추게 함)

## [0.9.2] - 2026-10-02: 체크 삭제 · 제품 검색 · 영상↔제품 연결

### 추가
- **AI 학습 관리 체크 삭제**: 콘텐츠 히스토리·제품 데이터·피드백·성과 데이터 (`POST /api/memory/delete`, 내 데이터만)
  - 콘텐츠를 지우면 그 콘텐츠의 피드백·성과도 함께 지운다
  - 제품을 지우면 분석 데이터도 지우고, 그 제품으로 만든 콘텐츠는 남긴다
- 공용 UI
  - `DataTable` 체크 선택(`selection`), `BulkDeleteButton`
  - **`Combobox`**: 검색되는 선택 상자. 공백·대소문자 무시, 키보드로 고를 수 있고, 표 안에서도 잘리지 않는다
- **제품 검색**: 모든 생성 화면의 제품·참고 트렌드·참고 영상·스타일·콘텐츠 프로필 선택에서 글자로 바로 찾는다
- **영상 ↔ 연관 제품** (`reference_videos.product_id`)
  - 가져올 때 제품을 선택하고, 목록에서 바꿀 수 있으며, 제품별로 볼 수 있다
  - 생성 화면 "참고 영상"에 제품 이름이 함께 보인다

### 변경
- 실제 AI·DB 로 동작하는 생성 기능 7개, 제품 라이브러리, AI 학습 관리의 표시를 "Mock" → "운영"으로 바꿨다
- **영상 음성 제거 화면 제거**: 소리 제거 엔진은 샤오홍슈 다운로드가 계속 쓴다

### 필요한 작업
- Supabase 에서 `schema.sql` 다시 실행 (`reference_videos.product_id` 추가)

## [0.9.1] - 2026-10-02: YouTube 국가=제목 언어 · NAVER 트렌드 빈 화면 수정 · 프로필 자동 생성

### 변경
- **YouTube 국가 = 제목 언어**: YouTube 의 국가(regionCode)는 "그 나라에서 볼 수 있는 영상"이라 외국 영상이 섞인다 (IP 를 바꿔도 같다)
  - 제목 글자로 거른다: 한국 = 한글, 일본 = 가나, 중화권 = 한자(가나·한글 없음), 영어권 = 영문, 태국 = 태국 문자, 베트남 = 베트남 성조 문자
  - 글자로 구분할 수 없는 나라(영국·독일·브라질 등)는 목록에서 뺐다
- **YouTube 더 불러오기**
  - 처음 검색 때 조건에 맞는 영상이 20개보다 적으면 다음 페이지를 자동으로 최대 2번 더 불러온다
  - 표 위쪽에도 [50개 더 불러오기] 버튼을 둔다
- **NAVER 트렌드 빈 화면 수정**
  - 데이터랩 호출: 한꺼번에 보내던 것을 2개씩 차례로 보내고, 한도 초과·서버 오류는 한 번 더 시도한다
  - 단계별로 실패해도 나머지는 보여주고, 이유는 안내 문구로 표시한다
  - 검색어가 없을 때: 프로필·카테고리 **전체 검색 추이**(관심 키워드 묶음), 관련 검색어, 급상승, 시즌, 아이디어를 모두 보여준다
  - 관련 키워드: 검색광고 키가 없거나 실패하면 **네이버 자동완성**으로 대신한다 (검색량 없음, Vercel 서버에서 동작 확인)
  - 클립: 시즌 키워드는 검색어가 없을 때만 보인다
  - 빈 목록에는 "표시할 키워드가 없습니다" 안내
- **콘텐츠 프로필 자동 생성**: 프로필이 없는 사용자가 처음 화면을 열면 "가전 콘텐츠" 예시를 한 번 만든다
  - 지워도 다시 만들지 않는다 (`user_settings.profile_seeded_at`)

### 필요한 작업
- Supabase 에서 `schema.sql` 다시 실행 (`user_settings.profile_seeded_at` 추가). 실행 전에도 동작하지만, 예시 프로필을 지우면 다시 생길 수 있다

## [0.9.0] - 2026-10-02: 샤오홍슈 영상 버튼 하나로 바로 받기 (소리 없이)

### 추가
- 샤오홍슈 **[다운로드] → 소리 없는 mp4 바로 저장** (설치 필요 없음)
  1. 서버가 노트의 영상 주소만 찾는다 (`POST /api/videos/resolve`, `lib/server/providers/video/xiaohongshu-resolver.ts`)
     - 모바일 웹 페이지(iPhone 브라우저로 요청)에는 로그인 없이 영상 정보가 들어 있다 (PC 브라우저로 요청하면 로그인 페이지)
  2. 브라우저가 샤오홍슈 영상 서버(xhscdn, CORS 허용)에서 **직접** 받는다 → 영상이 우리 서버를 지나가지 않음 (저장·트래픽 비용 0)
  3. 브라우저에서 ffmpeg.wasm 으로 소리 트랙만 뺀다 (h264 우선, 재인코딩 없음)
- 샤오홍슈 여러 개 **한 번에 받기 (ZIP)**, 행마다 진행 상태 (영상 찾는 중 → 받는 중 % → 소리 빼는 중 → 저장 완료)
- 샤오홍슈 링크를 가져올 때 실제 제목·작성자·길이를 읽는다 (실패하면 공유 문구 제목)
- 검증: 실제 샤오홍슈 공유 링크로 로컬과 Vercel(서울) 서버 모두 영상 주소 조회 성공, 원본(hevc+aac) → 결과(h264 영상만)

### 변경
- YouTube 는 기존처럼 [다운로드 명령] (서버에서 받으면 봇 차단) — 안내를 YouTube 전용으로 정리
- 샤오홍슈용 yt-dlp 로그인 옵션 화면 제거 (필요 없어짐)

## [0.8.2] - 2026-10-02: 샤오홍슈(小红书) 영상 지원

### 추가
- 샤오홍슈 링크 인식 (`xiaohongshu.com/explore·discovery/item`, `xhslink.com` 단축 링크). 앱의 **공유 문구를 그대로 붙여넣어도** 링크와 제목을 뽑는다 (`lib/video-links.ts`)
- 목록에 "샤오홍슈" 표시. 샤오홍슈는 로그인 없이 정보를 주지 않아 서버에서 조회하지 않고 공유 문구의 제목을 쓴다
- 다운로드 명령에 **로그인 정보 옵션**: Firefox / Chrome / Edge 로그인 또는 cookies.txt (`--cookies-from-browser`, `--cookies`). 선택은 이 브라우저에만 기억

### 변경
- 다운로드 명령: 영상 트랙만 받는 방식(샤오홍슈에서 실패) → **받은 뒤 ffmpeg 로 소리 트랙만 제거**(`--use-postprocessor FFmpegCopyStream --ppa "CopyStream:-an"`, 재인코딩 없음, mp4 유지). YouTube·샤오홍슈 공통
- 설치 안내에 ffmpeg 추가 (`winget install Gyan.FFmpeg`)
- 검증: yt-dlp 2026.08.19 + ffmpeg, PowerShell 5.1 에서 생성된 명령 그대로 실행 → 결과 파일에 영상 트랙만 남음, `~/Downloads` 경로 정상

## [0.8.1] - 2026-10-02: 영상 URL 여러 개 가져오기 · 소리 없는 영상 다운로드

### 추가
- 영상 URL 가져오기: **URL 여러 개를 줄바꿈으로 한 번에** (최대 20개, 중복 제거, URL 별 성공·실패 표시, 실패한 URL 만 입력칸에 남김). `POST /api/videos/batch`
- 영상마다 **[다운로드]**: 내 PC 에서 실행할 yt-dlp 명령을 복사. `-f "bv[ext=mp4]/bv"` 로 **영상 트랙만** 받아 처음부터 소리 없는 파일로 저장 (`~/Downloads/work_auto`, 파일 이름 끝 `_음성없음`)
- **전체 다운로드 명령 복사**, 다운로드 방법 안내(yt-dlp 설치 → 붙여넣기), 저작권 주의 안내

### 왜 사이트에서 바로 받지 않나
- YouTube 는 파일 다운로드 API 가 없고, 서버(Vercel, 데이터센터 IP)에서 받으면 봇 확인으로 막힌다. 영상이 서버를 지나가면 트래픽 비용도 든다 → 사용자 PC 에서 받는다 (서버 비용 0)

## [0.8.0] - 2026-10-02: 블로그 제품 사진 · 영상 음성 제거 · 생성 폼 프로필 선택 (개선 5단계)

### 추가
- **블로그 제품 글 "제품 사진"** (최대 10장, 5장 권장)
  - 브라우저에서 처리: 가로 1080px, JPEG 압축, 원본·1:1·4:3 비율, 위치 정보 등 메타데이터 제거
  - 서버에 저장하지 않는다
  - 사진마다 설명을 직접 넣거나 **[AI로 사진 설명 채우기]**(AI Vision, 512px 미리보기만 전송)
  - AI 가 본문의 알맞은 위치에 `[사진1]` … 자리를 넣는다 (프롬프트 `naver-blog.product-writing` v1.3.0)
  - 결과 화면: 사진이 들어간 본문 미리보기, **사진 전체 ZIP 다운로드**(`메인키워드_01.jpg` …), 사진별 다운로드
- **영상 음성 제거** (공통 도구, `/tools/video-mute`)
  - 내 영상 파일의 소리만 빼고 원본 화질 그대로 저장 (ffmpeg.wasm, 다시 인코딩하지 않음)
  - 여러 개를 처리할 수 있고, 여러 개는 ZIP 으로 받는다
  - 파일은 서버로 올라가지 않는다
- **생성 폼 "콘텐츠 프로필" 선택**: 프로필이 2개 이상일 때만 보인다. 비우면 스타일에 연결된 프로필 → 기본 프로필
- 공용 유틸: `lib/photo-process.ts`, `lib/zip.ts`(외부 라이브러리 없는 ZIP), `lib/video-mute.ts`

### 변경
- 영상 URL 가져오기: 다른 사람 영상 파일 다운로드는 이용약관·저작권 때문에 제공하지 않는다는 안내와 함께 음성 제거 도구 링크 추가
- 콘텐츠 프롬프트 changelog 를 버전 순으로 정렬 (기능별 추가 이력이 있어도 현재 버전이 맞게 나오도록)

### 의존성
- `@ffmpeg/ffmpeg` 0.12.15, `@ffmpeg/util` 0.12.2 (엔진 `@ffmpeg/core` 0.12.10 은 처음 사용할 때 unpkg CDN 에서 받는다, 약 30MB, 브라우저 캐시)

### 필요한 작업
- 없음 (DB 변경 없음)

## [0.7.0] - 2026-10-02: 콘텐츠 프로필 · NAVER 실제 데이터 (개선 4단계)

### 추가
- **콘텐츠 프로필** (AI 학습 관리 첫 탭, DB `content_profiles`): "무엇을 다룰 것인가"
  - 저장 항목: 대표 카테고리·세부 관심분야·관심 키워드·제외 키워드·국가·기본 분석기간
  - 기본 프로필 자동 적용. 데모 기본 프로필은 "가전 콘텐츠"이고, 실제 계정은 [예시로 시작]으로 만든다
  - 나의 스타일과 별개다. 자세한 내용은 docs/CONTENT_PROFILE.md 참고
- **트렌드 화면 3개에 "현재 분석 기준" 바**
  - 프로필 요약, [프로필 적용] 끄기, [프로필 수정 →]
  - 프로필이 2개 이상일 때만 전환할 수 있다
- **YouTube**: 프로필의 관심 키워드·세부 관심분야를 OR 검색하고 제외 키워드를 뺀다. 검색어는 "범위 안에서 좁히기" 역할이다. 처음 조건에 프로필의 국가·분석기간을 쓴다
- **NAVER 실제 데이터** (`NaverApiProvider`, live + 키 연결 시)
  - 데이터랩: 검색 추이 **7일 ~ 3년**, 급상승(기간 끝 1/4 상승률), 시즌(작년 다음 달)
  - 블로그 검색 API: 블로그 누적 문서 수
  - 검색광고 API: 월간 검색량(PC·모바일)·연관 키워드·경쟁도
- **NAVER 블로그 검색어 지표 카드**: 월간 검색량, 광고 경쟁, 블로그 문서 수, 검색량 대비 문서 수(포화도)
- **API 연결 센터 NAVER 카드에 검색광고 API 칸 3개**: 엑세스라이선스, 비밀키, CUSTOMER_ID. 비운 칸은 기존 값을 유지한다
- 나의 스타일에 **적용 콘텐츠 프로필**(선택) 추가
- 생성 Context에 **콘텐츠 프로필** 추가 (콘텐츠 프롬프트 v1.2.0)
  - 순서: 고정 프롬프트 + 콘텐츠 프로필 + 스타일 + 제품 + 트렌드 + 좋은 예시 + 피드백 + 성과
  - 결과의 "사용된 학습 데이터"에 프로필 표시
- YouTube 트렌드 복사 버튼: 상세 패널의 추천 키워드·태그, 목록의 키워드·태그, 추천 키워드 전체

### 변경
- YouTube 필터 기본값: **구독자 0~5만, 조회수 1만 이상**. 댓글 수 조건은 화면과 조회에서 뺐다
- 저장한 조건을 불러올 때 비워 둔 범위는 기본값으로 채우지 않는다 (저장한 그대로 적용)
- NAVER 클립·블로그 트렌드: 프로필을 적용하면 카테고리 선택을 숨긴다. 기간 7일·14일·30일·3개월·6개월·1년·2년·3년
- 생성 화면 NAVER "참고 트렌드" 목록을 프로필 범위로 한 번만 조회한다

### 필요한 작업
- Supabase 에서 `schema.sql` 다시 실행 (`content_profiles` 테이블, `user_styles.profile_id` 추가)
- (선택) API 연결 센터 → NAVER 에 검색광고 API 키 3개 입력, NAVER 애플리케이션에 '검색' API 추가

## [0.6.0] - 2026-10-02: 나의 스타일 강화 · 네이버 트렌드 사용성 (개선 3단계)

### 추가
- **스타일 적용 채널 여러 개 선택** (안 고르면 모든 채널)
- **Hook(초반 3초) · CTA(마지막 행동 유도) 목록**: [+ 추가] 로 계속 늘릴 수 있음. 생성할 때 이 패턴을 응용
- **모든 생성 화면에 "스타일" 선택**: 그 채널에 쓸 수 있는 스타일만 표시 (★ = 기본). 비우면 채널 기본 스타일 자동 적용
- 스타일 **수정** 기능
- **참고 자료로 AI 스타일 초안 만들기**: 글·대본 붙여넣기 또는 텍스트·자막 파일(.txt .md .srt .vtt)을 브라우저에서 읽음 → 말투·규칙·Hook·CTA 자동 채움. 자료와 파일은 저장하지 않음
- YouTube 트렌드 상세 패널 **[스타일로 저장]**: 영상 제목·설명·태그로 스타일 초안
- 프롬프트 `style.extract` v1.0.0, 콘텐츠 프롬프트 v1.1.0 (스타일 Hook·CTA 블록)

### 변경
- **네이버 트렌드**: 급상승·시즌·관련 키워드를 누르면 검색어 칸에 들어가고 바로 조회
- **NAVER 블로그 트렌드**: 검색어가 없으면 검색 추이를 숨기고 카테고리 급상승·시즌 키워드·아이디어를 보여줌. 검색어가 있으면 검색 추이·관련 검색어·글 아이디어 중심, 급상승·시즌은 "다른 키워드 둘러보기"로 작게
- 기본 스타일: 적용 채널이 겹치는 다른 기본 스타일을 자동 해제

### 제거
- 설정 > "일반 설정"(준비 중) 카드 — 계정 정보는 왼쪽 아래 내 정보(/account)에서 관리

### 필요한 작업
- Supabase 에서 `schema.sql` 다시 실행 (`user_styles` 에 channel_ids·hooks·ctas 추가, 기존 채널 값 자동 이전)

## [0.5.0] - 2026-10-02: YouTube 트렌드 개편 (개선 2단계)

### 추가
- **검색 조건**: 국가(기본 한국, 15개국), YouTube 공식 카테고리, 게시일 직접 입력 + 최근 24시간~3개월 버튼, 구독자 수(이상~이하), 조회수(이상~미만), 댓글 수(이상), Shorts/롱폼
- **조건 저장** (DB `saved_filters`): 이름 붙여 저장, 기본 조건 지정 → 화면을 열 때 자동 적용. "최근 N일" 조건은 쓸 때마다 오늘 기준으로 날짜 재계산
- **찜** (DB `saved_trends`): ☆ 버튼. 생성 화면 "참고 트렌드"에 ★ 찜 영상 → 기본 조건 상위 영상 순서로 표시
- **50개 더 불러오기**: YouTube 다음 페이지를 이어 붙임 (100, 150 …). 조회한 수 / 조건에 맞는 수 표시
- **표 정렬**: Trend Score · 조회수 · 게시일 · 일평균 조회수 · 댓글 · 구독자 (열 제목 클릭)
- **Shorts/롱폼 표시**, 주요 키워드 다음에 태그 표시
- **추천 키워드** (즉시 계산, 클릭하면 그 키워드로 검색) + **AI 추천 주제** 6개 (버튼을 눌렀을 때만)
- **영상 상세 패널**: 전체 태그·설명·좋아요·댓글·구독자 대비 배수, **AI 분석(잘된 이유 + 추천 제목 5개 + 키워드)**, 찜한 영상은 분석 결과도 저장
- **이 트렌드로 만들기**: 정보성 영상 / 제품 홍보 영상 화면에 참고 트렌드·주제·키워드 자동 입력
- 프롬프트 `youtube.video-analysis` v1.0.0, `youtube.trend-topics` v1.0.0
- 공통 UI: `DataTable` 정렬(`sortValue`), `Drawer`(오른쪽 상세 패널)

### 변경
- 평균 Trend Score / 최고 일평균 / 자주 등장한 키워드 타일 제거 → 추천 키워드·주제로 대체
- 생성 화면에서 목록에 없는 트렌드 영상(트렌드 화면에서 바로 넘어온 경우)도 영상 ID 로 조회해 사용
- YouTube 조회 캐시 키를 전체 조건 + 페이지 단위로 변경 (6시간)

### 필요한 작업
- Supabase 에서 `schema.sql` 다시 실행 (`saved_filters`, `saved_trends` 테이블 추가)

## [0.4.0] - 2026-10-02: Claude 연결 · 상세페이지 학습 실제화 (개선 1단계)

### 추가
- **Claude (Anthropic) Provider** (`claude-provider.ts`, 기본 모델 `claude-sonnet-5-5`, `CLAUDE_MODEL` 로 변경 가능)
  - 구조화 출력(JSON Schema) 강제, 이미지 입력, 거절 시 서버 측 fallback(`fallbacks: "default"`)
- **기본 AI 선택**: API 연결 센터 → 기본 AI (Claude / OpenAI). `user_settings` 테이블
- **상세페이지 이미지 실제 읽기**: 브라우저에서 긴 이미지를 1000×1400px 조각(80px 겹침)으로 자르고 JPEG 압축 → 최대 8조각씩 `/api/products/extract-images` → AI 가 텍스트·표·수치를 그대로 옮김 → 분석. **이미지는 저장하지 않음**
- **URL 실제 수집** (`WebPageCollector`): og 태그, JSON-LD Product, 본문 텍스트. 수집을 막는 쇼핑몰은 원인과 대안(이미지 업로드) 안내
- 생성 결과에도 JSON Schema 적용 (출력 형식 고정)
- "AI 가 이미지에서 읽은 내용 보기" (분석 근거 확인)

### 변경
- **Mock 바꿔치기 제거**: 실제 모드(live)에서는 URL·이미지를 예시 제품으로 바꾸지 않는다 (데모 모드에서만 예시 사용)
- 제품 분석 프롬프트 v1.1.0: 사실 항목(원문 근거)과 제작 아이디어 항목(적극 제안)을 구분, 항목별 최소 개수 → "원문에서 찾지 못함" 도배 해소
- 마지막 테스트가 실패한 키도 실제 호출에 사용 (Mock 으로 몰래 바꾸지 않고 원인 오류를 보여줌)
- API 오류 안내 강화 (키 오류·한도·크레딧), AI 호출 라우트 실행 시간 120초

### 필요한 작업
- Supabase 에서 `schema.sql` 다시 실행 (`user_settings` 테이블 추가)

## [0.3.1] - 2026-10-02: 속도 개선

### 원인
- Vercel 서버 함수가 미국 동부(iad1), Supabase 는 서울 → DB 조회마다 태평양 왕복(약 0.2초)
- 로그인 확인(getUser)이 요청마다 Supabase Auth 서버에 네트워크 호출
- Mock 기능에 데모용 인위적 지연 0.7초
- 폰트 파일 2MB 를 첫 방문에 통째로 다운로드

### 변경
- `vercel.json`: 서버 함수 지역을 **서울(icn1)** 로 → Supabase 와 같은 지역
- 로그인 확인 `getUser()` → `getClaims()` (비대칭 키로 토큰을 서버에서 직접 검증, 네트워크 호출 없음) — proxy, getSession
- Mock 지연 기본값 0 (`MOCK_LATENCY_MS` 로만 켬)
- 폰트: Pretendard 동적 서브셋 (92개 조각, 화면에 쓰인 글자 조각만 다운로드)
- 브라우저 조회 캐시 30초 (`api-client`): 화면 이동 시 즉시 표시, 저장·수정·삭제·로그아웃·다시 시도 시 비움
- AI 생성 Context 조회 8개를 병렬 실행
- DB (`schema.sql`): 사용자별·외래키 인덱스 14개 추가, RLS 정책의 `auth.uid()`·`is_admin()`·`is_active()` 를 `(select …)` 로 감싸 요청당 1번만 계산, `profiles.approved_by` 외래키, `analyze`

## [0.3.0] - 2026-10-02: 가입 승인 · 활동 기록 · 내 정보 · 약관

### 추가
- **가입 승인제**: `profiles.status` (pending / active / rejected). 승인 전에는 `/pending` 안내 화면만. 사이트 관리 → **가입 승인** 화면 (등급 선택 승인, 거절 사유, 다시 승인)
- **활동 기록**: `audit_logs` 테이블, `auditService`, 사이트 관리 → **활동 기록** 화면 (종류 필터, 검색)
- **내 정보** `/account`: 이름 변경, 비밀번호 변경, 회원 탈퇴 (`delete_my_account()`)
- **비밀번호 찾기** `/forgot-password` → 재설정 메일 → `/reset-password`
- **이용약관** `/terms`, **개인정보처리방침** `/privacy` (운영자 정보는 `lib/legal.ts`), 회원가입 시 필수 동의 체크
- 보관 기간이 지난 데이터 자동 삭제 `purge_expired_data()` + pg_cron (거절 30일, 탈퇴자 기록 1년)
- DB: `is_active()`, 본인 프로필 수정 정책 + 보호 트리거, 승인된 사용자만 서비스 데이터 접근
- 데모 모드 예시 회원 3명 (승인 대기 2명)

### 수정
- 보호 트리거가 SQL Editor 의 첫 관리자 지정까지 되돌리던 문제 → `security invoker` + `current_user` 로 앱 요청만 제한 (PGlite 로 검증)

### 결정
- 사용량 제한 없음: 외부 API 는 회원 본인 키로 호출되므로 비용이 회원에게 청구된다. 등급은 메뉴 접근만 정한다
- 메일 발송 서비스(SMTP)는 나중에. 비밀번호 재설정은 Supabase 기본 메일 사용

## [0.2.0] - 2026-10-02: 로그인 · 등급 권한 · Supabase · 실제 YouTube 트렌드

### 추가
- **실제 YouTube 트렌드 조회** (`YouTubeDataApiProvider`): search.list → videos.list → channels.list → Trend Score, 실제 썸네일, 6시간 캐시, 할당량·키 오류 안내. 영상 URL 가져오기도 실제 메타데이터 조회
- **Supabase 저장소** (`supabase-store.ts`): Repository 인터페이스 구현. 환경변수가 있으면 Supabase, 없으면 인메모리(데모 모드)
- **DB 스키마** `supabase/schema.sql`: 테이블 11개, RLS, 가입 트리거(실버), `is_admin()`
- **로그인 / 회원가입** `/login` (이메일 + 비밀번호), 인증 메일 콜백 `/auth/callback`, 로그아웃
- **역할**: 관리자 / 실버 / 골드 / VIP (`profiles.role`)
- **권한 체계**: Registry `defaultTiers` + `role_permissions`(바꾼 칸만 저장), `lib/permissions.ts`
- **사이트 관리** (관리자 전용 메뉴): 사용자 관리(역할 변경), 권한 관리(등급 × 메뉴 체크 표)
- 화면 차단 `FeaturePage` / `AdminPage`, 허브 잠금 카드("골드 이상"), 사이드바 권한 필터, 사용자 정보·로그아웃
- API 권한 확인 `requireAccess` / `requireAnyAccess` / `requireAdmin`
- `proxy.ts`: 세션 갱신 + 비로그인 시 로그인 화면으로 (3초 타임아웃)
- 공용 컴포넌트 `Checkbox`, `VideoThumb`
- `DEMO_ROLE` 환경변수 (데모 모드에서 등급별 화면 미리보기)
- 문서: `SUPABASE_SETUP.md`, `AUTH_AND_PERMISSIONS.md`

### 변경
- 화면 폴더를 `app/(app)/`(사이드바 있는 화면)와 `app/(auth)/`(로그인)로 나눔. URL 은 그대로
- 기능 페이지를 `FeaturePage`로 감쌈 (권한 확인 포함)
- `getCurrentUserId()`가 실제 로그인 사용자를 반환 (데모 모드는 `demo-user`)
- 사용하지 않던 `User` Entity·저장소 제거 → `UserProfile`(profiles)로 대체
- 기능 상태: YouTube 트렌드 찾기, 영상 URL 가져오기, API 연결 센터 → `live`

## [0.1.1] - 2026-10-02

### 변경
- 채널 표기 변경: `NAVER Clip` → `NAVER 클립`, `NAVER Blog` → `NAVER 블로그` (메뉴, 카드, 페이지 제목, 메타데이터, 문서)
- 프롬프트 `naver-clip.product-content` v1.0.0 → v1.0.1 (작업 지시 안의 채널 표기 변경)
- 채널 ID와 URL(`naver-clip`, `naver-blog`)은 그대로 둔다

### 배포
- GitHub `alicechoi896/-----` 저장소의 `work_auto/` 폴더로 커밋
- Vercel 프로젝트 `work-auto`(flowai 팀) Production 배포, 환경변수 `ENCRYPTION_KEY` 설정

## [0.1.0] - 2026-10-01: V1 골격 (Mock)

빈 `work_auto` 폴더에서 새로 시작했다. 기존 코드 삭제나 대규모 변경은 없다.

### 추가: 프로젝트 기반
- Next.js 16.3 (App Router) + React 19.2 + TypeScript(strict) + Tailwind CSS v4 프로젝트 생성 (`create-next-app`)
- 의존성: `lucide-react`, `clsx`, `tailwind-merge`, `server-only`, `pretendard`(로컬 폰트)
- `npm run typecheck` 스크립트 추가
- `.env.local.example` 추가, `.gitignore`에 예시 파일 허용
- `next.config.ts`: 개발 표시 배지를 오른쪽 아래로 이동

### 추가: 디자인 시스템
- `app/globals.css`: `@theme` 디자인 토큰 (surface, border, text, brand, status, channel accent, radius, shadow, font), 라이트 테마 고정
- `components/ui`: Button / LinkButton / IconButton, Input / Textarea / Select, Badge / Tag, StatusBadge, Tabs / SegmentedControl, FormField, SectionCard / InfoRow / BulletList, DataTable, SearchInput, FilterBar / FilterItem, EmptyState / LoadingState / ErrorState / Notice, CopyButton, SaveButton, IconChip, StatTile, TrendLineChart
- `components/layout`: AppShell, AppSidebar(Registry 기반, 반응형), PageHeader, FeaturePageHeader, PageContainer
- `components/shared`: ChannelCard, FeatureCard, ChannelHub, ProductCard / CreateContentMenu, ProductThumb, ProductAnalysisView, ResultPanel, ApiConnectionCard

### 추가: 구조
- Feature Registry (`lib/registry`): 채널 5개(설정 포함), 기능 15개, 단독 페이지 1개
- Generator Config (`lib/generators`): 생성 기능 7개의 입력 필드와 출력 섹션 스키마
- 도메인 타입 (`lib/types`): User, ApiConnection, Product, ProductSource, ProductAnalysis, ContentProject, GeneratedContent, TrendItem, Keyword, UserStyle, UserFeedback, PerformanceMetric, ReferenceVideo
- 도메인 함수 (`lib/domain`): Trend Score 산식, 정직성 가드레일
- Mock 데이터 (`lib/mock`): 제품 카탈로그 4종, YouTube 트렌드 24건, NAVER 트렌드 3개 카테고리, Seed(제품 3, 스타일 3, 생성 이력 3, 피드백 2, 성과 3, 참고 영상 2)

### 추가: 서버
- Provider 계층 (`lib/server/providers`): AIProvider, YouTubeTrendProvider, NaverTrendProvider, ProductDataCollector 인터페이스 + Registry
  - Mock: AI(결정적 작성기), YouTube, NAVER, URL·이미지 Collector
  - 실제: OpenAIProvider(fetch), TextCollector, YouTube·NAVER testConnection
- AI Memory (`lib/server/ai`): ContextBuilder, 버전 관리 프롬프트 템플릿 8종, 프롬프트 렌더러
- Repository 계층: 인터페이스 + 인메모리 구현 (globalThis 싱글톤)
- 보안: AES-256-GCM API Key 암호화, 마스킹, 공개 DTO
- Service: products(수집 → 분석 → 저장), content-generation, trends, memory, connections, videos
- Route Handler 19개 (`app/api/**`)

### 추가: 화면 (23개 경로)
- 메인(채널 카드 + 요약), 채널 허브 5개, YouTube 트렌드, NAVER 트렌드(Clip/Blog), 생성 화면 7개, 제품 상세페이지 학습, 제품 라이브러리, 제품 상세(수정), 영상 URL 가져오기, AI 학습 관리(5탭), API 연결 센터, 404

### 추가: 문서
- `docs/`: PRD, ARCHITECTURE, DESIGN_SYSTEM, ROUTES, DATA_MODEL, API_PROVIDER_SPEC, AI_LEARNING_SYSTEM, FEATURE_REGISTRY, DEVELOPMENT_GUIDE, CHANGELOG, NEXT_STEPS
- `README.md` 재작성, `CLAUDE.md`에 프로젝트 규칙 추가

### 검증
- `npm run lint` 오류 0, `tsc --noEmit` 오류 0, `next build` 성공 (42개 경로)
- API 흐름 스모크 테스트 35개 항목 통과 (분석 → 저장 → 생성 → 피드백 → Memory 반영, 정직성 가드레일, 키 암호화·마스킹, 삭제)
- Playwright로 주요 화면 17개 캡처 확인, 콘솔 오류 0
