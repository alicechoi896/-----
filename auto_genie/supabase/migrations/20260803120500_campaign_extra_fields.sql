-- The 캠페인 설정 form (spec section 11) collects "현재 문제" and "추가 조건"
-- alongside the columns already in the base campaigns table; persist them so
-- they survive past the strategy-generation request that consumes them.

alter table public.campaigns
  add column current_problem text,
  add column extra_conditions text;
