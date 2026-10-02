-- ════════════════════════════════════════════════════════════════
--  콘텐츠 자동화 센터 — Supabase 스키마
--  Supabase 대시보드 → SQL Editor 에 전체를 붙여넣고 [Run] 하면 된다.
--  여러 번 실행해도 안전하다 (if not exists / drop ... if exists).
--
--  규칙
--  - 컬럼 이름 = 앱 Entity 필드의 snake_case (productId → product_id)
--  - 사용자 데이터 테이블은 user_id 기본값이 auth.uid() → RLS 로 "내 데이터만" 접근
--  - 역할은 profiles.role (admin / silver / gold / vip). 신규 가입자는 silver + 승인 대기(pending)
--  - 가입은 관리자 승인제: profiles.status (pending / active / rejected)
--  - 관리자 기능은 is_admin() 함수로 RLS 에서 허용 (service_role 키를 앱에 두지 않는다)
-- ════════════════════════════════════════════════════════════════

-- ───────── 1. 사용자 프로필 · 권한 ─────────

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null default '',
  name        text not null default '',
  role        text not null default 'silver' check (role in ('admin', 'silver', 'gold', 'vip')),
  status      text not null default 'pending',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- (이전 버전 스키마를 이미 실행했어도 안전하게 컬럼을 추가한다)
alter table public.profiles add column if not exists status text not null default 'pending';
alter table public.profiles add column if not exists approved_at timestamptz;
alter table public.profiles add column if not exists approved_by uuid;
alter table public.profiles add column if not exists terms_agreed_at timestamptz;
do $$ begin
  alter table public.profiles add constraint profiles_status_check check (status in ('pending', 'active', 'rejected'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.profiles
    add constraint profiles_approved_by_fkey foreign key (approved_by) references public.profiles (id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.role_permissions (
  id              text primary key,                -- '{role}:{permission_key}'
  role            text not null check (role in ('silver', 'gold', 'vip')),
  permission_key  text not null,                   -- 기능 ID (lib/registry/features.ts) 또는 단독 페이지 ID
  allowed         boolean not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (role, permission_key)
);

-- 관리자 여부 (RLS 정책 안에서 쓴다). security definer 로 profiles 의 RLS 를 우회해 무한 재귀를 막는다
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active');
$$;

-- 승인된 사용자 여부 (서비스 데이터는 승인된 사용자만 쓸 수 있다)
create or replace function public.is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'active');
$$;

-- 가입하면 프로필 자동 생성 (실버 + 승인 대기, 약관 동의 시각 기록)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, role, status, terms_agreed_at)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(coalesce(new.email, ''), '@', 1)),
    'silver',
    'pending',
    nullif(new.raw_user_meta_data ->> 'terms_agreed_at', '')::timestamptz
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 본인이 프로필을 수정할 때는 이름만 바뀌도록 한다 (역할·승인 상태는 관리자만)
-- security invoker: current_user 로 "앱(로그인 사용자)을 통한 요청"인지 구분한다.
-- SQL Editor(postgres) 에서 실행하는 첫 관리자 지정 SQL 은 막지 않는다.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user in ('authenticated', 'anon') and not public.is_admin() then
    new.role := old.role;
    new.status := old.status;
    new.approved_at := old.approved_at;
    new.approved_by := old.approved_by;
    new.email := old.email;
    new.terms_agreed_at := old.terms_agreed_at;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_fields on public.profiles;
create trigger protect_profile_fields
  before update on public.profiles
  for each row execute function public.protect_profile_fields();

-- 회원 탈퇴: 본인 계정 삭제 → 내 데이터는 on delete cascade 로 함께 삭제된다
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- 이 스키마를 만들기 전에 가입한 사용자가 있으면 프로필을 채운다
insert into public.profiles (id, email, name)
select u.id, coalesce(u.email, ''), coalesce(nullif(u.raw_user_meta_data ->> 'name', ''), split_part(coalesce(u.email, ''), '@', 1))
from auth.users u
on conflict (id) do nothing;

-- 활동 기록 (감사 로그). 수행자가 탈퇴해도 남도록 FK 없이 이메일·이름을 복사해 둔다
create table if not exists public.audit_logs (
  id            text primary key,
  actor_id      uuid not null,
  actor_email   text not null default '',
  actor_name    text not null default '',
  action        text not null,
  target_type   text not null,
  target_id     text,
  target_label  text,
  detail        jsonb not null default '{}',
  created_at    timestamptz not null default now()
);
create index if not exists idx_audit_logs_created on public.audit_logs (created_at desc);

