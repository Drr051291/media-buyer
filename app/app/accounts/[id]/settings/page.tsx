import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth/session";
import { AutonomyForm, GuardrailsForm, type GuardrailsFormValues } from "./settings-form";

export default async function AccountSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: account } = await supabase
    .from("ad_accounts")
    .select("id, name, autonomy_mode, org_id")
    .eq("id", id)
    .maybeSingle();
  if (!account) notFound();

  const [{ memberships }, { data: guardrailsRow }, { data: flagRow }] = await Promise.all([
    getSessionContext(),
    supabase.from("guardrails").select("*").eq("ad_account_id", id).maybeSingle(),
    supabase
      .from("feature_flags")
      .select("enabled")
      .eq("org_id", account.org_id)
      .eq("flag", "autopilot_enabled")
      .maybeSingle(),
  ]);

  const role = memberships.find((m) => m.org_id === account.org_id)?.role ?? null;
  const canEditAutonomy = role === "owner" || role === "admin";

  const guardrailsValues: GuardrailsFormValues = {
    max_budget_change_pct: guardrailsRow?.max_budget_change_pct ?? 20,
    daily_spend_cap: guardrailsRow?.daily_spend_cap ?? null,
    cooldown_hours: guardrailsRow?.cooldown_hours ?? 48,
    max_actions_per_day: guardrailsRow?.max_actions_per_day ?? 5,
    protected_entity_ids: guardrailsRow?.protected_entity_ids ?? [],
    execution_window:
      guardrailsRow?.execution_window && Object.keys(guardrailsRow.execution_window).length > 0
        ? guardrailsRow.execution_window
        : null,
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Configurações — {account.name}</h1>
        <p className="text-sm text-muted-foreground">Modo de autonomia e guardrails de execução (PROJECT.md 6.5).</p>
      </div>

      <AutonomyForm
        adAccountId={id}
        currentMode={account.autonomy_mode}
        canEdit={canEditAutonomy}
        autopilotEnabled={!!flagRow?.enabled}
      />

      <GuardrailsForm adAccountId={id} values={guardrailsValues} />
    </div>
  );
}
