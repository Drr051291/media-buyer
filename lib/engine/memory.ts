import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Memória do agente (PROJECT.md 6.4, item 4): resumo textual das últimas
 * ações executadas + resultado medido, e das recomendações rejeitadas +
 * motivo — injetado no prompt do Reasoner para aprender o resultado de
 * decisões passadas e a preferência do gestor.
 */

const MEMORY_LOOKBACK_DAYS = 30;
const MAX_EXECUTED = 8;
const MAX_REJECTED = 5;

interface EntityRefLike {
  name?: string;
}

interface ActionResultLike {
  metric: string;
  baseline_value: number | null;
  d4_value: number | null;
  d7_value: number | null;
  delta_pct: number | null;
  verdict: string | null;
}

interface ExecutedActionRow {
  type: string;
  entity_ref: EntityRefLike;
  executed_at: string;
  action_results: ActionResultLike[] | ActionResultLike | null;
}

interface RejectedActionRow {
  type: string;
  entity_ref: EntityRefLike;
  reasoning: string | null;
  decision_note: string | null;
  decided_at: string;
}

function formatExecuted(row: ExecutedActionRow): string {
  const name = row.entity_ref?.name ?? "entidade";
  const when = row.executed_at.slice(0, 10);
  const result = Array.isArray(row.action_results) ? row.action_results[0] : row.action_results;

  if (!result || result.verdict == null) {
    return `${when}: ${row.type} em "${name}" — resultado ainda não medido`;
  }

  const delta = result.delta_pct != null ? `${result.delta_pct > 0 ? "+" : ""}${result.delta_pct.toFixed(1)}%` : "n/d";
  return `${when}: ${row.type} em "${name}" → ${result.metric} ${delta} (${result.verdict}); baseline ${result.baseline_value ?? "?"}, atual ${result.d7_value ?? result.d4_value ?? "?"}`;
}

function formatRejected(row: RejectedActionRow): string {
  const name = row.entity_ref?.name ?? "entidade";
  const motivo = row.decision_note?.trim() || "sem motivo registrado pelo gestor";
  return `Rejeitado em ${row.decided_at.slice(0, 10)} — ${row.type} em "${name}": ${motivo}`;
}

export async function buildActionMemory(adAccountId: string): Promise<string> {
  const supabase = createServiceRoleClient();
  const sinceIso = new Date(Date.now() - MEMORY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: executed }, { data: rejected }] = await Promise.all([
    supabase
      .from("actions")
      .select("type, entity_ref, executed_at, action_results(metric, baseline_value, d4_value, d7_value, delta_pct, verdict)")
      .eq("ad_account_id", adAccountId)
      .eq("status", "executed")
      .gte("executed_at", sinceIso)
      .order("executed_at", { ascending: false })
      .limit(MAX_EXECUTED),
    supabase
      .from("actions")
      .select("type, entity_ref, reasoning, decision_note, decided_at")
      .eq("ad_account_id", adAccountId)
      .eq("status", "rejected")
      .gte("decided_at", sinceIso)
      .order("decided_at", { ascending: false })
      .limit(MAX_REJECTED),
  ]);

  const lines = [
    ...((executed ?? []) as ExecutedActionRow[]).map(formatExecuted),
    ...((rejected ?? []) as RejectedActionRow[]).map(formatRejected),
  ];

  return lines.length > 0 ? lines.join("\n") : "Sem histórico de ações executadas ou rejeitadas ainda.";
}
