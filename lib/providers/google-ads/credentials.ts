import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { readSecret } from "@/lib/vault";

/**
 * Resolução de credencial do Google Ads (ETAPA3GOOGLEADS). Espelha
 * resolveAdAccountForSync (lib/engine/sync-orchestrator) mas nomeia os campos
 * pelo que são no Google: o segredo no Vault é o REFRESH_TOKEN OAuth (não um
 * access token), e meta_account_id guarda o customer_id (sem hífens, BLOCO 2).
 */
export interface GoogleAccountCredential {
  id: string;
  customerId: string;
  refreshToken: string;
}

/** Lê o refresh_token (Vault) + customer_id de uma ad_account provider='google'. */
export async function resolveGoogleAccount(adAccountId: string): Promise<GoogleAccountCredential> {
  const supabase = createServiceRoleClient();
  const { data: account, error } = await supabase
    .from("ad_accounts")
    .select("id, meta_account_id, provider, meta_tokens(vault_secret_id)")
    .eq("id", adAccountId)
    .single();

  if (error || !account) throw new Error("Conta não encontrada");
  if (account.provider !== "google") throw new Error("Conta não é do provider Google Ads");

  const tokenRow = Array.isArray(account.meta_tokens) ? account.meta_tokens[0] : account.meta_tokens;
  if (!tokenRow) throw new Error("Credencial da conta não encontrada");

  const refreshToken = await readSecret(tokenRow.vault_secret_id);
  if (!refreshToken) throw new Error("Refresh token indisponível no Vault");

  return { id: account.id, customerId: account.meta_account_id, refreshToken };
}

/** Lê o refresh_token (Vault) diretamente de uma linha meta_tokens do Google. */
export async function readGoogleRefreshToken(metaTokenId: string): Promise<string> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("meta_tokens")
    .select("vault_secret_id, provider")
    .eq("id", metaTokenId)
    .single();
  if (error || !data) throw new Error("Credencial não encontrada");
  if (data.provider !== "google") throw new Error("Credencial não é do provider Google Ads");
  const token = await readSecret(data.vault_secret_id);
  if (!token) throw new Error("Refresh token indisponível no Vault");
  return token;
}

/**
 * Remove linhas meta_tokens do Google desta org que não estão vinculadas a
 * NENHUMA ad_account (credenciais órfãs de um wizard abandonado ou de uma
 * reconexão). Revoga também o segredo no Vault. Mantém a idempotência do fluxo:
 * refazer o OAuth não acumula credenciais.
 */
export async function cleanupDanglingGoogleTokens(orgId: string, keepTokenId?: string): Promise<void> {
  const supabase = createServiceRoleClient();
  const { deleteSecret } = await import("@/lib/vault");

  const { data: tokens } = await supabase
    .from("meta_tokens")
    .select("id, vault_secret_id")
    .eq("org_id", orgId)
    .eq("provider", "google");

  for (const token of tokens ?? []) {
    if (token.id === keepTokenId) continue;
    const { count } = await supabase
      .from("ad_accounts")
      .select("id", { count: "exact", head: true })
      .eq("meta_token_id", token.id);
    if ((count ?? 0) > 0) continue; // vinculada — mantém
    await supabase.from("meta_tokens").delete().eq("id", token.id);
    if (token.vault_secret_id) await deleteSecret(token.vault_secret_id).catch(() => {});
  }
}
