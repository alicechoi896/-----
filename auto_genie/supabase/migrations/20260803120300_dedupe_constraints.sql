-- Allows re-analysis of a data source to upsert knowledge instead of piling
-- up duplicate entities/rules every time "다시 분석" is run.

create unique index knowledge_entities_org_type_name_idx
  on public.knowledge_entities (organization_id, entity_type, name);

create unique index decision_rules_org_name_idx
  on public.decision_rules (organization_id, rule_name);
