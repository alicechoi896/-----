-- RPC: create an organization and grant the calling user 'owner' membership
-- in a single transaction. Runs as security definer because organizations
-- insert has no direct policy and organization_members insert is owner-only.

create or replace function public.create_organization(
  org_name text,
  org_industry text default null,
  org_description text default null
)
returns public.organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org public.organizations;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  insert into public.organizations (name, industry, description)
  values (org_name, org_industry, org_description)
  returning * into new_org;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_org.id, auth.uid(), 'owner');

  return new_org;
end;
$$;

-- Vector similarity search over document_chunks, scoped to one organization.
-- Runs with invoker rights so RLS still applies for the calling role; the
-- server-side pipeline/query code always passes organization_id explicitly.

create or replace function public.match_document_chunks(
  query_embedding vector(1536),
  match_organization_id uuid,
  match_count int default 8,
  match_source_types text[] default null,
  match_data_source_id uuid default null,
  min_similarity float default 0.0
)
returns table (
  id uuid,
  data_source_id uuid,
  chunk_index int,
  content text,
  metadata jsonb,
  similarity float
)
language sql
stable
as $$
  select
    c.id,
    c.data_source_id,
    c.chunk_index,
    c.content,
    c.metadata,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.document_chunks c
  join public.data_sources d on d.id = c.data_source_id
  where c.organization_id = match_organization_id
    and c.embedding is not null
    and (match_source_types is null or d.source_type = any(match_source_types))
    and (match_data_source_id is null or c.data_source_id = match_data_source_id)
    and (1 - (c.embedding <=> query_embedding)) >= min_similarity
  order by c.embedding <=> query_embedding
  limit match_count;
$$;