-- ───────── 2. 서비스 데이터 ─────────

create table if not exists public.api_connections (
  id                     text primary key,
  user_id                uuid not null default auth.uid() references auth.users (id) on delete cascade,
  provider               text not null,
  status                 text not null,
  encrypted_credentials  text,            -- AES-256-GCM 암호문 (서버 ENCRYPTION_KEY 로만 복호화 가능)
  masked_hint            text,
  last_test              jsonb,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists public.products (
  id                   text primary key,
  user_id              uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name                 text not null,
  brand                text not null default '',
  category             text not null default '',
  seller               text not null default '',
  image_url            text,
  source_url           text,
  one_liner            text not null default '',
  key_benefits         text[] not null default '{}',
  tags                 text[] not null default '{}',
  current_analysis_id  text not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  last_used_at         timestamptz
);

create table if not exists public.product_sources (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id  text not null references public.products (id) on delete cascade,
  type        text not null,
  raw         jsonb not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.product_analyses (
  id            text primary key,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  product_id    text not null references public.products (id) on delete cascade,
  version       int not null default 1,
  basic_info    jsonb not null,
  summary       jsonb not null,
  content_data  jsonb not null,
  meta          jsonb not null,
  created_at    timestamptz not null default now()
);

create table if not exists public.generated_contents (
  id              text primary key,
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id      text,
  feature_id      text not null,
  channel_id      text not null,
  product_id      text references public.products (id) on delete set null,
  input           jsonb not null default '{}',
  output          jsonb not null default '{}',
  headline        text not null default '',
  prompt_id       text not null,
  prompt_version  text not null,
  provider        text not null,
  model           text not null,
  context         jsonb not null default '{}',
  is_exemplar     boolean not null default false,
  rating          text,
  created_at      timestamptz not null default now()
);

create table if not exists public.user_styles (
  id               text primary key,
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name             text not null,
  channel_id       text,
  channel_ids      text[] not null default '{}',
  tone             text not null default '',
  description      text not null default '',
  rules            text[] not null default '{}',
  example_phrases  text[] not null default '{}',
  banned_phrases   text[] not null default '{}',
  hooks            text[] not null default '{}',
  ctas             text[] not null default '{}',
  is_default       boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- v0.6.0: 스타일 적용 채널 여러 개(channel_ids), Hook·CTA 목록. 예전 channel_id 값을 옮긴다
alter table public.user_styles add column if not exists channel_ids text[] not null default '{}';
alter table public.user_styles add column if not exists hooks text[] not null default '{}';
alter table public.user_styles add column if not exists ctas text[] not null default '{}';
alter table public.user_styles alter column channel_id drop not null;
update public.user_styles set channel_ids = array[channel_id], channel_id = null
  where channel_id is not null and channel_id <> 'all' and channel_ids = '{}';
update public.user_styles set channel_id = null where channel_id = 'all';

create table if not exists public.user_feedback (
  id             text primary key,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  content_id     text not null references public.generated_contents (id) on delete cascade,
  feature_id     text not null,
  rating         text not null check (rating in ('up', 'down')),
  reason         text,
  edited_output  jsonb,
  created_at     timestamptz not null default now()
);

create table if not exists public.performance_metrics (
  id            text primary key,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  content_id    text not null references public.generated_contents (id) on delete cascade,
  channel_id    text not null,
  platform_url  text,
  views         bigint,
  clicks        bigint,
  ctr           numeric,
  likes         bigint,
  comments      bigint,
  conversions   bigint,
  revenue       numeric,
  source        text not null,
  measured_at   timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create table if not exists public.reference_videos (
  id               text primary key,
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  url              text not null,
  platform         text not null,
  title            text not null,
  channel_name     text not null default '',
  duration_sec     int not null default 0,
  thumbnail_color  text not null default '#f1f3f5',
  thumbnail_url    text,
  note             text,
  created_at       timestamptz not null default now(),
  unique (user_id, url)
);

-- 사용자별 설정 (한 사람당 1행, id = 사용자 ID). 기본 AI 등 작은 값만 담는다
create table if not exists public.user_settings (
  id            uuid primary key references auth.users (id) on delete cascade,
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  preferred_ai  text check (preferred_ai in ('openai', 'claude')),
  profile_seeded_at timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
-- v0.9.1: 예시 콘텐츠 프로필을 자동으로 만든 시각 (한 번만 만든다)
alter table public.user_settings add column if not exists profile_seeded_at timestamptz;

-- 콘텐츠 프로필: "무엇을 다룰 것인가" (관심분야). 트렌드 조사 범위와 생성 Context 에 쓴다 (docs/CONTENT_PROFILE.md)
create table if not exists public.content_profiles (
  id                    text primary key,
  user_id               uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name                  text not null,
  description           text not null default '',
  main_category         text not null,
  sub_categories        text[] not null default '{}',
  seed_keywords         text[] not null default '{}',
  exclude_keywords      text[] not null default '{}',
  default_trend_period  integer not null default 21 check (default_trend_period between 1 and 3650),
  country               text not null default 'KR',
  is_default            boolean not null default false,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists idx_content_profiles_user on public.content_profiles (user_id, created_at desc);

-- v0.7.0: 스타일 → 적용 콘텐츠 프로필 (선택). 프로필을 지우면 연결만 풀린다
alter table public.user_styles add column if not exists profile_id text references public.content_profiles (id) on delete set null;

-- 저장한 검색 조건 (YouTube 트렌드 필터 등). params 는 조건 JSON
create table if not exists public.saved_filters (
  id          text primary key,
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind        text not null default 'youtube-trend',
  name        text not null,
  params      jsonb not null default '{}'::jsonb,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 찜한 트렌드 영상 (영상 정보 텍스트만 저장, 썸네일은 YouTube 주소만)
create table if not exists public.saved_trends (
  id             text primary key,
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source         text not null default 'youtube',
  trend_id       text not null,
  video_id       text not null,
  title          text not null,
  format         text not null default 'long',
  url            text not null,
  channel_name   text not null default '',
  thumbnail_url  text,
  keywords       text[] not null default '{}',
  tags           text[] not null default '{}',
  views          bigint not null default 0,
  published_at   timestamptz,
  analysis       jsonb,
  created_at     timestamptz not null default now(),
  unique (user_id, trend_id)
);

-- 자주 쓰는 조회용 인덱스
create index if not exists idx_saved_filters_user on public.saved_filters (user_id, created_at desc);
create index if not exists idx_contents_user_feature on public.generated_contents (user_id, feature_id, created_at desc);
create index if not exists idx_feedback_user_feature on public.user_feedback (user_id, feature_id, created_at desc);
create index if not exists idx_products_user on public.products (user_id, created_at desc);

-- 성능: 사용자별 목록 조회 (RLS 의 user_id = 나 조건 + 최신순 정렬)
create index if not exists idx_contents_user_created     on public.generated_contents (user_id, created_at desc);
create index if not exists idx_sources_user              on public.product_sources (user_id);
create index if not exists idx_analyses_user             on public.product_analyses (user_id);
create index if not exists idx_styles_user               on public.user_styles (user_id, created_at desc);
create index if not exists idx_feedback_user_created     on public.user_feedback (user_id, created_at desc);
create index if not exists idx_performance_user          on public.performance_metrics (user_id);
create index if not exists idx_videos_user_created       on public.reference_videos (user_id, created_at desc);
create index if not exists idx_audit_logs_actor          on public.audit_logs (actor_id);
create index if not exists idx_profiles_status           on public.profiles (status, created_at desc);

-- 성능: 외래키 컬럼 (조인, 부모 삭제 시 cascade 검색이 빨라진다)
create index if not exists idx_sources_product           on public.product_sources (product_id);
create index if not exists idx_analyses_product          on public.product_analyses (product_id);
create index if not exists idx_contents_product          on public.generated_contents (product_id);
create index if not exists idx_feedback_content          on public.user_feedback (content_id);
create index if not exists idx_performance_content       on public.performance_metrics (content_id);

-- ───────── 3. RLS (행 단위 보안) ─────────

alter table public.profiles            enable row level security;
alter table public.role_permissions    enable row level security;
alter table public.audit_logs          enable row level security;
alter table public.api_connections     enable row level security;
alter table public.products            enable row level security;
alter table public.product_sources     enable row level security;
alter table public.product_analyses    enable row level security;
alter table public.generated_contents  enable row level security;
alter table public.user_styles         enable row level security;
alter table public.user_feedback       enable row level security;
alter table public.performance_metrics enable row level security;
alter table public.reference_videos    enable row level security;
alter table public.user_settings       enable row level security;
alter table public.saved_filters       enable row level security;
alter table public.saved_trends        enable row level security;
alter table public.content_profiles    enable row level security;

-- profiles: 본인 또는 관리자만 조회. 역할·승인 변경은 관리자만
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
-- 본인 수정은 이름만 (protect_profile_fields 트리거가 나머지를 되돌린다)
drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- audit_logs: 본인 명의로만 기록, 조회는 관리자만, 수정·삭제 불가
drop policy if exists "audit_insert_self" on public.audit_logs;
create policy "audit_insert_self" on public.audit_logs for insert to authenticated
  with check (actor_id = (select auth.uid()));
drop policy if exists "audit_select_admin" on public.audit_logs;
create policy "audit_select_admin" on public.audit_logs for select to authenticated
  using ((select public.is_admin()));

-- role_permissions: 로그인 사용자는 읽기, 변경은 관리자만
drop policy if exists "role_permissions_select" on public.role_permissions;
create policy "role_permissions_select" on public.role_permissions for select to authenticated using (true);
drop policy if exists "role_permissions_write_admin" on public.role_permissions;
create policy "role_permissions_write_admin" on public.role_permissions for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- 사용자 데이터: 본인 행만 + 관리자 승인된 사용자만
do $$
declare t text;
begin
  foreach t in array array[
    'api_connections', 'products', 'product_sources', 'product_analyses', 'generated_contents',
    'user_styles', 'user_feedback', 'performance_metrics', 'reference_videos', 'user_settings',
    'saved_filters', 'saved_trends', 'content_profiles'
  ] loop
    execute format('drop policy if exists "own_rows" on public.%I', t);
    execute format(
      'create policy "own_rows" on public.%I for all to authenticated using (user_id = (select auth.uid()) and (select public.is_active())) with check (user_id = (select auth.uid()) and (select public.is_active()))',
      t
    );
  end loop;
end $$;

-- 통계 갱신: 쿼리 계획이 새 인덱스를 바로 활용하도록
analyze public.profiles, public.role_permissions, public.audit_logs, public.products, public.generated_contents,
        public.user_feedback, public.user_styles, public.performance_metrics, public.reference_videos;

-- API 로 접근할 수 있게 권한 부여 (RLS 가 행 단위로 다시 거른다)
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ───────── 4. 보관 기간이 지난 데이터 자동 삭제 (개인정보처리방침 제3조) ─────────
--  - 거절된 가입 신청: 거절 후 30일
--  - 탈퇴한 사용자의 활동 기록: 탈퇴 후 1년
create or replace function public.purge_expired_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from auth.users u
  using public.profiles p
  where p.id = u.id and p.status = 'rejected' and p.approved_at < now() - interval '30 days';

  delete from public.audit_logs l
  where not exists (select 1 from auth.users u where u.id = l.actor_id)
    and exists (
      select 1 from public.audit_logs w
      where w.actor_id = l.actor_id and w.action = 'account.withdraw' and w.created_at < now() - interval '1 year'
    );
end;
$$;
revoke all on function public.purge_expired_data() from public, anon, authenticated;

-- 매일 새벽 3시(UTC)에 자동 실행 (Supabase 의 pg_cron 확장).
-- 확장을 켤 수 없는 환경이어도 나머지 스키마는 그대로 적용되도록 예외를 삼킨다.
-- 결과에 'pg_cron 예약 실패' 알림이 보이면 대시보드 Integrations → Cron 을 켠 뒤 이 블록만 다시 실행한다.
do $$
begin
  execute 'create extension if not exists pg_cron with schema pg_catalog';
  begin
    perform cron.unschedule('purge-expired-data');
  exception when others then null;
  end;
  perform cron.schedule('purge-expired-data', '0 3 * * *', 'select public.purge_expired_data()');
exception when others then
  raise notice 'pg_cron 예약 실패: %', sqlerrm;
end $$;

-- ════════════════════════════════════════════════════════════════
--  첫 관리자 지정: 사이트에서 회원가입을 한 뒤, 아래 이메일을 바꿔서 한 번 실행한다
--  (승인 대기 상태로 가입되므로 status 도 함께 바꾼다)
--
--  update public.profiles
--  set role = 'admin', status = 'active', approved_at = now(), updated_at = now()
--  where email = 'you@example.com';
-- ════════════════════════════════════════════════════════════════
