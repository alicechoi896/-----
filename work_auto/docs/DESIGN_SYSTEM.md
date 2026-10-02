# DESIGN SYSTEM: 콘텐츠 자동화 센터

> 이 문서는 **다른 프로젝트에서도 그대로 가져다 쓸 수 있는** 업무용 SaaS 디자인 시스템이다.
> 토큰 정의는 `app/globals.css`의 `@theme` 한 곳에만 있고, 컴포넌트는 `components/ui`에 있다.
> 새 화면을 만들 때는 **새 스타일을 만들지 말고 이 문서에 있는 조합을 고른다.**

---

## 0. 디자인 원칙 (요약)

| # | 원칙 | 한 줄 설명 |
|---|------|-----------|
| 1 | **흰색이 기본** | 페이지와 카드는 흰색(`canvas`)이다. 회색은 구분(`subtle`)과 hover(`muted`)에만 아주 옅게 쓴다 |
| 2 | **색은 의미가 있을 때만** | 파랑(`brand`)은 "행동/선택/포커스", 빨강·주황·초록은 "상태"에만 쓴다. 장식용 색은 없다 |
| 3 | **채널 색은 칩 안에만** | YouTube 빨강, Clip·Blog 초록, 도구 보라는 36px 아이콘 칩 안에서만 쓴다. 넓은 면적에는 쓰지 않는다 |
| 4 | **위계는 굵기와 회색 단계로** | 큰 글씨나 색보다 `font-weight`와 `fg → fg-muted → fg-subtle` 3단계로 위계를 만든다 |
| 5 | **한 화면에 주요 버튼(primary)은 하나** | 그 화면에서 가장 중요한 행동 하나만 파란 버튼이다 |
| 6 | **카드 하나 = 하나의 주제** | 카드는 흰 배경, 1px 옅은 테두리, 아주 약한 그림자, 12px 모서리로 통일한다 |
| 7 | **상태 3종 세트 필수** | 비동기 영역은 Loading / Empty / Error를 모두 디자인한다 |
| 8 | **데스크톱 우선, 모바일 대응** | 1280~1440px 기준으로 설계하고, lg(1024px) 미만은 1단 구성 + 상단 메뉴로 바꾼다 |
| 9 | **다크 모드는 기본이 아니다** | `color-scheme: light`로 고정한다. 다크 모드는 별도 요구가 있을 때 토큰만 추가한다 |

---

## 1. 색상 (Color Tokens)

### 1.1 Surface / Border / Text

| 토큰 | HEX | Tailwind 클래스 | 용도 |
|------|-----|-----------------|------|
| `canvas` | `#ffffff` | `bg-canvas` | 페이지 배경, 카드, 입력창, 표 본문 |
| `subtle` | `#f8f9fb` | `bg-subtle` | 사이드바, 표 헤더, FilterBar, 카드 footer, 섹션 구분 |
| `muted` | `#f1f3f6` | `bg-muted` | hover 배경, 스켈레톤, 비활성 입력, 칩 배경 |
| `line` | `#e7e9ee` | `border-line` | 카드, 표, 구분선의 기본 테두리 |
| `line-strong` | `#d5d9e0` | `border-line-strong` | 입력창, 보조 버튼 테두리 (조작 가능한 요소) |
| `fg` | `#111827` | `text-fg` | 제목, 본문, 값 |
| `fg-muted` | `#4b5563` | `text-fg-muted` | 보조 본문, 표의 일반 셀 |
| `fg-subtle` | `#8a909c` | `text-fg-subtle` | 설명, 라벨, 캡션, placeholder, 아이콘 |

> **규칙**: 회색 배경 위에 회색 카드를 올리지 않는다. 회색(`subtle`)은 "흰 카드 사이를 나누는 바닥"이거나 "카드 안의 보조 영역"으로만 쓴다.

### 1.2 Brand (행동 색)

| 토큰 | HEX | 용도 |
|------|-----|------|
| `brand` | `#2563eb` | Primary 버튼, 선택된 탭 밑줄, 포커스 링, 링크 hover, 활성 하위 메뉴 글자 |
| `brand-hover` | `#1d4ed8` | Primary 버튼 hover |
| `brand-soft` | `#eef4ff` | Subtle 버튼 배경, 선택된 행·항목 배경, 완료 안내 박스 |
| `brand-line` | `#c7d7fe` | brand-soft 영역의 테두리 |

### 1.3 Status (상태 색, 장식 금지)

