-- Fix do Supabase Vault: "permission denied for function _crypto_aead_det_noncegen".
--
-- Os wrappers originais (0002) faziam DML direto em vault.secrets
-- (insert/update). Nas versoes atuais do Supabase Vault isso aciona o caminho
-- de criptografia do pgsodium, cuja funcao interna _crypto_aead_det_noncegen
-- NAO e executavel pelo owner do wrapper -> 42501 permission denied.
--
-- Correcao: chamar as funcoes nativas vault.create_secret / vault.update_secret
-- (elas sao SECURITY DEFINER de propriedade do supabase_admin e cuidam da
-- criptografia com o privilegio certo). Leitura/exclusao continuam iguais.
-- Idempotente: create or replace + re-grants.

create or replace function vault_create_secret(secret text, secret_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  new_id uuid;
begin
  -- vault.create_secret(new_secret, new_name, new_description)
  select vault.create_secret(secret, secret_name) into new_id;
  return new_id;
end;
$$;

create or replace function vault_update_secret(secret_id uuid, new_secret text)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
begin
  -- vault.update_secret(id, new_secret, new_name, new_description)
  perform vault.update_secret(secret_id, new_secret);
end;
$$;

-- Leitura (view decrypted_secrets) e exclusao nao passam pela criptografia,
-- entao continuam como estao (0002). Reafirmamos os grants por seguranca.
revoke execute on function vault_create_secret(text, text) from public, anon, authenticated;
revoke execute on function vault_update_secret(uuid, text) from public, anon, authenticated;
grant execute on function vault_create_secret(text, text) to service_role;
grant execute on function vault_update_secret(uuid, text) to service_role;
