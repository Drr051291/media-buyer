-- Correções da revisão de segurança/correção pós-Fase 4.

-- ---------------------------------------------------------------------------
-- 1) actions ganha o status transitório 'executing', usado pelo Executor
--    para reivindicar atomicamente uma action antes de mutar na Meta —
--    sem isso, duas invocações concorrentes (retry de cron, autopilot
--    correndo junto com uma aprovação manual) podiam executar a mesma
--    action duas vezes (ex: DUPLICATE_ADSET criando dois adsets reais).
-- ---------------------------------------------------------------------------
alter table actions drop constraint if exists actions_status_check;
alter table actions add constraint actions_status_check check (status in (
  'proposed', 'approved', 'executing', 'rejected', 'executed', 'failed', 'reverted'
));

-- ---------------------------------------------------------------------------
-- 2) Apagar um token Meta não pode mais destruir em cascata todo o
--    histórico das contas que o usam (entities/metrics_daily/actions/...).
--    PROJECT.md 5.3: token inválido/revogado só marca a conta como
--    disconnected, nunca apaga dados. on delete restrict bloqueia a
--    exclusão do token enquanto alguma ad_account ainda referenciar ele.
-- ---------------------------------------------------------------------------
alter table ad_accounts drop constraint if exists ad_accounts_meta_token_id_fkey;
alter table ad_accounts add constraint ad_accounts_meta_token_id_fkey
  foreign key (meta_token_id) references meta_tokens(id) on delete restrict;

-- ---------------------------------------------------------------------------
-- 3) org_members: só quem já é owner pode conceder ou tocar no papel de
--    owner. Antes, "admins manage org_members" deixava qualquer admin se
--    auto-promover a owner ou remover/rebaixar o owner de verdade.
-- ---------------------------------------------------------------------------
create or replace function is_org_owner(check_org_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from org_members
    where org_id = check_org_id and user_id = auth.uid() and role = 'owner'
  );
$$;

drop policy if exists "admins manage org_members" on org_members;
create policy "admins manage org_members" on org_members
  for all using (
    is_platform_admin() or (is_org_admin(org_id) and (role != 'owner' or is_org_owner(org_id)))
  )
  with check (
    is_platform_admin() or (is_org_admin(org_id) and (role != 'owner' or is_org_owner(org_id)))
  );

-- ---------------------------------------------------------------------------
-- 4) notifications: só read_at pode mudar depois de criada. RLS não
--    restringe coluna, então a policy de update sozinha deixava qualquer
--    membro reescrever type/payload/ad_account_id da própria notificação.
-- ---------------------------------------------------------------------------
create or replace function protect_notification_columns()
returns trigger
language plpgsql
as $$
begin
  if new.org_id != old.org_id
     or new.ad_account_id is distinct from old.ad_account_id
     or new.type != old.type
     or new.payload != old.payload
     or new.created_at != old.created_at then
    raise exception 'Apenas read_at pode ser alterado em notifications';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_notification_columns_trigger on notifications;
create trigger protect_notification_columns_trigger
  before update on notifications
  for each row execute function protect_notification_columns();
