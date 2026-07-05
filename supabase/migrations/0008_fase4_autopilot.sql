-- Fase 4: Autopilot + Admin (PROJECT.md secoes 2.2, 6.5, 10).
--
-- Kill switch NAO precisa de coluna nova: organizations.status ja tem
-- 'suspended' (migration 0001) e ad_accounts.status ja tem 'paused'
-- (migration 0002, nunca usado ate agora) — viram o kill switch de
-- tenant e de conta, respectivamente.

-- ---------------------------------------------------------------------------
-- feature_flags — gating por tenant (ex: liberar Autopilot só p/ beta testers)
-- ---------------------------------------------------------------------------
create table if not exists feature_flags (
  org_id uuid not null references organizations(id) on delete cascade,
  flag text not null,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (org_id, flag)
);

alter table feature_flags enable row level security;

drop policy if exists "members read own org feature_flags" on feature_flags;
create policy "members read own org feature_flags" on feature_flags
  for select using (is_org_member(org_id) or is_platform_admin());

-- Só o admin da plataforma escreve flags (liberado via /admin/flags).
drop policy if exists "platform admin writes feature_flags" on feature_flags;
create policy "platform admin writes feature_flags" on feature_flags
  for all using (is_platform_admin()) with check (is_platform_admin());

-- ---------------------------------------------------------------------------
-- notifications — avisos do Autopilot (execução/bloqueio automático)
-- ---------------------------------------------------------------------------
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  ad_account_id uuid references ad_accounts(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_org_id_idx on notifications(org_id, created_at desc);

alter table notifications enable row level security;

drop policy if exists "members read own org notifications" on notifications;
create policy "members read own org notifications" on notifications
  for select using (is_org_member(org_id) or is_platform_admin());

drop policy if exists "members mark own org notifications read" on notifications;
create policy "members mark own org notifications read" on notifications
  for update using (is_org_member(org_id) or is_platform_admin());

-- Nota: inserção é sempre via service_role (lib/engine/notifications.ts),
-- por isso não há policy de insert para membros comuns.
