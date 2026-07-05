import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

/** Avisos do Autopilot (PROJECT.md 6.5: "Notifica tudo"). Sempre gravado via service_role. */
export async function createNotification(
  adAccountId: string,
  type: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const supabase = createServiceRoleClient();

  const { data: account } = await supabase.from("ad_accounts").select("org_id").eq("id", adAccountId).maybeSingle();
  if (!account) return;

  await supabase.from("notifications").insert({ org_id: account.org_id, ad_account_id: adAccountId, type, payload });
}
