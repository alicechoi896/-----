# SUPABASE SETUP — 데이터베이스와 로그인 연결 가이드

> 이 순서대로 하면 "데모 모드(메모리 저장, 로그인 없음)"에서 "실제 서비스 모드(DB 저장 + 로그인 + 등급 권한)"로 바뀝니다.
> 소요 시간: 약 15분

---

## 1단계. Supabase 프로젝트 만들기

0. 처음이면 **Organization** 부터 만든다: 이름은 자유 (예: `flowai` 또는 본인 이름), Type: Personal, Plan: **Free**
1. https://supabase.com/dashboard 접속 → **New project**
2. 입력
   - Name: `content-automation-center` (자유)
   - Database Password: 강력한 비밀번호 (따로 보관)
   - Region: **Northeast Asia (Seoul)**
3. [Create new project] → 1~2분 기다림

## 2단계. 테이블 만들기 (SQL 실행)

1. 왼쪽 메뉴 **SQL Editor** → **New query**
2. 프로젝트의 `supabase/schema.sql` 파일 내용을 **전체 복사**해서 붙여넣기
3. 오른쪽 아래 **[Run]**
4. "Success. No rows returned" 가 나오면 완료
5. 확인: 왼쪽 **Table Editor** 에 `profiles`, `role_permissions`, `audit_logs`, `products` 등 12개 테이블이 보이면 정상
6. 결과 창에 `pg_cron 예약 실패` 알림이 보이면: 왼쪽 **Integrations → Cron** 을 켠 뒤 SQL 을 한 번 더 실행 (보관 기간이 지난 데이터 자동 삭제용, 없어도 서비스는 동작)

> 여러 번 실행해도 안전합니다. 나중에 스키마가 바뀌면 같은 방법으로 다시 실행합니다.

## 3단계. 로그인 설정

왼쪽 메뉴 **Authentication**

1. **Sign In / Providers → Email**: Enabled 인지 확인 (기본값 켜짐)
   - **Confirm email** (가입 시 인증 메일): **끄는 것을 추천합니다**
     - 이 서비스는 관리자 승인제라서, 메일 인증 없이도 승인 전에는 아무 메뉴도 쓸 수 없습니다
     - 끄면 가입 즉시 "승인 대기" 화면으로 이동합니다
     - 켜두면 메일의 링크를 눌러야 로그인되며, Supabase 기본 메일은 시간당 발송 횟수 제한이 있습니다
   - 비밀번호 찾기(재설정 메일)는 Confirm email 설정과 관계없이 Supabase 기본 메일로 발송됩니다
2. **URL Configuration**
   - Site URL: `https://work-auto-blush.vercel.app`
   - Redirect URLs 에 추가:
     - `https://work-auto-blush.vercel.app/auth/callback`
     - `http://localhost:3000/auth/callback` (내 컴퓨터에서 개발할 때)

> 참고: Supabase 기본 메일 발송은 시간당 횟수 제한이 있습니다. 사용자가 많아지면 Authentication → SMTP Settings 에서 메일 서비스를 연결하세요.

## 4단계. 키 확인

왼쪽 아래 **Project Settings → API** (또는 Data API)

