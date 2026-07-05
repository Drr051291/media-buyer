import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

export type SyncJobKind =
  | "sync_entities"
  | "sync_insights_daily"
  | "sync_insights_backfill"
  | "sync_breakdowns"
  | "token_health";

export interface SyncJobRow {
  id: string;
  ad_account_id: string;
  kind: SyncJobKind;
  status: "pending" | "running" | "done" | "failed";
  cursor: Record<string, unknown>;
  next_chunk: Record<string, unknown> | null;
  meta_usage_pct: number | null;
  error: string | null;
}

/**
 * Cria um job pendente para cada conta ativa que não tem um job deste tipo
 * rodando/pendente nem concluído dentro da janela de frequência. Uso: jobs
 * recorrentes (sync_entities a cada 6h, sync_insights_daily 3x/dia, etc).
 * NÃO usar para sync_insights_backfill — esse é disparado uma vez no
 * onboarding (ver /api/meta/connect), não por frequência.
 */
export async function enqueueMissingJobs(kind: SyncJobKind, frequencyHours: number): Promise<void> {
  const supabase = createServiceRoleClient();

  const { data: accounts } = await supabase.from("ad_accounts").select("id").eq("status", "active");
  if (!accounts || accounts.length === 0) return;

  const cutoffIso = new Date(Date.now() - frequencyHours * 60 * 60 * 1000).toISOString();

  for (const account of accounts) {
    const { data: active } = await supabase
      .from("sync_jobs")
      .select("id")
      .eq("ad_account_id", account.id)
      .eq("kind", kind)
      .in("status", ["pending", "running"])
      .limit(1);

    if (active && active.length > 0) continue;

    const { data: lastDone } = await supabase
      .from("sync_jobs")
      .select("finished_at")
      .eq("ad_account_id", account.id)
      .eq("kind", kind)
      .eq("status", "done")
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastDone?.finished_at && lastDone.finished_at > cutoffIso) continue;

    await supabase.from("sync_jobs").insert({ ad_account_id: account.id, kind, status: "pending", cursor: {} });
  }
}

/** Reivindica atomicamente o próximo job pendente de um tipo (FOR UPDATE SKIP LOCKED). */
export async function claimNextJob(kind: SyncJobKind): Promise<SyncJobRow | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase.rpc("claim_next_sync_job", { p_kind: kind });
  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  return (row as SyncJobRow) ?? null;
}

export async function updateJobProgress(
  jobId: string,
  patch: Partial<{
    cursor: object;
    status: SyncJobRow["status"];
    error: string | null;
    meta_usage_pct: number | null;
    finished_at: string;
  }>,
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("sync_jobs").update(patch).eq("id", jobId);
  if (error) throw error;
}

export interface AdAccountForSync {
  id: string;
  metaAccountId: string;
  accessToken: string;
}

/** Resolve a conta + token descriptografado (Vault) para um sync_jobs.ad_account_id. */
export async function resolveAdAccountForSync(adAccountId: string): Promise<AdAccountForSync> {
  const { readSecret } = await import("@/lib/vault");
  const supabase = createServiceRoleClient();

  const { data: account, error } = await supabase
    .from("ad_accounts")
    .select("id, meta_account_id, meta_tokens(vault_secret_id)")
    .eq("id", adAccountId)
    .single();

  if (error || !account) throw new Error("Conta não encontrada");

  const tokenRow = Array.isArray(account.meta_tokens) ? account.meta_tokens[0] : account.meta_tokens;
  if (!tokenRow) throw new Error("Token da conta não encontrado");

  const accessToken = await readSecret(tokenRow.vault_secret_id);
  if (!accessToken) throw new Error("Token indisponível no Vault");

  return { id: account.id, metaAccountId: account.meta_account_id, accessToken };
}

export function requireCronSecret(request: Request): boolean {
  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}
