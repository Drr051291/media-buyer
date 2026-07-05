-- Fase 1 / Etapas 4-5: estrutura de contas (entities) e metricas (metrics_daily)
-- Ver PROJECT.md secoes 6.1, 7, 3.2.

-- ---------------------------------------------------------------------------
-- entities — campanhas, adsets e ads sincronizados da Meta
-- ---------------------------------------------------------------------------
create table if not exists entities (
  id uuid primary key default gen_random_uuid(),
  ad_account_id uuid not null references ad_accounts(id) on delete cascade,
  level text not null check (level in ('campaign', 'adset', 'ad')),
  meta_id text not null,
  parent_meta_id text,
  name text not null,
  status text,
  objective text,
  daily_budget numeric,
  targeting_summary jsonb not null default '{}',
  creative_id text,
  synced_at timestamptz not null default now(),
  unique (ad_account_id, level, meta_id)
);

create index if not exists entities_ad_account_id_idx on entities(ad_account_id);
create index if not exists entities_parent_meta_id_idx on entities(ad_account_id, parent_meta_id);
create index if not exists entities_level_idx on entities(ad_account_id, level);

alter table entities enable row level security;

drop policy if exists "members read own org entities" on entities;
create policy "members read own org entities" on entities
  for select using (
    is_platform_admin() or
    exists (select 1 from ad_accounts a where a.id = entities.ad_account_id and is_org_member(a.org_id))
  );

-- ---------------------------------------------------------------------------
-- metrics_daily — fonte da verdade local (dashboards e o motor NUNCA leem a
-- Meta em tempo real, exceto refresh manual explicito).
-- ---------------------------------------------------------------------------
create table if not exists metrics_daily (
  ad_account_id uuid not null references ad_accounts(id) on delete cascade,
  entity_level text not null check (entity_level in ('campaign', 'adset', 'ad')),
  entity_meta_id text not null,
  date date not null,
  -- 'all' quando a linha nao tem breakdown; caso contrario ex: "publisher_platform:facebook"
  breakdown_key text not null default 'all',
  spend numeric not null default 0,
  impressions bigint not null default 0,
  reach bigint not null default 0,
  frequency numeric,
  clicks bigint not null default 0,
  link_clicks bigint not null default 0,
  ctr numeric,
  cpm numeric,
  cpc numeric,
  conversions numeric not null default 0,
  conversion_value numeric not null default 0,
  cpa numeric,
  roas numeric,
  raw jsonb not null default '{}',
  synced_at timestamptz not null default now(),
  primary key (ad_account_id, entity_level, entity_meta_id, date, breakdown_key)
);

create index if not exists metrics_daily_account_date_idx on metrics_daily(ad_account_id, date);
create index if not exists metrics_daily_entity_idx on metrics_daily(ad_account_id, entity_level, entity_meta_id);

alter table metrics_daily enable row level security;

drop policy if exists "members read own org metrics_daily" on metrics_daily;
create policy "members read own org metrics_daily" on metrics_daily
  for select using (
    is_platform_admin() or
    exists (select 1 from ad_accounts a where a.id = metrics_daily.ad_account_id and is_org_member(a.org_id))
  );

-- ---------------------------------------------------------------------------
-- Agregacao adset/campanha a partir das linhas de nivel "ad" (PROJECT.md 3.2:
-- tarefa puramente de banco, agendada via pg_cron). So agrega breakdown_key='all'
-- — breakdowns leves (secao 6.1) ficam so no nivel ad, nao sao rollup'ados.
-- ---------------------------------------------------------------------------
create or replace function aggregate_metrics_daily_for_account_date(p_ad_account_id uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Adset: soma das ads filhas, via entities.parent_meta_id (ad -> adset)
  delete from metrics_daily
   where ad_account_id = p_ad_account_id
     and date = p_date
     and entity_level = 'adset'
     and breakdown_key = 'all';

  insert into metrics_daily (
    ad_account_id, entity_level, entity_meta_id, date, breakdown_key,
    spend, impressions, reach, clicks, link_clicks, conversions, conversion_value,
    ctr, cpm, cpc, cpa, roas
  )
  select
    p_ad_account_id, 'adset', ad_entity.parent_meta_id, p_date, 'all',
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

  -- Campanha: soma dos adsets recem-agregados, via entities.parent_meta_id (adset -> campaign)
  delete from metrics_daily
   where ad_account_id = p_ad_account_id
     and date = p_date
     and entity_level = 'campaign'
     and breakdown_key = 'all';

  insert into metrics_daily (
    ad_account_id, entity_level, entity_meta_id, date, breakdown_key,
    spend, impressions, reach, clicks, link_clicks, conversions, conversion_value,
    ctr, cpm, cpc, cpa, roas
  )
  select
    p_ad_account_id, 'campaign', adset_entity.parent_meta_id, p_date, 'all',
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

-- Reprocessa os ultimos 8 dias (cobre o re-fetch de atribuicao da sync diaria)
-- de todas as contas ativas. Roda via pg_cron — puramente banco, sem tocar a Meta.
create or replace function aggregate_recent_metrics_daily()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  acc record;
  d date;
begin
  for acc in select id from ad_accounts where status = 'active' loop
    for d in select generate_series(current_date - 7, current_date, interval '1 day')::date loop
      perform aggregate_metrics_daily_for_account_date(acc.id, d);
    end loop;
  end loop;
end;
$$;

revoke execute on function aggregate_recent_metrics_daily() from public, anon, authenticated;
grant execute on function aggregate_recent_metrics_daily() to service_role;

-- Agendamento via pg_cron. A extensao precisa estar habilitada no projeto
-- Supabase (Database > Extensions > pg_cron); se nao estiver, este bloco so
-- avisa e a migration segue — a funcao acima pode ser chamada manualmente ou
-- por um cron externo enquanto isso.
do $$
begin
  perform cron.unschedule('aggregate-metrics-daily');
exception when others then
  null;
end $$;

do $$
begin
  perform cron.schedule('aggregate-metrics-daily', '*/30 * * * *', 'select aggregate_recent_metrics_daily()');
exception when others then
  raise notice 'pg_cron indisponivel neste projeto — habilite a extensao e agende aggregate_recent_metrics_daily() manualmente.';
end $$;
