-- Fase 1 / Etapa 1: multi-tenancy (organizations, membros, admins da plataforma)
-- Ver PROJECT.md secoes 2, 7.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'trial' check (plan in ('trial', 'starter', 'pro', 'agency')),
  status text not null default 'active' check (status in ('active', 'suspended', 'cancelled')),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- org_members
-- ---------------------------------------------------------------------------
create table if not exists org_members (
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'analyst', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create index if not exists org_members_user_id_idx on org_members(user_id);

-- ---------------------------------------------------------------------------
-- platform_admins (acesso ao /admin)
-- ---------------------------------------------------------------------------
create table if not exists platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helper functions (security definer, usadas pelas policies para evitar
-- recursao de RLS ao consultar a propria org_members)
-- ---------------------------------------------------------------------------
create or replace function is_org_member(check_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from org_members
    where org_id = check_org_id and user_id = auth.uid()
  );
$$;

create or replace function is_org_admin(check_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from org_members
    where org_id = check_org_id and user_id = auth.uid() and role in ('owner', 'admin')
  );
$$;

create or replace function is_platform_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from platform_admins where user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Signup: cria organization + primeiro membro (owner) automaticamente
-- ---------------------------------------------------------------------------
create or replace function handle_new_user_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_org_id uuid;
  org_name text;
begin
  org_name := coalesce(new.raw_user_meta_data->>'org_name', split_part(new.email, '@', 1) || ' Agency');

  insert into organizations (name) values (org_name) returning id into new_org_id;
  insert into org_members (org_id, user_id, role) values (new_org_id, new.id, 'owner');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user_org();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table organizations enable row level security;
alter table org_members enable row level security;
alter table platform_admins enable row level security;

create policy "members read own org" on organizations
  for select using (is_org_member(id) or is_platform_admin());

create policy "admins update own org" on organizations
  for update using (is_org_admin(id) or is_platform_admin());

create policy "members read org_members of own org" on org_members
  for select using (is_org_member(org_id) or is_platform_admin());

create policy "admins manage org_members" on org_members
  for all using (is_org_admin(org_id) or is_platform_admin())
  with check (is_org_admin(org_id) or is_platform_admin());

create policy "platform admins read platform_admins" on platform_admins
  for select using (is_platform_admin());
