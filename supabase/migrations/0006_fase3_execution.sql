-- Fase 3: Guardrails, Action Executor, medicao de resultado e chat.
-- Ver PROJECT.md secoes 6.5, 6.6, 7.

-- ---------------------------------------------------------------------------
-- guardrails — defaults sensatos por conta (PROJECT.md 6.5)
-- ---------------------------------------------------------------------------
create table if not exists guardrails (
  ad_account_id uuid primary key references ad_accounts(id) on delete cascade,
  max_budget_change_pct numeric not null default 20,
  daily_spend_cap numeric,
  cooldown_hours int not null default 48,
  protected_entity_ids text[] not null default '{}',
  max_actions_per_day int not null default 5,
  execution_window jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table guardrails enable row level security;

drop policy if exists "members read own org guardrails" on guardrails;
create policy "members read own org guardrails" on guardrails
  for select using (
    is_platform_admin() or
    exists (select 1 from ad_accounts a where a.id = guardrails.ad_account_id and is_org_member(a.org_id))
  );

drop policy if exists "contributors update own org guardrails" on guardrails;
create policy "contributors update own org guardrails" on guardrails
  for update using (
    exists (select 1 from ad_accounts a where a.id = guardrails.ad_account_id and is_org_contributor(a.org_id))
  );

drop policy if exists "contributors insert own org guardrails" on guardrails;
create policy "contributors insert own org guardrails" on guardrails
  for insert with check (
    exists (select 1 from ad_accounts a where a.id = guardrails.ad_account_id and is_org_contributor(a.org_id))
  );

-- Cria guardrails com defaults assim que uma conta e conectada.
create or replace function create_default_guardrails()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into guardrails (ad_account_id) values (new.id)
  on conflict (ad_account_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_ad_account_created_guardrails on ad_accounts;
create trigger on_ad_account_created_guardrails
  after insert on ad_accounts
  for each row execute function create_default_guardrails();

-- ---------------------------------------------------------------------------
-- actions — fila de acoes propostas/aprovadas/executadas (PROJECT.md 7)
-- ---------------------------------------------------------------------------
create table if not exists actions (
  id uuid primary key default gen_random_uuid(),
  ad_account_id uuid not null references ad_accounts(id) on delete cascade,
  insight_id uuid references insights(id) on delete set null,
  snapshot_id uuid references snapshots(id) on delete set null,
  type text not null check (type in (
    'PAUSE_AD', 'PAUSE_ADSET', 'ADJUST_BUDGET', 'DUPLICATE_ADSET',
    'REALLOCATE_BUDGET', 'CHANGE_BID', 'REACTIVATE', 'SUGGEST_CREATIVE_REFRESH',
    'NO_ACTION_WAIT'
  )),
  entity_ref jsonb not null,
  params jsonb not null default '{}',
  previous_state jsonb,
  reasoning text,
  expected_impact text,
  risk text check (risk in ('low', 'medium', 'high')),
  priority int,
  status text not null default 'proposed'
    check (status in ('proposed', 'approved', 'rejected', 'executed', 'failed', 'reverted')),
  idempotency_key text unique,
  proposed_at timestamptz not null default now(),
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  executed_at timestamptz,
  meta_response jsonb,
  error text
);

create index if not exists actions_ad_account_id_idx on actions(ad_account_id, proposed_at desc);
create index if not exists actions_status_idx on actions(ad_account_id, status);
create index if not exists actions_entity_ref_idx on actions using gin (entity_ref);

alter table actions enable row level security;

drop policy if exists "members read own org actions" on actions;
create policy "members read own org actions" on actions
  for select using (
    is_platform_admin() or
    exists (select 1 from ad_accounts a where a.id = actions.ad_account_id and is_org_member(a.org_id))
  );

drop policy if exists "contributors update own org actions" on actions;
create policy "contributors update own org actions" on actions
  for update using (
    exists (select 1 from ad_accounts a where a.id = actions.ad_account_id and is_org_contributor(a.org_id))
  );

-- ---------------------------------------------------------------------------
-- action_results — medicao D0/D+4/D+7 (PROJECT.md 6.5)
-- ---------------------------------------------------------------------------
create table if not exists action_results (
  action_id uuid primary key references actions(id) on delete cascade,
  metric text not null,
  baseline_value numeric,
  d4_value numeric,
  d7_value numeric,
  delta_pct numeric,
  verdict text check (verdict in ('improved', 'neutral', 'worsened')),
  measured_at timestamptz not null default now()
);

alter table action_results enable row level security;

drop policy if exists "members read own org action_results" on action_results;
create policy "members read own org action_results" on action_results
  for select using (
    is_platform_admin() or
    exists (
      select 1 from actions ac
      join ad_accounts a on a.id = ac.ad_account_id
      where ac.id = action_results.action_id and is_org_member(a.org_id)
    )
  );

-- ---------------------------------------------------------------------------
-- chat_messages — conversa com o agente (PROJECT.md 6.6)
-- ---------------------------------------------------------------------------
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  ad_account_id uuid not null references ad_accounts(id) on delete cascade,
  user_id uuid references auth.users(id),
  role text not null check (role in ('user', 'assistant', 'tool')),
  content text,
  tool_calls jsonb,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_ad_account_id_idx on chat_messages(ad_account_id, created_at);

alter table chat_messages enable row level security;

drop policy if exists "members read own org chat_messages" on chat_messages;
create policy "members read own org chat_messages" on chat_messages
  for select using (
    is_platform_admin() or
    exists (select 1 from ad_accounts a where a.id = chat_messages.ad_account_id and is_org_member(a.org_id))
  );

drop policy if exists "members write own org chat_messages" on chat_messages;
create policy "members write own org chat_messages" on chat_messages
  for insert with check (
    exists (select 1 from ad_accounts a where a.id = chat_messages.ad_account_id and is_org_member(a.org_id))
  );

-- ---------------------------------------------------------------------------
-- sync_jobs ganha o tipo measure_action_results (D+4/D+7)
-- ---------------------------------------------------------------------------
alter table sync_jobs drop constraint if exists sync_jobs_kind_check;
alter table sync_jobs add constraint sync_jobs_kind_check check (kind in (
  'sync_entities', 'sync_insights_daily', 'sync_insights_backfill',
  'sync_breakdowns', 'token_health', 'daily_analysis', 'measure_action_results'
));

-- Guardrails para contas ja conectadas antes desta migration.
insert into guardrails (ad_account_id)
select id from ad_accounts
on conflict (ad_account_id) do nothing;
