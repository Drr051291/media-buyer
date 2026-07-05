import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { executeAction } from "./executor";
import { createNotification } from "./notifications";

/**
 * Autopilot (PROJECT.md 6.5): em contas com autonomy_mode='autopilot',
 * ações risk='low' são auto-aprovadas e executadas — ainda passando pelo
 * mesmo checkAllGuardrails do Executor (nada pula o pipeline de segurança).
 * risk='medium'/'high' continuam pendentes de aprovação humana no feed.
 * Toda execução ou bloqueio gera uma notificação.
 */
export async function runAutopilotSweep(adAccountId: string): Promise<{ executed: number; blocked: number }> {
  const supabase = createServiceRoleClient();

  const { data: account } = await supabase
    .from("ad_accounts")
    .select("autonomy_mode")
    .eq("id", adAccountId)
    .maybeSingle();

  if (account?.autonomy_mode !== "autopilot") return { executed: 0, blocked: 0 };

  const { data: pending } = await supabase
    .from("actions")
    .select("id, type, entity_ref")
    .eq("ad_account_id", adAccountId)
    .eq("status", "proposed")
    .eq("risk", "low");

  let executed = 0;
  let blocked = 0;

  for (const action of pending ?? []) {
    const { data: approved } = await supabase
      .from("actions")
      .update({ status: "approved", decided_at: new Date().toISOString() })
      .eq("id", action.id)
      .eq("status", "proposed")
      .select("id")
      .maybeSingle();

    if (!approved) continue; // outra invocação já pegou essa action

    const result = await executeAction(action.id);

    if (result.status === "executed") {
      executed++;
      await createNotification(adAccountId, "autopilot_executed", {
        action_id: action.id,
        type: action.type,
        entity_ref: action.entity_ref,
      });
    } else {
      blocked++;
      await createNotification(adAccountId, "autopilot_blocked", {
        action_id: action.id,
        type: action.type,
        entity_ref: action.entity_ref,
        reason: result.violations?.join("; ") ?? result.error ?? "motivo desconhecido",
      });
    }
  }

  return { executed, blocked };
}
