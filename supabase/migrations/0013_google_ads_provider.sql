-- ETAPA 3 / BLOCO 0 — Multi-canal em metrics_daily (ver ETAPA3GOOGLEADS.md BLOCO 0).
--
-- Diferencia a origem do dado no MESMO metrics_daily/entities. Google Ads é o
-- segundo AdsProvider (PROJECT.md 3.1): mesmos conceitos canônicos do Meta
-- (campaign→ad_group→ad, spend, impressions, clicks, conversions,
-- conversion_value), só muda a coluna `provider`. O motor de inteligência
-- (PROJECT.md 6) não muda — lê metrics_daily normalmente.
--
-- O default 'meta' preserva TODOS os dados existentes (Meta). Google grava
-- provider='google'.

-- ---------------------------------------------------------------------------
-- Coluna provider (origem do dado)
-- ---------------------------------------------------------------------------
alter table metrics_daily add column if not exists provider text not null default 'meta';
alter table entities     add column if not exists provider text not null default 'meta';
alter table ad_accounts  add column if not exists provider text not null default 'meta';

-- meta_tokens vira o store genérico de credencial (só metadados; o segredo real
-- — access token da Meta OU refresh_token do Google — vive no Vault). Para
-- provider='google' o vault_secret_id guarda o refresh_token OAuth.
alter table meta_tokens  add column if not exists provider text not null default 'meta';

-- índice para consultas por canal (dashboard multi-canal, BLOCO 7)
create index if not exists metrics_daily_provider_idx on metrics_daily (ad_account_id, provider, date);
create index if not exists entities_provider_idx on entities (ad_account_id, provider);

-- ---------------------------------------------------------------------------
-- sync_jobs — novos kinds do Google Ads (BLOCO 5).
-- Google reusa sync_jobs (keyed por ad_account_id, que o Google TEM, ao
-- contrário do GA4). Kinds separados garantem que os workers do Google
-- (GoogleAdsApi) nunca peguem jobs do Meta e vice-versa.
-- ---------------------------------------------------------------------------
alter table sync_jobs drop constraint if exists sync_jobs_kind_check;
alter table sync_jobs add constraint sync_jobs_kind_check check (kind in (
  'sync_entities', 'sync_insights_daily', 'sync_insights_backfill',
  'sync_breakdowns', 'token_health',
  'google_sync_entities', 'google_sync_insights_daily', 'google_sync_backfill'
));
