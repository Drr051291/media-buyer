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

-- ---------------------------------------------------------------------------
-- Agregação adset/campanha ciente de provider.
-- A versão de 0003 inseria as linhas agregadas SEM provider, caindo no default
-- 'meta' — errado para contas Google (as linhas de ad ficam 'google' mas os
-- rollups virariam 'meta'). Como uma ad_account é single-provider, propagamos
-- o provider das linhas de origem (min(m.provider) = o provider da conta).
-- ---------------------------------------------------------------------------
create or replace function aggregate_metrics_daily_for_account_date(p_ad_account_id uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from metrics_daily
   where ad_account_id = p_ad_account_id
     and date = p_date
     and entity_level = 'adset'
     and breakdown_key = 'all';

  insert into metrics_daily (
    ad_account_id, entity_level, entity_meta_id, date, breakdown_key, provider,
    spend, impressions, reach, clicks, link_clicks, conversions, conversion_value,
    ctr, cpm, cpc, cpa, roas
  )
  select
    p_ad_account_id, 'adset', ad_entity.parent_meta_id, p_date, 'all', min(m.provider),
    sum(m.spend), sum(m.impressions), sum(m.reach), sum(m.clicks), sum(m.link_clicks),
    sum(m.conversions), sum(m.conversion_value),
    case when sum(m.impressions) > 0 then sum(m.clicks)::numeric / sum(m.impressions) * 100 else null end,
    case when sum(m.impressions) > 0 then sum(m.spend) / sum(m.impressions) * 1000 else null end,
    case when sum(m.clicks) > 0 then sum(m.spend) / sum(m.clicks) else null end,
    case when sum(m.conversions) > 0 then sum(m.spend) / sum(m.conversions) else null end,
    case when sum(m.spend) > 0 then sum(m.conversion_value) / sum(m.spend) else null end
  from metrics_daily m
  join entities ad_entity
    on ad_entity.ad_account_id = p_ad_account_id
   and ad_entity.level = 'ad'
   and ad_entity.meta_id = m.entity_meta_id
  where m.ad_account_id = p_ad_account_id
    and m.date = p_date
    and m.entity_level = 'ad'
    and m.breakdown_key = 'all'
    and ad_entity.parent_meta_id is not null
  group by ad_entity.parent_meta_id;

  delete from metrics_daily
   where ad_account_id = p_ad_account_id
     and date = p_date
     and entity_level = 'campaign'
     and breakdown_key = 'all';

  insert into metrics_daily (
    ad_account_id, entity_level, entity_meta_id, date, breakdown_key, provider,
    spend, impressions, reach, clicks, link_clicks, conversions, conversion_value,
    ctr, cpm, cpc, cpa, roas
  )
  select
    p_ad_account_id, 'campaign', adset_entity.parent_meta_id, p_date, 'all', min(m.provider),
    sum(m.spend), sum(m.impressions), sum(m.reach), sum(m.clicks), sum(m.link_clicks),
    sum(m.conversions), sum(m.conversion_value),
    case when sum(m.impressions) > 0 then sum(m.clicks)::numeric / sum(m.impressions) * 100 else null end,
    case when sum(m.impressions) > 0 then sum(m.spend) / sum(m.impressions) * 1000 else null end,
    case when sum(m.clicks) > 0 then sum(m.spend) / sum(m.clicks) else null end,
    case when sum(m.conversions) > 0 then sum(m.spend) / sum(m.conversions) else null end,
    case when sum(m.spend) > 0 then sum(m.conversion_value) / sum(m.spend) else null end
  from metrics_daily m
  join entities adset_entity
    on adset_entity.ad_account_id = p_ad_account_id
   and adset_entity.level = 'adset'
   and adset_entity.meta_id = m.entity_meta_id
  where m.ad_account_id = p_ad_account_id
    and m.date = p_date
    and m.entity_level = 'adset'
    and m.breakdown_key = 'all'
    and adset_entity.parent_meta_id is not null
  group by adset_entity.parent_meta_id;
end;
$$;

revoke execute on function aggregate_metrics_daily_for_account_date(uuid, date) from public, anon, authenticated;
grant execute on function aggregate_metrics_daily_for_account_date(uuid, date) to service_role;
