-- ════════════════════════════════════════════════════════════════
--  콘텐츠 자동화 센터 — Supabase 스키마
--  Supabase 대시보드 → SQL Editor 에 전체를 붙여넣고 [Run] 하면 된다.
--  여러 번 실행해도 안전하다 (if not exists / drop ... if exists).
--
--  규칙
--  - 컬럼 이름 = 앱 Entity 필드의 snake_case (productId → product_id)
--  - 사용자 데이터 테이블은 user_id 기본값이 auth.uid() → RLS 로 "내 데이터만" 접근
--  - 역할은 profiles.role (admin / silver / gold / vip). 신규 가입자는 silver
--  - 관리자 기능은 is_admin() 함수로 RLS 에서 허용 (service_role 키를 앱에 두지 않는다)
-- ════════════════════════════════════════════════════════════════

-- ───────── 1. 사용자 프로필 · 권한 ─────────

create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text not null default '',
  name        text not null default '',
  role        text not null default 'silver' check (role in ('admin', 'silver', 'gold', 'vip')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

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
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- 가입하면 프로필 자동 생성 (기본 역할 silver)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(coalesce(new.email, ''), '@', 1)),
    'silver'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 이 스키마를 만들기 전에 가입한 사용자가 있으면 프로필을 채운다
insert into public.profiles (id, email, name)
select u.id, coalesce(u.email, ''), coalesce(nullif(u.raw_user_meta_data ->> 'name', ''), split_part(coalesce(u.email, ''), '@', 1))
from auth.users u
on conflict (id) do nothing;

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
  channel_id       text not null,
  tone             text not null default '',
  description      text not null default '',
  rules            text[] not null default '{}',
  example_phrases  text[] not null default '{}',
  banned_phrases   text[] not null default '{}',
  is_default       boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

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

-- 자주 쓰는 조회용 인덱스
create index if not exists idx_contents_user_feature on public.generated_contents (user_id, feature_id, created_at desc);
create index if not exists idx_feedback_user_feature on public.user_feedback (user_id, feature_id, created_at desc);
create index if not exists idx_products_user on public.products (user_id, created_at desc);

-- ───────── 3. RLS (행 단위 보안) ─────────

alter table public.profiles            enable row level security;
alter table public.role_permissions    enable row level security;
alter table public.api_connections     enable row level security;
alter table public.products            enable row level security;
alter table public.product_sources     enable row level security;
alter table public.product_analyses    enable row level security;
alter table public.generated_contents  enable row level security;
alter table public.user_styles         enable row level security;
alter table public.user_feedback       enable row level security;
alter table public.performance_metrics enable row level security;
alter table public.reference_videos    enable row level security;

-- profiles: 본인 또는 관리자만 조회, 역할 변경은 관리자만
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- role_permissions: 로그인 사용자는 읽기, 변경은 관리자만
drop policy if exists "role_permissions_select" on public.role_permissions;
create policy "role_permissions_select" on public.role_permissions for select to authenticated using (true);
drop policy if exists "role_permissions_write_admin" on public.role_permissions;
create policy "role_permissions_write_admin" on public.role_permissions for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 사용자 데이터: 본인 행만
do $$
declare t text;
begin
  foreach t in array array[
    'api_connections', 'products', 'product_sources', 'product_analyses', 'generated_contents',
    'user_styles', 'user_feedback', 'performance_metrics', 'reference_videos'
  ] loop
    execute format('drop policy if exists "own_rows" on public.%I', t);
    execute format(
      'create policy "own_rows" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())',
      t
    );
  end loop;
end $$;

-- API 로 접근할 수 있게 권한 부여 (RLS 가 행 단위로 다시 거른다)
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ════════════════════════════════════════════════════════════════
--  첫 관리자 지정: 사이트에서 회원가입을 한 뒤, 아래 이메일을 바꿔서 한 번 실행한다
--  update public.profiles set role = 'admin', updated_at = now() where email = 'you@example.com';
-- ════════════════════════════════════════════════════════════════
