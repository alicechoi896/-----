-- Composite/partial indexes matching the actual eq(organization_id) + order()/filter
-- patterns used across app/(app)/**/page.tsx and actions.ts. The existing schema only
-- has single-column organization_id indexes, so these queries were index-scanning by
-- org then sorting/filtering in a separate step; composite indexes let Postgres satisfy
-- filter + sort (and filter + filter) in one index scan.

create index if not exists data_sources_org_created_idx
  on public.data_sources (organization_id, created_at desc);

create index if not exists content_outputs_org_created_idx
  on public.content_outputs (organization_id, created_at desc);

create index if not exists performance_records_org_created_idx
  on public.performance_records (organization_id, created_at desc);

create index if not exists performance_records_org_measured_idx
  on public.performance_records (organization_id, measured_at desc);

create index if not exists decision_rules_org_created_idx
  on public.decision_rules (organization_id, created_at desc);

create index if not exists decision_rules_org_active_idx
  on public.decision_rules (organization_id, is_active);

create index if not exists processing_jobs_org_created_idx
  on public.processing_jobs (organization_id, created_at desc);

create index if not exists processing_jobs_org_completed_idx
  on public.processing_jobs (organization_id, completed_at desc)
  where completed_at is not null;

create index if not exists strategy_options_org_score_idx
  on public.strategy_options (organization_id, final_score desc);

create index if not exists strategy_options_run_score_idx
  on public.strategy_options (strategy_run_id, final_score desc);

create index if not exists knowledge_entities_org_confidence_idx
  on public.knowledge_entities (organization_id, confidence_score desc);

create index if not exists campaigns_org_created_idx
  on public.campaigns (organization_id, created_at desc);

create index if not exists learning_events_org_created_idx
  on public.learning_events (organization_id, created_at desc);

create index if not exists learning_events_org_type_created_idx
  on public.learning_events (organization_id, event_type, created_at desc);

create index if not exists content_projects_org_created_idx
  on public.content_projects (organization_id, created_at desc);

create index if not exists strategy_runs_campaign_created_idx
  on public.strategy_runs (campaign_id, created_at desc);

-- Speeds up the "embedded chunk count" queries on dashboard/technology/learning pages,
-- which all count(*) document_chunks where organization_id = ? and embedding is not null.
create index if not exists document_chunks_org_embedded_idx
  on public.document_chunks (organization_id)
  where embedding is not null;