| 상태 | 글자 | 배경 | 사용처 |
|------|------|------|--------|
| success | `#15803d` | `#ecfdf3` | 연결됨, 생성 완료, 테스트 성공, 운영 중 |
| warning | `#b45309` | `#fffbeb` | 주의할 점, Context 경고, 성장률 중간 |
| danger | `#dc2626` | `#fef2f2` | 오류, 삭제 버튼, 사용 금지 표현, 급상승(Hot) |
| info | `#0369a1` | `#f0f9ff` | Mock 상태, 안내 Notice |

상태 표시는 **항상 점(dot) + 텍스트**를 함께 쓴다 (`StatusBadge`). 색만으로 상태를 구분하지 않는다.

### 1.4 Channel Accent (아이콘 칩 전용)

| 채널 | 아이콘 색 | 칩 배경 |
|------|----------|--------|
| YouTube | `#e5484d` | `#fff1f1` |
| NAVER 클립 | `#0ea472` | `#ebfbf4` |
| NAVER 블로그 | `#16a34a` | `#effcf2` |
| 공통 도구 | `#6d5bd0` | `#f4f2ff` |
| 설정·기타 | `#4b5563` | `#f1f3f6` |

`IconChip` 컴포넌트만 이 색을 쓴다. 버튼, 배지, 배경에 채널 색을 쓰면 화면이 알록달록해지므로 금지한다.

### 1.5 다른 프로젝트에 적용하는 방법

1. `app/globals.css`의 `@theme` 블록을 복사한다.
2. `--color-brand*` 4개만 브랜드 색으로 바꾼다 (명도가 비슷한 600/700/50/200 단계).
3. `--color-ch-*`를 그 서비스의 1차 메뉴 그룹 수만큼 정의한다.
4. 컴포넌트는 semantic 클래스(`bg-canvas`, `text-fg-muted`)만 쓰므로 수정할 필요가 없다.

---

## 2. 타이포그래피

**폰트**: Pretendard Variable (`next/font/local`로 로컬 번들, 외부 요청 없음)
대체 폰트: `-apple-system, "Apple SD Gothic Neo", "Malgun Gothic", "Segoe UI", sans-serif`
자간: `-0.01em` (한글이 넓어 보이지 않도록)

| 역할 | 크기 / 굵기 / 색 | 예시 위치 |
|------|------------------|-----------|
| Page title (H1) | 22px / 700 / `fg` / `tracking-tight` | PageHeader 제목 |
| Card title (H2) | 15px / 600 / `fg` | SectionCard 제목 |
| Item title (H3) | 15~17px / 600 / `fg` | FeatureCard, ChannelCard, ProductCard 제목 |
| Body | 14px / 400 / `fg` 또는 `fg-muted` | 본문, 표 셀 |
| Description | 13~13.5px / 400 / `fg-subtle` | 카드 설명, 페이지 설명 |
| Label | 13px / 500 / `fg` | FormField 라벨 |
| Caption | 11.5~12px / 400~500 / `fg-subtle` | 표 헤더, 필터 라벨, 보조 정보 |
| Section label | 11px / 600 / `fg-subtle` / uppercase | 사이드바 그룹명 ("채널", "관리") |
| Stat number | 22px / 700 / `tabular-nums` | StatTile |

- 숫자가 들어가는 열, 날짜, 카운트는 `.tabular` 클래스(고정폭 숫자)를 쓴다.
- 줄 간격은 설명 `leading-relaxed`(1.625), 긴 본문 `leading-7`.
- **굵기는 400 / 500 / 600 / 700 네 단계만** 쓴다.

---

## 3. 간격 (Spacing)

4px 그리드를 쓰고, 자주 쓰는 값은 아래로 고정한다.

| 용도 | 값 | Tailwind |
|------|----|----------|
| 페이지 좌우 여백 | 16 / 32 / 40px (모바일 / sm / lg) | `px-4 sm:px-8 lg:px-10` |
| 페이지 상하 여백 | 32 / 40px | `py-8 lg:py-10` |
| PageHeader 아래 | 32px | `mb-8` |
| 카드 그리드 간격 | 16px | `gap-4` |
| 큰 섹션 사이 | 20~24px | `space-y-5` / `space-y-6` |
| 카드 내부 패딩 | 20px (헤더 `px-5 py-4`) | `p-5` |
| 폼 필드 사이 | 세로 20px, 가로 16px | `gap-y-5 gap-x-4` |
| 라벨 ↔ 입력 | 6px | `gap-1.5` |
| 버튼 사이 | 8px | `gap-2` |

