import { MetaClient, spendGreaterThanZeroFilter } from "./client";
import { INSIGHTS_FIELDS, toAdInsightRow, type AdInsightRow, type InsightsResponse } from "./insights";

/**
 * Backfill de 90 dias via Async Insights Jobs da Meta (PROJECT.md 3.2, 6.1).
 * Três etapas deliberadamente separadas em três funções — cada uma roda numa
 * invocação de cron distinta para caber no timeout da Vercel:
 *   1. submitAsyncInsightsJob  → cria o job, devolve report_run_id
 *   2. pollAsyncInsightsJob    → consulta status (chamar até "completed")
 *   3. downloadAsyncInsightsResults → baixa os resultados paginados
 */

export async function submitAsyncInsightsJob(
  client: MetaClient,
  metaAccountId: string,
  since: string,
  until: string,
): Promise<{ reportRunId: string }> {
  const response = await client.post<{ report_run_id: string }>(`act_${metaAccountId}/insights`, {
    level: "ad",
    time_increment: 1,
    time_range: JSON.stringify({ since, until }),
    fields: INSIGHTS_FIELDS,
    filtering: spendGreaterThanZeroFilter(),
    async: true,
  });

  return { reportRunId: response.report_run_id };
}

export type AsyncJobStatus = "running" | "completed" | "failed";

export interface AsyncJobProgress {
  status: AsyncJobStatus;
  percentCompletion: number;
}

interface AsyncStatusResponse {
  async_status?: string;
  async_percent_completion?: number;
}

export async function pollAsyncInsightsJob(
  client: MetaClient,
  reportRunId: string,
): Promise<AsyncJobProgress> {
  const response = await client.get<AsyncStatusResponse>(reportRunId);

  const status: AsyncJobStatus =
    response.async_status === "Job Completed"
      ? "completed"
      : response.async_status === "Job Failed"
        ? "failed"
        : "running";

  return { status, percentCompletion: response.async_percent_completion ?? 0 };
}

export interface AsyncInsightsPage {
  rows: AdInsightRow[];
  nextAfter: string | null;
}

/**
 * Baixa UMA página de resultados de um job assíncrono já concluído. Fica a
 * cargo do chamador (job de cron) paginar entre invocações via
 * sync_jobs.cursor — 90 dias de dados de conta grande não cabem numa
 * invocação só (PROJECT.md 3.2).
 */
export async function fetchAsyncInsightsPage(
  client: MetaClient,
  reportRunId: string,
  after?: string,
  limit = 500,
): Promise<AsyncInsightsPage> {
  const response = await client.get<InsightsResponse>(`${reportRunId}/insights`, { limit, after });

  return {
    rows: response.data.map(toAdInsightRow),
    nextAfter: response.paging?.next ? (response.paging.cursors?.after ?? null) : null,
  };
}
