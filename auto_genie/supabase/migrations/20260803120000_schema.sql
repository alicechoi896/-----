-- jini-ai-marketing-brain: core schema
-- Extensions, tables, indexes, updated_at triggers.

create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. organizations
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  industry text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. organization_members
-- ---------------------------------------------------------------------------

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index organization_members_organization_id_idx on public.organization_members (organization_id);
create index organization_members_user_id_idx on public.organization_members (user_id);

-- ---------------------------------------------------------------------------
-- 3. data_sources
-- ---------------------------------------------------------------------------

create table public.data_sources (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_type text not null check (source_type in
    ('url', 'text', 'pdf', 'docx', 'txt', 'markdown', 'performance')),
  title text not null,
  source_url text,
  storage_path text,
  original_text text,
  extracted_text text,
  status text not null default 'pending' check (status in
    ('pending', 'extracting', 'chunking', 'embedding', 'analyzing', 'completed', 'failed')),
  processing_progress integer not null default 0 check (processing_progress between 0 and 100),
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index data_sources_organization_id_idx on public.data_sources (organization_id);
create index data_sources_status_idx on public.data_sources (status);
create index data_sources_source_url_idx on public.data_sources (source_url);

create trigger data_sources_set_updated_at
  before update on public.data_sources
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. document_chunks
-- ---------------------------------------------------------------------------
-- embedding dimension fixed at 1536 (text-embedding-3-small, the default
-- OPENAI_EMBEDDING_MODEL). embedding_model/embedding_dimension are stored per
-- row so a future model change is detectable; a model with a different
-- dimension requires a follow-up migration to widen the vector column.

create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  data_source_id uuid not null references public.data_sources(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  token_count integer not null default 0,
  embedding vector(1536),
  embedding_model text,
  embedding_dimension integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index document_chunks_organization_id_idx on public.document_chunks (organization_id);
create index document_chunks_data_source_id_idx on public.document_chunks (data_source_id);
create index document_chunks_embedding_idx on public.document_chunks
  using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ---------------------------------------------------------------------------
-- 5. knowledge_entities
-- ---------------------------------------------------------------------------

create table public.knowledge_entities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_type text not null check (entity_type in
    ('company', 'product', 'audience', 'customer_problem', 'desire', 'objection',
     'solution', 'expertise', 'philosophy', 'content_pattern', 'brand_expression',
     'prohibited_expression', 'platform_rule')),
  name text not null,
  summary text,
  confidence_score numeric(4,3) not null default 0 check (confidence_score between 0 and 1),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index knowledge_entities_organization_id_idx on public.knowledge_entities (organization_id);
create index knowledge_entities_entity_type_idx on public.knowledge_entities (entity_type);

create trigger knowledge_entities_set_updated_at
  before update on public.knowledge_entities
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. knowledge_evidence
-- ---------------------------------------------------------------------------

create table public.knowledge_evidence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  entity_id uuid not null references public.knowledge_entities(id) on delete cascade,
  data_source_id uuid references public.data_sources(id) on delete set null,
  chunk_id uuid references public.document_chunks(id) on delete set null,
  evidence_text text not null,
  relevance_score numeric(4,3) not null default 0 check (relevance_score between 0 and 1),
  created_at timestamptz not null default now()
);

create index knowledge_evidence_organization_id_idx on public.knowledge_evidence (organization_id);
create index knowledge_evidence_entity_id_idx on public.knowledge_evidence (entity_id);

-- ---------------------------------------------------------------------------
-- 7. knowledge_relations
-- ---------------------------------------------------------------------------

create table public.knowledge_relations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_entity_id uuid not null references public.knowledge_entities(id) on delete cascade,
  target_entity_id uuid not null references public.knowledge_entities(id) on delete cascade,
  relation_type text not null,
  description text,
  confidence_score numeric(4,3) not null default 0 check (confidence_score between 0 and 1),
  evidence jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index knowledge_relations_organization_id_idx on public.knowledge_relations (organization_id);
create index knowledge_relations_source_entity_id_idx on public.knowledge_relations (source_entity_id);
create index knowledge_relations_target_entity_id_idx on public.knowledge_relations (target_entity_id);

-- ---------------------------------------------------------------------------
-- 8. decision_rules
-- ---------------------------------------------------------------------------

create table public.decision_rules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rule_name text not null,
  condition_text text not null,
  action_text text not null,
  reason_text text not null,
  rule_category text not null default 'general',
  weight numeric(4,3) not null default 0.5 check (weight between 0 and 1),
  confidence_score numeric(4,3) not null default 0 check (confidence_score between 0 and 1),
  evidence jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index decision_rules_organization_id_idx on public.decision_rules (organization_id);
create index decision_rules_is_active_idx on public.decision_rules (is_active);

create trigger decision_rules_set_updated_at
  before update on public.decision_rules
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 9. brand_profiles
-- ---------------------------------------------------------------------------

create table public.brand_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  core_message text,
  tone jsonb not null default '[]'::jsonb,
  preferred_expressions jsonb not null default '[]'::jsonb,
  prohibited_expressions jsonb not null default '[]'::jsonb,
  target_audiences jsonb not null default '[]'::jsonb,
  persuasion_structure jsonb not null default '[]'::jsonb,
  expertise_areas jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

create index brand_profiles_organization_id_idx on public.brand_profiles (organization_id);

create trigger brand_profiles_set_updated_at
  before update on public.brand_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 10. campaigns
-- ---------------------------------------------------------------------------

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  product_entity_id uuid references public.knowledge_entities(id) on delete set null,
  goal text not null check (goal in
    ('awareness', 'views', 'saves', 'inquiries', 'consultations', 'purchases')),
  audience text,
  platforms jsonb not null default '[]'::jsonb,
  period_start date,
  period_end date,
  status text not null default 'draft' check (status in
    ('draft', 'active', 'completed', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index campaigns_organization_id_idx on public.campaigns (organization_id);

create trigger campaigns_set_updated_at
  before update on public.campaigns
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 11. strategy_runs
-- ---------------------------------------------------------------------------

create table public.strategy_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  input_data jsonb not null default '{}'::jsonb,
  retrieved_chunk_ids jsonb not null default '[]'::jsonb,
  model_name text,
  status text not null default 'pending' check (status in
    ('pending', 'running', 'completed', 'failed')),
  created_at timestamptz not null default now()
);

create index strategy_runs_organization_id_idx on public.strategy_runs (organization_id);
create index strategy_runs_campaign_id_idx on public.strategy_runs (campaign_id);

-- ---------------------------------------------------------------------------
-- 12. strategy_options
-- ---------------------------------------------------------------------------

create table public.strategy_options (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  strategy_run_id uuid not null references public.strategy_runs(id) on delete cascade,
  strategy_type text not null,
  title text not null,
  summary text not null,
  target_problem text,
  core_message text,
  content_direction text,
  funnel_step text,
  feature_scores jsonb not null default '{}'::jsonb,
  base_score numeric(5,2) not null default 0 check (base_score between 0 and 100),
  preference_score numeric(5,2) not null default 0 check (preference_score between 0 and 100),
  evidence_score numeric(5,2) not null default 0 check (evidence_score between 0 and 100),
  final_score numeric(5,2) not null default 0 check (final_score between 0 and 100),
  reasoning text,
  evidence jsonb not null default '[]'::jsonb,
  selected boolean not null default false,
  created_at timestamptz not null default now()
);

create index strategy_options_organization_id_idx on public.strategy_options (organization_id);
create index strategy_options_strategy_run_id_idx on public.strategy_options (strategy_run_id);

-- ---------------------------------------------------------------------------
-- 13. content_projects
-- ---------------------------------------------------------------------------

create table public.content_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  campaign_id uuid references public.campaigns(id) on delete set null,
  strategy_option_id uuid references public.strategy_options(id) on delete set null,
  title text not null,
  core_message text,
  target_audience text,
  objective text,
  status text not null default 'draft' check (status in
    ('draft', 'generating', 'ready', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index content_projects_organization_id_idx on public.content_projects (organization_id);
create index content_projects_campaign_id_idx on public.content_projects (campaign_id);

create trigger content_projects_set_updated_at
  before update on public.content_projects
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 14. content_outputs
-- ---------------------------------------------------------------------------

create table public.content_outputs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  content_project_id uuid not null references public.content_projects(id) on delete cascade,
  platform text not null check (platform in
    ('naver_blog', 'instagram', 'threads', 'youtube_shorts', 'newsletter', 'landing_page')),
  title text,
  body text,
  hashtags jsonb not null default '[]'::jsonb,
  seo_keywords jsonb not null default '[]'::jsonb,
  hook text,
  call_to_action text,
  generation_metadata jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in
    ('draft', 'generated', 'edited', 'final')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index content_outputs_organization_id_idx on public.content_outputs (organization_id);
create index content_outputs_content_project_id_idx on public.content_outputs (content_project_id);
create index content_outputs_platform_idx on public.content_outputs (platform);

create trigger content_outputs_set_updated_at
  before update on public.content_outputs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 15. performance_records
-- ---------------------------------------------------------------------------

create table public.performance_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  content_output_id uuid not null references public.content_outputs(id) on delete cascade,
  impressions integer not null default 0,
  views integer not null default 0,
  likes integer not null default 0,
  comments integer not null default 0,
  saves integer not null default 0,
  clicks integer not null default 0,
  inquiries integer not null default 0,
  consultations integer not null default 0,
  purchases integer not null default 0,
  revenue numeric(12,2) not null default 0,
  performance_score numeric(5,2) check (performance_score between 0 and 100),
  measured_at date not null default current_date,
  created_at timestamptz not null default now()
);

create index performance_records_organization_id_idx on public.performance_records (organization_id);
create index performance_records_content_output_id_idx on public.performance_records (content_output_id);

-- ---------------------------------------------------------------------------
-- 16. preference_weights
-- ---------------------------------------------------------------------------

create table public.preference_weights (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique references public.organizations(id) on delete cascade,
  clarity_weight numeric(3,2) not null default 1.0 check (clarity_weight between 0.5 and 1.5),
  authority_weight numeric(3,2) not null default 1.0 check (authority_weight between 0.5 and 1.5),
  purchase_link_weight numeric(3,2) not null default 1.0 check (purchase_link_weight between 0.5 and 1.5),
  brand_fit_weight numeric(3,2) not null default 1.0 check (brand_fit_weight between 0.5 and 1.5),
  novelty_weight numeric(3,2) not null default 1.0 check (novelty_weight between 0.5 and 1.5),
  empathy_weight numeric(3,2) not null default 1.0 check (empathy_weight between 0.5 and 1.5),
  updated_at timestamptz not null default now()
);

create index preference_weights_organization_id_idx on public.preference_weights (organization_id);

create trigger preference_weights_set_updated_at
  before update on public.preference_weights
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 17. learning_events
-- ---------------------------------------------------------------------------

create table public.learning_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null check (event_type in
    ('strategy_selected', 'strategy_rejected', 'content_edited',
     'performance_registered', 'preference_updated', 'knowledge_edited')),
  target_type text not null,
  target_id uuid,
  before_state jsonb,
  after_state jsonb,
  description text,
  created_at timestamptz not null default now()
);

create index learning_events_organization_id_idx on public.learning_events (organization_id);
create index learning_events_event_type_idx on public.learning_events (event_type);

-- ---------------------------------------------------------------------------
-- 18. processing_jobs
-- ---------------------------------------------------------------------------

create table public.processing_jobs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  job_type text not null,
  target_id uuid,
  status text not null default 'pending' check (status in
    ('pending', 'running', 'completed', 'failed')),
  progress integer not null default 0 check (progress between 0 and 100),
  current_step text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index processing_jobs_organization_id_idx on public.processing_jobs (organization_id);
create index processing_jobs_target_id_idx on public.processing_jobs (target_id);

-- ---------------------------------------------------------------------------
-- 19. audit_logs
-- ---------------------------------------------------------------------------

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_organization_id_idx on public.audit_logs (organization_id);
