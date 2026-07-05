"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SettingsActionState = { error: string | null; ok?: boolean };

const AUTONOMY_MODES = ["observador", "copiloto", "autopilot"] as const;

export async function updateAutonomyMode(
  adAccountId: string,
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const mode = String(formData.get("autonomy_mode") ?? "");
  if (!AUTONOMY_MODES.includes(mode as (typeof AUTONOMY_MODES)[number])) {
    return { error: "Modo de autonomia inválido" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ad_accounts")
    .update({ autonomy_mode: mode })
    .eq("id", adAccountId)
    .select("id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "Sem permissão para alterar o modo de autonomia desta conta (apenas owner/admin)." };

  revalidatePath(`/app/accounts/${adAccountId}/settings`);
  return { error: null, ok: true };
}

function toNumberOrNull(value: FormDataEntryValue | null): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toIdList(value: FormDataEntryValue | null): string[] {
  if (value == null) return [];
  return String(value)
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function updateGuardrails(
  adAccountId: string,
  _prevState: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const maxBudgetChangePct = toNumberOrNull(formData.get("max_budget_change_pct")) ?? 20;
  const dailySpendCap = toNumberOrNull(formData.get("daily_spend_cap"));
  const cooldownHours = toNumberOrNull(formData.get("cooldown_hours")) ?? 48;
  const maxActionsPerDay = toNumberOrNull(formData.get("max_actions_per_day")) ?? 5;
  const protectedEntityIds = toIdList(formData.get("protected_entity_ids"));

  const startHour = toNumberOrNull(formData.get("execution_window_start"));
  const endHour = toNumberOrNull(formData.get("execution_window_end"));
  const executionWindow = startHour != null && endHour != null ? { startHour, endHour } : {};

  const supabase = await createClient();
  const { error } = await supabase.from("guardrails").upsert(
    {
      ad_account_id: adAccountId,
      max_budget_change_pct: maxBudgetChangePct,
      daily_spend_cap: dailySpendCap,
      cooldown_hours: cooldownHours,
      max_actions_per_day: maxActionsPerDay,
      protected_entity_ids: protectedEntityIds,
      execution_window: executionWindow,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "ad_account_id" },
  );

  if (error) return { error: error.message };

  revalidatePath(`/app/accounts/${adAccountId}/settings`);
  return { error: null, ok: true };
}