**최대 폭**: 일반 1200px, 넓은 화면(표·2단 생성) 1440px (`PageContainer width="wide"`).

---

## 4. 테두리 · 모서리 · 그림자

| 토큰 | 값 | 용도 |
|------|----|------|
| `rounded-control` | 8px | 버튼, 입력창, 세그먼트, 작은 박스 |
| `rounded-card` | 12px | 카드, 패널, FilterBar, Notice |
| `rounded-md` | 6px | 태그(Tag), 아이콘 버튼, 썸네일 |
| `rounded-full` | - | Badge, 카운트, 아바타, 점 |
| `shadow-card` | `0 1px 2px /4%, 0 1px 3px /3%` | 모든 카드의 기본 그림자 (거의 안 보일 정도) |
| `shadow-card-hover` | `0 4px 12px /7%` | 클릭 가능한 카드 hover |
| `shadow-pop` | `0 10px 28px /12%` | 드롭다운, 툴팁, 팝오버 |

테두리 두께는 **항상 1px**이다. 강조가 필요하면 두께가 아니라 색(`line-strong`, `brand-line`)을 바꾼다.

---

## 5. 컴포넌트 규격

### 5.1 Button (`components/ui/Button.tsx`)

| variant | 모양 | 언제 |
|---------|------|------|
| `primary` | 파란 배경, 흰 글자, shadow-card | 화면의 **주요 행동 1개** (생성하기, 분석하기, 저장, 연결하기) |
| `secondary` (기본) | 흰 배경, `line-strong` 테두리 | 보조 행동 (테스트, 수정, 취소, 다시 시도) |
| `subtle` | `brand-soft` 배경, 파란 글자 | 강조되지만 주 행동은 아닌 것 (콘텐츠 만들기 메뉴) |
| `ghost` | 배경 없음, hover 시 `muted` | 표 안의 가벼운 행동, 취소 |
| `danger` | 흰 배경, 빨간 글자 | 삭제, 연결 해제 |

| size | 높이 | 글자 |
|------|------|------|
| `sm` | 32px | 13px |
| `md` (기본) | 36px | 14px |
| `lg` | 44px | 15px |

- 아이콘은 왼쪽(`icon`) 또는 오른쪽(`iconRight`)에 하나만 둔다. 크기는 sm 14px, 그 외 16px.
- 비동기 동작은 `loading`을 쓴다 (스피너 + 비활성).
- 페이지 이동은 `LinkButton`을 쓴다 (`<a>`이므로 새 탭 열기가 된다).
- 아이콘만 있는 버튼은 `IconButton`이며 `label`(aria-label + title)이 필수다.
- 저장 결과를 버튼 안에서 보여줘야 하면 `SaveButton`을 쓴다 (idle → saving → saved).

### 5.2 Card

| 종류 | 컴포넌트 | 구성 |
|------|----------|------|
| 정보 블록 | `SectionCard` | [아이콘] 제목 / 설명 / 오른쪽 actions → 본문 → (선택) footer |
| 이동 카드 | `ChannelCard`, `FeatureCard` | 카드 전체가 링크. hover 시 `-translate-y-0.5` + `shadow-card-hover` + `line-strong` |
| 데이터 카드 | `ProductCard` | 썸네일 → 메타 → 제목 → 요약 → 메타 표 → footer(행동) |
| 숫자 요약 | `StatTile` | 라벨 / 큰 숫자 + 단위 / 힌트 |

공통 외곽: `rounded-card border border-line bg-canvas shadow-card` (`cardClass` 상수)
카드 footer: `border-t border-line bg-subtle/60 px-5 py-3`
본문을 꽉 채우는 표·목록은 `SectionCard flush`를 쓴다.

### 5.3 Form

- 모든 입력은 `FormField`로 감싼다: **라벨(13px/500) → 입력 → 힌트 또는 오류(12px)**
- 필수는 빨간 `*`, 선택은 회색 "(선택)"
- 입력창(`Input`, `Textarea`, `Select`)은 같은 `controlClass`를 공유한다:
  높이 36px, 테두리 `line-strong`, focus 시 테두리 `brand` + 3px `brand/15` 링
- 오류는 입력창 `aria-invalid` + FormField `error`로 표시한다 (빨간 테두리 + 빨간 문구)
- 2~5개 옵션 중 하나를 고를 때는 `Select`보다 `SegmentedControl`을 쓴다 (한눈에 보이므로)
- 폼 제출 버튼은 폼 카드 footer 오른쪽에 두고, 왼쪽에 남은 필수 항목 수를 보여준다
- 생성형 기능은 `DynamicField` + Generator Config로 폼을 만든다 (직접 마크업 금지)

