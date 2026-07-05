-- Etapa 2 / Onda 2.0 — Fundação de dados (ver ETAPA2.md secoes 2, 3, 6).
-- Modelo canonico de eventos de negocio: connections, business_events,
-- contacts, products, attributions. Mesma filosofia da Etapa 1 (AdsProvider):
-- conectores plugaveis sobre um modelo canonico — o motor nunca conhece
-- "Pipedrive" ou "Shopify", so lead/deal/meeting/order/refund/inventory.

-- ---------------------------------------------------------------------------
-- connections — credenciais de conectores (CRM/e-commerce/ERP/analytics).
-- Token real vive no Vault (mesma disciplina dos tokens Meta, migration 0002).
-- ---------------------------------------------------------------------------
create table if not exists connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  ad_account_id uuid references ad_accounts(id) on delete cascade,
  connector_id text not null,
  category text not null check (category in ('crm', 'ecommerce', 'erp', 'analytics', 'payments', 'custom')),
  label text not null,
  auth_mode text not null check (auth_mode in ('api_key', 'oauth2', 'webhook_only')),
  credentials_vault_id uuid,
  webhook_secret_vault_id uuid,
  status text not null default 'active' check (status in ('active', 'disconnected', 'error')),
  capabilities text[] not null default '{}',
  last_sync_at timestamptz,
  sync_cursor jsonb not null default '{}',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists connections_org_id_idx on connections(org_id);
create index if not exists connections_ad_account_id_idx on connections(ad_account_id);

-- ---------------------------------------------------------------------------
-- contacts — identidade unificada por hash (LGPD: nunca PII bruta, so hash).
-- ---------------------------------------------------------------------------
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  email_hash text,
  phone_hash text,
  external_ids jsonb not null default '{}',
  first_seen_at timestamptz not null default now(),
  first_touch_ref jsonb,
  ltv_cached numeric,
  created_at timestamptz not null default now()
);

create index if not exists contacts_org_id_idx on contacts(org_id);
create index if not exists contacts_email_hash_idx on contacts(org_id, email_hash) where email_hash is not null;
create index if not exists contacts_phone_hash_idx on contacts(org_id, phone_hash) where phone_hash is not null;

-- ---------------------------------------------------------------------------
-- products — de e-commerce/ERP (preco/custo/estoque -> habilita lucro real).
-- ---------------------------------------------------------------------------
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  connector_id text not null,
  sku text not null,
  name text,
  price numeric,
  cost numeric,
  stock_qty numeric,
  stock_updated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, connector_id, sku)
);

create index if not exists products_org_id_idx on products(org_id);

-- ---------------------------------------------------------------------------
-- business_events — tabela de fatos, append-only, para todos os conectores.
-- unique(connector_id, external_id) garante idempotencia na ingestao
-- (webhook retry / poll incremental reprocessando a mesma pagina).
-- ---------------------------------------------------------------------------
create table if not exists business_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  ad_account_id uuid references ad_accounts(id) on delete cascade,
  connector_id text not null,
  external_id text not null,
  event_type text not null check (event_type in (
    'lead_created', 'lead_qualified', 'lead_disqualified',
    'meeting_scheduled', 'meeting_held',
    'deal_created', 'deal_stage_changed', 'deal_won', 'deal_lost',
    'order_created', 'order_paid', 'order_refunded',
    'subscription_started', 'subscription_churned'
  )),
  occurred_at timestamptz not null,
  monetary_value numeric,
  cost_value numeric,
  currency text,
  contact_ref jsonb not null default '{}',
  attribution_hints jsonb not null default '{}',
  items jsonb,
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (connector_id, external_id)
);

create index if not exists business_events_ad_account_id_idx on business_events(ad_account_id, occurred_at);
create index if not exists business_events_org_id_idx on business_events(org_id, occurred_at);
create index if not exists business_events_attribution_hints_idx on business_events using gin (attribution_hints);
create index if not exists business_events_contact_ref_idx on business_events using gin (contact_ref);

-- ---------------------------------------------------------------------------
-- attributions — resultado da cascata de matching (ETAPA2.md 3.1). O LLM
-- nunca faz matching: isso e codigo deterministico e testavel
-- (lib/attribution/*). V2 e last-click: 1 atribuicao por evento.
-- ---------------------------------------------------------------------------
create table if not exists attributions (
  id uuid primary key default gen_random_uuid(),
  business_event_id uuid not null references business_events(id) on delete cascade,
  entity_level text not null check (entity_level in ('campaign', 'adset', 'ad')),
  entity_meta_id text not null,
  method text not null check (method in ('click_id', 'utm', 'identity_window', 'ga4', 'probabilistic')),
  confidence text not null check (confidence in ('exact', 'high', 'medium', 'low')),
  touch_occurred_at timestamptz,
  lag_days numeric,
  model text not null default 'last_click',
  created_at timestamptz not null default now(),
  unique (business_event_id)
);

create index if not exists attributions_entity_idx on attributions(entity_level, entity_meta_id);

-- ---------------------------------------------------------------------------
-- RLS — mesmo padrao das demais tabelas (tudo pendurado em org_id).
-- Escrita de business_events/contacts/products/attributions e sempre via
-- service_role (ingestao de webhook/poll/worker de atribuicao) — so ha
-- policy de SELECT para membros. connections e gerenciada pelo app
-- (org admin), como meta_tokens.
-- ---------------------------------------------------------------------------
alter table connections enable row level security;
alter table contacts enable row level security;
alter table products enable row level security;
alter table business_events enable row level security;
alter table attributions enable row level security;

drop policy if exists "members read own org connections" on connections;
create policy "members read own org connections" on connections
  for select using (is_org_member(org_id) or is_platform_admin());

drop policy if exists "admins manage own org connections" on connections;
create policy "admins manage own org connections" on connections
  for all using (is_org_admin(org_id) or is_platform_admin())
  with check (is_org_admin(org_id) or is_platform_admin());

drop policy if exists "members read own org contacts" on contacts;
create policy "members read own org contacts" on contacts
  for select using (is_org_member(org_id) or is_platform_admin());

drop policy if exists "members read own org products" on products;
create policy "members read own org products" on products
  for select using (is_org_member(org_id) or is_platform_admin());

drop policy if exists "members read own org business_events" on business_events;
create policy "members read own org business_events" on business_events
  for select using (is_org_member(org_id) or is_platform_admin());

drop policy if exists "members read own org attributions" on attributions;
create policy "members read own org attributions" on attributions
  for select using (
    is_platform_admin() or
    exists (
      select 1 from business_events be
      where be.id = attributions.business_event_id and is_org_member(be.org_id)
    )
  );

-- ---------------------------------------------------------------------------
-- sync_jobs ganha o kind attribution_worker (roda por ad_account, como
-- daily_analysis). connector_poll/connector_backfill ficam para a Onda 2.1,
-- quando o primeiro conector de fato existir.
-- ---------------------------------------------------------------------------
alter table sync_jobs drop constraint if exists sync_jobs_kind_check;
alter table sync_jobs add constraint sync_jobs_kind_check check (kind in (
  'sync_entities', 'sync_insights_daily', 'sync_insights_backfill',
  'sync_breakdowns', 'token_health', 'daily_analysis', 'measure_action_results',
  'attribution_worker'
));
