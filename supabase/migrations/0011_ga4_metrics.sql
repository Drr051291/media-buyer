-- Etapa 2 / Onda 2.1 — Conector GA4 (ver ETAPA2-GA4.md BLOCO 1).
--
-- GA4 Data API e AGREGADA (uma linha por dia/dimensao), nao event-level como
-- business_events (append-only, 1 evento por linha com contact_ref). Forcar
-- GA4 em business_events quebraria UNIQUE(connector_id, external_id) e
-- duplicaria no re-fetch diario (o Google revisa dados retroativamente).
--
-- Solucao: tabela dedicada com UPSERT idempotente por chave natural
-- (connection + data + dimensoes). O motor de atribuicao consome dela no
-- nivel 4 (session stitching, confidence 'medium'). business_events fica
-- limpo para dados event-level deterministicos.

-- ---------------------------------------------------------------------------
-- ga4_metrics_daily — metricas agregadas do GA4 (upsert idempotente).
-- ---------------------------------------------------------------------------
create table if not exists ga4_metrics_daily (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  connection_id uuid not null references connections(id) on delete cascade,
  ad_account_id uuid references ad_accounts(id) on delete set null,  -- link opcional p/ atribuicao cruzada
  property_id text not null,                       -- GA4 property (ex: 'properties/123456')
  date date not null,
  -- dimensoes (a chave natural do upsert). Nunca NULL: normalizadas para
  -- '(not set)' na ingestao (BLOCO 5) — Postgres trata NULL como distinto em
  -- UNIQUE, o que quebraria a idempotencia do re-fetch.
  session_source text not null default '(not set)',
  session_medium text not null default '(not set)',
  session_campaign text not null default '(not set)',
  landing_page text not null default '(not set)',
  device_category text not null default '(not set)',
  -- metricas
  sessions int not null default 0,
  engaged_sessions int not null default 0,
  engagement_rate numeric,
  conversions numeric not null default 0,
  event_count int not null default 0,
  purchase_revenue numeric not null default 0,
  transactions int not null default 0,
  synced_at timestamptz not null default now(),
  -- chave natural: idempotencia do re-fetch diario
  unique (connection_id, date, session_source, session_medium,
          session_campaign, landing_page, device_category)
);

create index if not exists ga4_metrics_lookup on ga4_metrics_daily (ad_account_id, date);
create index if not exists ga4_metrics_campaign on ga4_metrics_daily (session_campaign, date);
create index if not exists ga4_metrics_connection on ga4_metrics_daily (connection_id, date);

-- ---------------------------------------------------------------------------
-- Controle de sync na connection. sync_cursor ja existe (0010); adicionamos
-- ga4_property_id (a propriedade escolhida no wizard, BLOCO 3).
-- ---------------------------------------------------------------------------
alter table connections add column if not exists ga4_property_id text;

-- GA4 nao usa sync_jobs (aquela tabela e keyed por ad_account_id NOT NULL, e a
-- conexao GA4 pode nao ter ad_account vinculada). O progresso fatiado/retomavel
-- do GA4 (PROJECT.md 3.2) vive em connections.sync_cursor:
--   { "incremental": { "last_date": "YYYY-MM-DD" },
--     "backfill":    { "status": "running|done", "next_until": "YYYY-MM-DD", "floor": "YYYY-MM-DD" } }

-- ---------------------------------------------------------------------------
-- RLS — mesmo padrao das demais tabelas (tudo pendurado em org_id). Escrita e
-- sempre via service_role (cron de sync GA4); membros so leem a propria org.
-- ---------------------------------------------------------------------------
alter table ga4_metrics_daily enable row level security;

drop policy if exists "members read own org ga4_metrics" on ga4_metrics_daily;
create policy "members read own org ga4_metrics" on ga4_metrics_daily
  for select using (is_org_member(org_id) or is_platform_admin());
