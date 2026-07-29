import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { readSecret } from "@/lib/vault";

export interface Ga4ConnectionRow {
  id: string;
  org_id: string;
  ad_account_id: string | null;
  ga4_property_id: string | null;
  ga4_property_name: string | null;
  status: string;
  credentials_vault_id: string | null;
  sync_cursor: Record<string, unknown>;
}

const CONNECTION_FIELDS =
  "id, org_id, ad_account_id, ga4_property_id, ga4_property_name, status, credentials_vault_id, sync_cursor";

export async function getGa4Connection(connectionId: string): Promise<Ga4ConnectionRow | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("connections")
    .select(CONNECTION_FIELDS)
    .eq("id", connectionId)
    .eq("connector_id", "ga4")
    .maybeSingle();
  return (data as Ga4ConnectionRow | null) ?? null;
}

/** Conexoes GA4 ativas de uma org (usado pelo wizard/dashboard). */
export async function getGa4ConnectionForOrg(orgId: string): Promise<Ga4ConnectionRow | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("connections")
    .select(CONNECTION_FIELDS)
    .eq("org_id", orgId)
    .eq("connector_id", "ga4")
    .maybeSingle();
  return (data as Ga4ConnectionRow | null) ?? null;
}

/** Le o refresh_token do Vault. Nunca retorna null silenciosamente — lanca. */
export async function readRefreshToken(connection: Ga4ConnectionRow): Promise<string> {
  if (!connection.credentials_vault_id) {
    throw new Error("Conexao GA4 sem credencial no Vault");
  }
  const refreshToken = await readSecret(connection.credentials_vault_id);
  if (!refreshToken) throw new Error("Refresh token do GA4 indisponivel no Vault");
  return refreshToken;
}
