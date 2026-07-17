-- Etapa HubSpot (ETAPA-HUBSPOT.md) — primeiro conector de CRM da Onda 2.1.
--
-- HubSpot e event-level: os eventos canonicos (lead/meeting/deal) entram em
-- business_events (0010), que ja existe — diferente do GA4 (0011), que
-- precisou de tabela agregada propria. Esta migration so adiciona o vinculo
-- portal -> connection.
--
-- hubspot_portal_id (hub_id): o webhook do app publico do HubSpot chega num
-- endpoint UNICO por app (/api/hooks/hubspot) com o portalId no corpo — e
-- assim que o evento encontra o tenant dono. Unico entre conexoes ativas:
-- um portal pertence a UMA organizacao.
alter table connections add column if not exists hubspot_portal_id text;

create unique index if not exists connections_hubspot_portal_idx
  on connections(hubspot_portal_id)
  where connector_id = 'hubspot' and hubspot_portal_id is not null;

-- Progresso do sync (PROJECT.md 3.2: fatiado e retomavel) vive em
-- connections.sync_cursor, como no GA4:
--   { "hubspot": {
--       "last_run_date": "YYYY-MM-DD",
--       "objects": {
--         "contacts": { "since_ms": 0, "after": "..."? },
--         "deals":    { "since_ms": 0 },
--         "meetings": { "since_ms": 0 } } } }
-- O backfill de 180d usa o MESMO cursor (since_ms comeca 180d atras).
