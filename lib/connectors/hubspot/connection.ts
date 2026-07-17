import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

export interface HubspotConnectionRow {
  id: string;
  org_id: string;
  ad_account_id: string | null;
  hubspot_portal_id: string | null;
  status: string;
  credentials_vault_id: string | null;
  sync_cursor: Record<string, unknown>;
}

const CONNECTION_FIELDS =
  "id, org_id, ad_account_id, hubspot_portal_id, status, credentials_vault_id, sync_cursor";

export async function getHubspotConnection(connectionId: string): Promise<HubspotConnectionRow | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("connections")
    .select(CONNECTION_FIELDS)
    .eq("id", connectionId)
    .eq("connector_id", "hubspot")
    .maybeSingle();
  return (data as HubspotConnectionRow | null) ?? null;
}

/** Conexão HubSpot de uma org (1 por org, como o GA4 — upsert no callback). */
export async function getHubspotConnectionForOrg(orgId: string): Promise<HubspotConnectionRow | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("connections")
    .select(CONNECTION_FIELDS)
    .eq("org_id", orgId)
    .eq("connector_id", "hubspot")
    .maybeSingle();
  return (data as HubspotConnectionRow | null) ?? null;
}

/**
 * Resolve a conexão pelo portal (hub_id) — é assim que o webhook, que chega
 * num endpoint único de app, encontra o tenant dono do evento.
 */
export async function getHubspotConnectionByPortal(portalId: string): Promise<HubspotConnectionRow | null> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("connections")
    .select(CONNECTION_FIELDS)
    .eq("connector_id", "hubspot")
    .eq("hubspot_portal_id", portalId)
    .eq("status", "active")
    .maybeSingle();
  return (data as HubspotConnectionRow | null) ?? null;
}