### 5.4 Table (`DataTable`)

- 헤더: `bg-subtle`, 12px/500, `fg-subtle`, 아래 테두리
- 행: 세로 패딩 12px(`dense`면 8px), 행 사이 1px `line`, hover `bg-subtle/70`
- 숫자 열은 `numeric: true` → 오른쪽 정렬 + tabular-nums
- 행 안의 행동은 오른쪽 끝 열에 `IconButton` 또는 작은 링크로 둔다
- 빈 결과는 `empty` prop에 `EmptyState`를 넘긴다
- 셀 안에 태그가 많으면 2개만 보여주고 `+N`으로 줄인다 (행 높이 유지)

### 5.5 Tabs / Segmented

| 컴포넌트 | 모양 | 용도 |
|----------|------|------|
| `Tabs` | 밑줄형, 선택 시 `brand` 2px 밑줄 + 카운트 칩 | 페이지 안의 큰 영역 전환 (AI 학습 관리, 입력 방식) |
| `SegmentedControl` | 회색 트랙 안의 흰 버튼 | 작은 옵션 전환 (기간, 영상 유형, 보기 방식) |

### 5.6 Badge / Tag

- `Badge`: 높이 20px, 둥근 알약, 6가지 tone. 상태에는 `StatusBadge`를 쓴다.
- `Tag`: 높이 24px, 6px 모서리, `subtle` 배경. 키워드, 해시태그, 필요한 API 표시용.
- 사용하면 안 되는 표현은 danger 색 Tag + 취소선으로 표시한다.

### 5.7 Navigation

- **AppSidebar**: 248px, `bg-subtle`, 오른쪽 테두리. 그룹 라벨(11px) → 항목(32px 높이)
  - 활성 항목: 흰 배경 + `shadow-card` + `ring-line` (떠 있는 느낌)
  - 현재 채널만 하위 기능을 펼친다 (기능이 많아져도 메뉴가 길어지지 않는다)
  - 하단: Mock/Live 모드 표시, 사용자
- **PageHeader**: 브레드크럼(13px) → [아이콘 칩 44px] 제목 + 상태 배지 → 설명 / 오른쪽 actions
- **FilterBar**: `bg-subtle/70` 둥근 박스, 왼쪽 필터들(작은 라벨 + 컨트롤), 오른쪽 실행 버튼

### 5.8 Chart (`TrendLineChart`)

- 단일 시계열이면 범례를 두지 않는다 (카드 제목이 이름을 대신한다)
- 2px 라인 + 8% 불투명도 면적, 색은 `brand` 하나
- 가로 기준선 3개(0/50/100)만 두고, 축 글자는 11px `fg-subtle`
- hover 시 세로 크로스헤어 + 점 + 툴팁(`shadow-pop`)을 보여준다
- 같은 데이터를 `sr-only` 표로 제공한다 (스크린리더)
- 이중 축(dual axis)은 쓰지 않는다. 단위가 다른 두 지표는 차트 두 개로 나눈다

---

## 6. 상태 표현 (State)

| 상태 | 컴포넌트 | 규칙 |
|------|----------|------|
| 로딩 (짧음, 액션 결과 대기) | `LoadingState` spinner | 무엇을 하는 중인지 문장으로 쓴다: "저장된 학습 데이터를 불러와 생성하는 중입니다…" |
| 로딩 (목록, 표 자리) | `LoadingState variant="skeleton"` | 실제 행 높이와 비슷한 회색 막대 |
| 빈 상태 | `EmptyState` | 아이콘 원 + 제목(왜 비었는지) + 설명(무엇을 하면 되는지) + 선택 action 버튼 |
| 오류 | `ErrorState` | 빨간 아이콘 + 서버 메시지 + [다시 시도] |
| 안내 | `Notice` (info / warning / neutral) | 화면 상단의 규칙·보안 안내 |
| 완료 | `Badge tone="success"` 또는 `brand-soft` 안내 박스 | "분석이 완료되었습니다" + 다음 행동 버튼 |
| 기능 상태 | `StatusBadge` live / mock / planned | 운영(초록) / Mock(파랑) / 준비 중(회색). planned 카드는 클릭 불가 + 60% 불투명도 |
| 연결 상태 | `StatusBadge` connected / disconnected / error | 연결됨 / 미연결 / 오류 |

