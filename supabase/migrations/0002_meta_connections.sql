-- Fase 1 / Etapas 2-3: conexao BYOT com a Meta (tokens, ad accounts, sync jobs)
-- Ver PROJECT.md secoes 3.2, 5, 7.

-- ---------------------------------------------------------------------------
-- Supabase Vault wrappers (service_role only)
-- Tokens Meta NUNCA sao gravados em texto plano em tabela nenhuma.
-- vault.create_secret / vault.decrypted_secrets sao fornecidos pela extensao
-- pgsodium/supabase_vault, ja habilitada por padrao em projetos Supabase.
-- ---------------------------------------------------------------------------
create or replace function vault_create_secret(secret text, secret_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  new_id uuid;
begin
  insert into vault.secrets (secret, name)
  values (secret, secret_name)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function vault_read_secret(secret_id uuid)
returns text
language sql
security definer
set search_path = public, vault
stable
as $$
  select decrypted_secret from vault.decrypted_secrets where id = secret_id;
$$;

create or replace function vault_update_secret(secret_id uuid, new_secret text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  update vault.secrets set secret = new_secret, updated_at = now() where id = secret_id;
end;
$$;

create or replace function vault_delete_secret(secret_id uuid)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  delete from vault.secrets where id = secret_id;
end;
$$;

revoke execute on function vault_create_secret(text, text) from public, anon, authenticated;
revoke execute on function vault_read_secret(uuid) from public, anon, authenticated;
revoke execute on function vault_update_secret(uuid, text) from public, anon, authenticated;
revoke execute on function vault_delete_secret(uuid) from public, anon, authenticated;
grant execute on function vault_create_secret(text, text) to service_role;
grant execute on function vault_read_secret(uuid) to service_role;
grant execute on function vault_update_secret(uuid, text) to service_role;
grant execute on function vault_delete_secret(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- meta_tokens — so guarda metadados; o token real vive no Vault
-- ---------------------------------------------------------------------------
create table if not exists meta_tokens (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  label text not null,
  vault_secret_id uuid not null,
  scopes text[] not null default '{}',
  token_health text not null default 'unknown'
    check (token_health in ('unknown', 'valid', 'expiring', 'invalid', 'revoked')),
  expires_at timestamptz,
  last_validated_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists meta_tokens_org_id_idx on meta_tokens(org_id);

-- ---------------------------------------------------------------------------
-- ad_accounts
-- ---------------------------------------------------------------------------
create table if not exists ad_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  meta_token_id uuid not null references meta_tokens(id) on delete cascade,
  meta_account_id text not null,
  name text not null,
  currency text not null default 'BRL',
  timezone text not null default 'America/Sao_Paulo',
  account_status int,
  status text not null default 'active' check (status in ('active', 'disconnected', 'paused')),
  autonomy_mode text not null default 'observador'
    check (autonomy_mode in ('observador', 'copiloto', 'autopilot')),
  connected_at timestamptz not null default now(),
  unique (org_id, meta_account_id)
);

create index if not exists ad_accounts_org_id_idx on ad_accounts(org_id);
create index if not exists ad_accounts_meta_token_id_idx on ad_accounts(meta_token_id);

-- ---------------------------------------------------------------------------
-- sync_jobs — jobs fatiados e retomaveis (regra da secao 3.2)
-- ---------------------------------------------------------------------------
create table if not exists sync_jobs (
  id uuid primary key default gen_random_uuid(),
  ad_account_id uuid not null references ad_accounts(id) on delete cascade,
  kind text not null check (kind in (
    'sync_entities', 'sync_insights_daily', 'sync_insights_backfill',
    'sync_breakdowns', 'token_health'
  )),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'done', 'failed')),
  cursor jsonb not null default '{}',
  next_chunk jsonb,
  meta_usage_pct numeric,
  error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists sync_jobs_ad_account_id_idx on sync_jobs(ad_account_id);
create index if not exists sync_jobs_status_idx on sync_jobs(status);

-- ---------------------------------------------------------------------------
-- audit_log (usado ja na etapa 2-3 para registrar acoes sobre tokens)
-- ---------------------------------------------------------------------------
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  actor uuid references auth.users(id),
  event text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists audit_log_org_id_idx on audit_log(org_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table meta_tokens enable row level security;
alter table ad_accounts enable row level security;
alter table sync_jobs enable row level security;
alter table audit_log enable row level security;

drop policy if exists "members read own org meta_tokens" on meta_tokens;
create policy "members read own org meta_tokens" on meta_tokens
  for select using (is_org_member(org_id) or is_platform_admin());

drop policy if exists "admins manage own org meta_tokens" on meta_tokens;
create policy "admins manage own org meta_tokens" on meta_tokens
  for insert with check (is_org_admin(org_id));
drop policy if exists "admins update own org meta_tokens" on meta_tokens;
create policy "admins update own org meta_tokens" on meta_tokens
  for update using (is_org_admin(org_id));
drop policy if exists "admins delete own org meta_tokens" on meta_tokens;
create policy "admins delete own org meta_tokens" on meta_tokens
  for delete using (is_org_admin(org_id));

drop policy if exists "members read own org ad_accounts" on ad_accounts;
create policy "members read own org ad_accounts" on ad_accounts
  for select using (is_org_member(org_id) or is_platform_admin());

drop policy if exists "admins manage own org ad_accounts" on ad_accounts;
create policy "admins manage own org ad_accounts" on ad_accounts
  for insert with check (is_org_admin(org_id));
drop policy if exists "admins update own org ad_accounts" on ad_accounts;
create policy "admins update own org ad_accounts" on ad_accounts
  for update using (is_org_admin(org_id));
drop policy if exists "admins delete own org ad_accounts" on ad_accounts;
create policy "admins delete own org ad_accounts" on ad_accounts
  for delete using (is_org_admin(org_id));

drop policy if exists "members read own org sync_jobs" on sync_jobs;
create policy "members read own org sync_jobs" on sync_jobs
  for select using (
    is_platform_admin() or
    exists (select 1 from ad_accounts a where a.id = sync_jobs.ad_account_id and is_org_member(a.org_id))
  );

drop policy if exists "members read own org audit_log" on audit_log;
create policy "members read own org audit_log" on audit_log
  for select using (is_org_member(org_id) or is_platform_admin());

-- Nota: toda escrita em meta_tokens/ad_accounts/sync_jobs feita pelo backend
-- (API routes, cron jobs) usa a service_role key, que ignora RLS. As policies
-- acima cobrem o acesso direto do client autenticado (leitura no dashboard,
-- e escrita administrativa feita via server actions que respeitam a sessao do usuario).
