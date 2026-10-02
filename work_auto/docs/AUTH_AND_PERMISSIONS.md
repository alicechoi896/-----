# AUTH & PERMISSIONS — 로그인, 역할, 권한 구조

> 코드: `lib/permissions.ts`(규칙), `lib/server/auth.ts`(세션), `proxy.ts`(로그인 강제), `components/layout/FeaturePage.tsx`(화면 차단),
> `lib/server/services/admin.ts`(사이트 관리), `supabase/schema.sql`(DB·RLS)
> 설정 방법: [SUPABASE_SETUP.md](./SUPABASE_SETUP.md)

## 1. 역할

| 역할 | 설명 | 사이트 관리 | 메뉴 접근 |
|------|------|-------------|-----------|
| **관리자** (`admin`) | 사이트 운영자 | ✅ | 항상 전체 |
| **VIP** (`vip`) | 최상위 등급 | ❌ | 권한표에 따름 |
| **골드** (`gold`) | 중간 등급 | ❌ | 권한표에 따름 |
| **실버** (`silver`) | 기본 등급 (가입 시) | ❌ | 권한표에 따름 |

- 역할은 `profiles.role`에 저장된다. 가입하면 DB 트리거가 `silver`로 프로필을 만든다
- 역할 변경: **사이트 관리 → 사용자 관리** (관리자만). 첫 관리자만 SQL로 지정한다
- 관리자는 자기 자신의 관리자 권한을 내릴 수 없다 (관리자가 0명이 되는 사고 방지)

## 2. 권한이 정해지는 방법

```
접근 가능? = role == admin
            ? 항상 허용
            : role_permissions 에 저장된 값(관리자가 바꾼 칸)  ??  Registry 의 defaultTiers
```

- **기본값은 코드(Registry)에**: 기능마다 `defaultTiers: ["gold", "vip"]`처럼 정한다
- **바꾼 값만 DB에**: 권한 관리에서 체크를 바꾸면 `role_permissions`에 저장된다. 다시 기본값과 같게 바꾸면 저장값을 지운다
- 그래서 **새 메뉴를 추가하면 DB 작업 없이 바로 동작**하고, 권한 관리 표에도 자동으로 나타난다

### 현재 기본 등급

| 메뉴 | 실버 | 골드 | VIP |
|------|:----:|:----:|:---:|
| 트렌드 찾기 (YouTube / 클립 / 블로그) | ✅ | ✅ | ✅ |
| 정보성 영상·클립·글 만들기 | ✅ | ✅ | ✅ |
| 제품 홍보 영상·클립·블로그 글 | | ✅ | ✅ |
| 제품 상세페이지 학습, 제품 라이브러리 | | ✅ | ✅ |
| 자동 글쓰기 | | | ✅ |
| 영상 URL 가져오기, AI 학습 관리, API 연결 센터, 일반 설정 | ✅ | ✅ | ✅ |

## 3. 어디서 막는가 (3중 방어)

| 위치 | 방식 | 막는 것 |
|------|------|---------|
| `proxy.ts` | 세션 없으면 `/login?next=…`로 이동 | 비로그인 사용자의 화면 접근 |
| 화면 | `<FeaturePage featureId>`가 권한이 없으면 "권한 없음" 안내 (기능 컴포넌트는 실행되지 않음). 사이드바는 허용된 메뉴만, 허브는 잠금 카드 | 메뉴·URL 직접 입력 |
| API | `requireAccess(key)`, `requireAdmin()` → 403 | 화면을 우회한 직접 호출 |
| DB (Supabase) | RLS: 내 데이터만(`user_id = auth.uid()`), 역할 변경·권한표 수정은 `is_admin()`만 | 앱 코드 버그가 있어도 남의 데이터 접근 차단 |

## 4. 모드

| | 데모 모드 | Supabase 모드 |
|---|-----------|---------------|
| 조건 | `NEXT_PUBLIC_SUPABASE_URL` 없음 | URL + anon key 설정 |
| 로그인 | 없음 (데모 관리자) | 이메일 + 비밀번호 |
| 저장소 | 서버 메모리 (재시작 시 초기화) | Postgres |
| 등급 미리보기 | 환경변수 `DEMO_ROLE=silver` 등 | 사용자 관리에서 역할 변경 |

## 5. 새 메뉴를 추가할 때

1. `lib/registry/features.ts`에 기능 추가 → **`defaultTiers` 필수** (`ALL`, `GOLD_UP`, `VIP_ONLY` 또는 직접 배열)
2. 페이지는 `<FeaturePage featureId={FEATURE_ID}>`로 감싼다 → 화면 차단 자동
3. 이 기능 전용 API가 있으면 Route Handler 첫 줄에 `await requireAccess("기능ID")`
   (생성형 기능은 `/api/contents/generate`가 featureId로 자동 확인하므로 할 일 없음)
4. 끝. 사이드바, 허브 잠금 카드, 권한 관리 표는 자동이다

관리자 전용 기능은 `channelId: "admin"`, `adminOnly: true`, `defaultTiers: []`로 추가하고 페이지는 `<AdminPage>`로 감싼다.

## 6. 다른 프로젝트에서 재사용

이 구조는 "등급제 SaaS"에 그대로 쓸 수 있다.
- 기능 목록(Registry)에 기본 등급을 같이 적는다 → 코드가 기본값, DB는 예외만
- 권한 판단은 순수 함수 하나(`resolveAllowedKeys`)로 만들어 화면·API·사이드바가 함께 쓴다
- 관리자 판단은 DB 함수(`is_admin()`)로 만들어 RLS에서도 쓴다 → service_role 키를 앱에 두지 않아도 된다