**모든 비동기 영역은 위 세 가지(Loading, Empty, Error)를 구현해야 완료다.**

---

## 7. 레이아웃 패턴

| 패턴 | 구조 | 사용 화면 |
|------|------|-----------|
| 카드 그리드 | `grid sm:grid-cols-2 xl:grid-cols-3/4 gap-4` | 메인, 채널 허브, 제품 라이브러리 |
| 필터 + 요약 + 표 | FilterBar → StatTile ×4 → SectionCard(flush) + DataTable | YouTube 트렌드 |
| 입력 / 결과 2단 | `xl:grid-cols-[420px_1fr]`, 왼쪽 sticky 폼 | 모든 생성형 기능 |
| 본문 + 사이드 | `xl:grid-cols-[1fr_340px]` | 제품 상세 |
| 탭 화면 | 개요 박스 → StatTile → Tabs → 탭 본문 | AI 학습 관리 |
| 단계 표시 | 알약 단계 + 화살표 (완료 초록 / 진행 파랑 / 대기 회색) | 제품 상세페이지 학습 파이프라인 |

반응형: `lg`(1024px) 미만에서 사이드바는 상단 바 + 슬라이드 메뉴로 바뀌고, 2단 레이아웃은 1단이 된다.

---

## 8. 문구 (UX Writing)

- 버튼은 **동사로 끝낸다**: "분석하기", "생성하기", "저장", "연결하기" ("확인"처럼 모호한 말은 피한다)
- 설명은 **사용자가 얻는 것** 중심으로 쓴다: "~를 찾습니다", "~를 만듭니다"
- 빈 상태는 "없습니다" 다음에 **다음 행동**을 안내한다
- 오류는 원인과 해결 방법을 함께 쓴다: "올바른 상품 URL을 입력해 주세요."
- 존댓말(합니다체)로 통일하고, 영어 기술 용어는 그대로 둔다 (Hook, Trend Score, API Key)

---

## 9. 좋은 예 / 나쁜 예

| 상황 | ✅ 좋은 예 | ❌ 나쁜 예 |
|------|-----------|-----------|
| 배경 | 흰 페이지 위에 흰 카드 + 1px 테두리 | 회색 페이지 위에 흰 카드, 또는 진한 배경 |
| 강조 | 제목 굵기 600 + 설명 `fg-subtle` | 제목을 파란색으로, 설명을 더 큰 글씨로 |
| 채널 구분 | 36px 아이콘 칩만 채널 색 | 카드 전체 배경을 채널 색으로 칠함 |
| 버튼 | 화면에 primary 1개 + 나머지 secondary | primary 버튼 3~4개가 나란히 |
| 상태 | `● 연결됨` (점 + 글자) | 초록 글자만, 또는 아이콘만 |
| 그림자 | `shadow-card` (거의 안 보임) | `shadow-lg` 진한 그림자 |
| 모서리 | 카드 12px, 버튼 8px로 통일 | 화면마다 4px, 16px, 24px이 섞임 |
| 표 | 숫자 오른쪽 정렬 + 고정폭 | 숫자 가운데 정렬, 자릿수가 들쭉날쭉 |
| 태그 | 2개 + `+1` | 태그 6개가 줄바꿈되며 행 높이가 커짐 |
| 로딩 | "제품을 분석하는 중입니다…" | 빈 화면, 또는 "Loading…" |
| 빈 상태 | "저장된 제품이 없습니다 / 제품 학습하기 →" | "데이터 없음" |
| 새 화면 | `SectionCard` + `FormField` 조합 | 새 div에 새 클래스 조합으로 직접 스타일링 |
| 색 지정 | `text-fg-muted` | `text-gray-600`, `#4b5563` 하드코딩 |

---

## 10. 체크리스트 (새 화면 PR 전에)

- [ ] 페이지는 `PageContainer` + `PageHeader`(또는 `FeaturePageHeader`)로 시작한다
- [ ] 색은 semantic 토큰만 썼다 (`gray-*`, HEX 하드코딩 없음)
- [ ] primary 버튼은 1개다
- [ ] 비동기 영역에 Loading / Empty / Error가 있다
- [ ] 입력은 모두 `FormField` 안에 있다
- [ ] 숫자 열은 `numeric` / `.tabular`다
- [ ] 아이콘만 있는 버튼에 label이 있다
- [ ] 1440px, 1024px, 390px 폭에서 확인했다