| 화면의 이름 | 환경변수 이름 | 비밀 여부 |
|-------------|---------------|-----------|
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` | 공개해도 됨 |
| anon public key (또는 Publishable key) | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 공개해도 됨 (RLS 가 보호) |
| service_role key (Secret key) | **사용하지 않음** | ⚠️ 절대 공유 금지 |

## 5단계. Vercel 에 환경변수 넣기

**방법 A — Vercel 화면에서 직접**
1. https://vercel.com → `flowai` 팀 → **work-auto** 프로젝트 → **Settings → Environment Variables**
2. 아래 3개 추가 (Environment: Production, Preview 모두 체크)

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | 4단계의 Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 4단계의 anon public key |
| `PROVIDER_MODE` | `live` |

3. **Deployments** 탭 → 최신 배포의 [⋯] → **Redeploy**
   (`NEXT_PUBLIC_` 값은 빌드할 때 들어가므로 반드시 다시 배포해야 합니다)

**방법 B — Claude 에게 요청**
Project URL 과 anon key 를 알려주면 CLI 로 넣고 다시 배포합니다. (둘 다 공개 키라 공유해도 안전합니다. service_role 키는 보내지 마세요)

## 6단계. 첫 관리자 만들기

1. 배포된 사이트 접속 → 로그인 화면 → **회원가입** (이름, 이메일, 비밀번호, 약관 동의) → [가입 신청]
2. 인증 메일이 오면 링크 클릭 (3단계에서 Confirm email 을 껐다면 생략)
3. 이 시점에는 **승인 대기** 화면이 보입니다 (첫 사용자는 승인해 줄 관리자가 없으므로 SQL 로 지정)
4. Supabase **SQL Editor** 에서 이메일을 바꿔 실행:
   ```sql
   update public.profiles
   set role = 'admin', status = 'active', approved_at = now(), updated_at = now()
   where email = '내이메일@example.com';
   ```
5. 사이트를 새로고침 → 사이드바에 **관리자 → 사이트 관리** 가 보이면 완료
6. 이후 가입하는 사람은 **사이트 관리 → 가입 승인** 에서 등급을 정해 승인합니다. 등급 변경은 **사용자 관리** (SQL 필요 없음)

## 7단계. 확인 체크리스트

- [ ] 로그아웃 상태로 사이트에 들어가면 로그인 화면으로 이동한다
- [ ] 회원가입한 새 사용자는 "승인 대기" 화면만 보인다
- [ ] 관리자가 가입 승인에서 승인하면, 그 사용자가 새로고침했을 때 메뉴가 보인다
- [ ] 실버로 승인된 사용자는 제품 관련 메뉴가 잠겨 있다
- [ ] 내 정보에서 이름·비밀번호를 바꿀 수 있고, 활동 기록에 남는다
- [ ] 로그아웃 → "비밀번호를 잊으셨나요?" → 재설정 메일 → 새 비밀번호로 로그인된다
- [ ] 관리자 계정으로 사용자 관리에서 등급을 골드로 바꾸면, 그 사용자가 새로고침했을 때 제품 메뉴가 열린다
- [ ] 권한 관리에서 체크를 바꾸면 해당 등급 사용자의 메뉴가 바뀐다
- [ ] 제품을 저장하고 다시 배포해도 제품이 남아 있다 (DB 저장 확인)
- [ ] API 연결 센터에서 YouTube 키를 넣고 [테스트] → "정상적으로 연결되었습니다"
- [ ] YouTube 트렌드 찾기에 실제 영상(썸네일 이미지)이 나온다

## 문제 해결

| 증상 | 원인 / 해결 |
|------|-------------|
| 로그인 화면에 "데모 모드로 실행 중" | Vercel 환경변수가 없거나 다시 배포하지 않음 → 5단계 |
| 가입 후 메일이 안 옴 | 스팸함 확인 / Supabase 메일 발송 한도 초과 → 잠시 후 재시도 또는 Confirm email 끄기 |
| 메일 링크를 누르면 "인증 링크가 만료" | 3단계 Redirect URLs 에 `/auth/callback` 주소가 없음 |
| "데이터베이스 처리 중 오류" | 2단계 SQL 이 실행되지 않음 → Table Editor 에 테이블이 있는지 확인 |
| 관리자로 바꿨는데 메뉴가 안 보임 | SQL 의 이메일 오타 확인, `status = 'active'` 도 함께 바꿨는지 확인 → 로그아웃 후 다시 로그인 |
| 비밀번호 재설정 메일이 안 옴 | 스팸함 확인 / Supabase 기본 메일 시간당 한도 초과 → 1시간 뒤 재시도 |
| 사이트가 느리거나 로그인 화면으로 계속 감 | Supabase 무료 프로젝트는 7일간 사용이 없으면 일시정지됨 → 대시보드에서 Restore |

## 데모 모드로 되돌리기

Vercel 에서 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` 를 지우고 다시 배포하면 데모 모드(로그인 없음, 데모 관리자)로 돌아갑니다.
