import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Helpers para o Supabase Vault (pgsodium). Chamam funções SQL restritas a
 * `service_role` (ver supabase/migrations/0002_meta_connections.sql) — o
 * token da Meta nunca trafega em texto plano fora deste módulo + o backend.
 *
 * Nunca importar este arquivo de código que roda no browser.
 */

export async function createSecret(secret: string, name?: string): Promise<string> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("vault_create_secret", {
    secret,
    secret_name: name ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function readSecret(secretId: string): Promise<string | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("vault_read_secret", { secret_id: secretId });
  if (error) throw error;
  return (data as string | null) ?? null;
}

export async function updateSecret(secretId: string, newSecret: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.rpc("vault_update_secret", {
    secret_id: secretId,
    new_secret: newSecret,
  });
  if (error) throw error;
}

export async function deleteSecret(secretId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.rpc("vault_delete_secret", { secret_id: secretId });
  if (error) throw error;
}
