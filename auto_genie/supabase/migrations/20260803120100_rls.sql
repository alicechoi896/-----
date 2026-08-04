-- Row Level Security: every organization-scoped table is only visible to
-- members of that organization. Writes to organization_members (invites) are
-- owner-only; membership itself is granted through the create_organization
-- RPC (security definer) so the first insert doesn't need a pre-existing row.

create or replace function public.is_org_member(target_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org_id
      and m.user_id = auth.uid()
  );
$$;

create or replace function public.is_org_owner(target_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = target_org_id
      and m.user_id = auth.uid()
      and m.role = 'owner'
  );
$$;

-- organizations ---------------------------------------------------------

alter table public.organizations enable row level security;

create policy organizations_select on public.organizations
  for select using (public.is_org_member(id));

create policy organizations_update on public.organizations
  for update using (public.is_org_owner(id));

-- organization creation happens through the create_organization() RPC, which
-- runs as security definer, so no direct insert policy is granted here.

-- organization_members ---------------------------------------------------

alter table public.organization_members enable row level security;

create policy organization_members_select on public.organization_members
  for select using (public.is_org_member(organization_id));

create policy organization_members_insert on public.organization_members
  for insert with check (public.is_org_owner(organization_id));

create policy organization_members_update on public.organization_members
  for update using (public.is_org_owner(organization_id));

create policy organization_members_delete on public.organization_members
  for delete using (public.is_org_owner(organization_id));

-- generic org-scoped tables ----------------------------------------------

do $$
declare
  t text;
  org_scoped_tables text[] := array[
    'data_sources', 'document_chunks', 'knowledge_entities', 'knowledge_evidence',
    'knowledge_relations', 'decision_rules', 'brand_profiles', 'campaigns',
    'strategy_runs', 'strategy_options', 'content_projects', 'content_outputs',
    'performance_records', 'preference_weights', 'learning_events',
    'processing_jobs', 'audit_logs'
  ];
begin
  foreach t in array org_scoped_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I_select on public.%I for select using (public.is_org_member(organization_id))',
      t, t);
    execute format(
      'create policy %I_insert on public.%I for insert with check (public.is_org_member(organization_id))',
      t, t);
    execute format(
      'create policy %I_update on public.%I for update using (public.is_org_member(organization_id))',
      t, t);
    execute format(
      'create policy %I_delete on public.%I for delete using (public.is_org_member(organization_id))',
      t, t);
  end loop;
end;
$$;
