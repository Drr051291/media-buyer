-- Fase 1 / Etapa 4: reivindicacao atomica de sync_jobs pendentes.
-- Evita que duas invocacoes de cron concorrentes peguem o mesmo job
-- (FOR UPDATE SKIP LOCKED nao e exposto pelo supabase-js).

create or replace function claim_next_sync_job(p_kind text)
returns setof sync_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  job_id uuid;
begin
  select id into job_id
    from sync_jobs
   where kind = p_kind
     and status = 'pending'
   order by created_at
   limit 1
   for update skip locked;

  if job_id is null then
    return;
  end if;

  update sync_jobs
     set status = 'running', started_at = now()
   where id = job_id;

  return query select * from sync_jobs where id = job_id;
end;
$$;

revoke execute on function claim_next_sync_job(text) from public, anon, authenticated;
grant execute on function claim_next_sync_job(text) to service_role;
