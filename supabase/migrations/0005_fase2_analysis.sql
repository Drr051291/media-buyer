-- Fase 2: Business Context, Metric Engine/Reasoner output e custo de LLM.
-- Ver PROJECT.md secoes 6.2, 6.3, 6.4, 6.5 (memoria), 7.

-- ---------------------------------------------------------------------------
-- business_context — perfil de negocio por conta (o diferencial do produto)
-- ---------------------------------------------------------------------------
create table if not exists business_context (
  ad_account_id uuid primary key references ad_accounts(id) on delete cascade,
  profile jsonb not null default '{}',
  business_model text,
  objetivo_principal text,
  ticket_medio numeric,
  margem_bruta_pct numeric,
  cpa_alvo numeric,
  roas_alvo numeric,
  cpa_maximo numeric,
  updated_at timestamptz not null default now()
);

alter table business_context enable row level security;

-- analyst/admin/owner podem editar; viewer so le. Reaproveita is_org_member
-- (leitura) e cria is_org_contributor (escrita) — mais permissivo que
-- is_org_admin (usado em conexoes Meta) porque contexto de negocio nao e
-- credencial sensivel.
create or replace function is_org_contributor(check_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from org_members
    where org_id = check_org_id and user_id = auth.uid() and role in ('owner', 'admin', 'analyst')
  );
$$;

create policy "members read own org business_context" on business_context
  for select using (
    is_platform_admin() or
    exists (select 1 from ad_accounts a where a.id = business_context.ad_account_id and is_org_member(a.org_id))
  );

create policy "contributors write own org business_context" on business_context
  for insert with check (
    exists (select 1 from ad_accounts a where a.id = business_context.ad_account_id and is_org_contributor(a.org_id))
  );

create policy "contributors update own org business_context" on business_context
  for update using (
    exists (select 1 from ad_accounts a where a.id = business_context.ad_account_id and is_org_contributor(a.org_id))
  );

-- ---------------------------------------------------------------------------
-- snapshots — Account Snapshot (Metric Engine) + resultado do Reasoner do dia.
-- proposed_actions fica soltc/read-only aqui nesta fase; a Fase 3 normaliza
-- para a tabela `actions` com estado (proposed|approved|rejected|executed).
-- ---------------------------------------------------------------------------
create table if not exists snapshots (
  id uuid primary key default gen_random_uuid(),
  ad_account_id uuid not null references ad_accounts(id) on delete cascade,
  date date not null,
  payload jsonb not null default '{}',
  diagnosis text,
  health_score int check (health_score between 0 and 100),
  proposed_actions jsonb not null default '[]',
  llm_model text,
  created_at timestamptz not null default now(),
  unique (ad_account_id, date)
);

create index if not exists snapshots_ad_account_id_idx on snapshots(ad_account_id, date desc);

alter table snapshots enable row level security;

create policy "members read own org snapshots" on snapshots
  for select using (
    is_platform_admin() or
    exists (select 1 from ad_accounts a where a.id = snapshots.ad_account_id and is_org_member(a.org_id))
  );

-- ---------------------------------------------------------------------------
-- insights — achados do Reasoner, normalizados a partir do snapshot do dia
-- ---------------------------------------------------------------------------
create table if not exists insights (
  id uuid primary key default gen_random_uuid(),
  ad_account_id uuid not null references ad_accounts(id) on delete cascade,
  snapshot_id uuid not null references snapshots(id) on delete cascade,
  entity_ref jsonb not null default '{}',
  finding text not null,
  evidence jsonb not null default '[]',
  severity text not null check (severity in ('info', 'warning', 'critical')),
  created_at timestamptz not null default now()
);

create index if not exists insights_ad_account_id_idx on insights(ad_account_id, created_at desc);
create index if not exists insights_snapshot_id_idx on insights(snapshot_id);

alter table insights enable row level security;

create policy "members read own org insights" on insights
  for select using (
    is_platform_admin() or
    exists (select 1 from ad_accounts a where a.id = insights.ad_account_id and is_org_member(a.org_id))
  );

-- ---------------------------------------------------------------------------
-- llm_usage — custo de cada chamada ao Claude (insumo para pricing/admin)
-- ---------------------------------------------------------------------------
create table if not exists llm_usage (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  ad_account_id uuid references ad_accounts(id) on delete cascade,
  purpose text not null,
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  cache_creation_input_tokens int not null default 0,
  cache_read_input_tokens int not null default 0,
  cost_usd numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists llm_usage_org_id_idx on llm_usage(org_id, created_at desc);

alter table llm_usage enable row level security;

create policy "members read own org llm_usage" on llm_usage
  for select using (is_org_member(org_id) or is_platform_admin());

-- ---------------------------------------------------------------------------
-- sync_jobs ganha o tipo daily_analysis (job diario do Reasoner)
-- ---------------------------------------------------------------------------
alter table sync_jobs drop constraint if exists sync_jobs_kind_check;
alter table sync_jobs add constraint sync_jobs_kind_check check (kind in (
  'sync_entities', 'sync_insights_daily', 'sync_insights_backfill',
  'sync_breakdowns', 'token_health', 'daily_analysis'
));
