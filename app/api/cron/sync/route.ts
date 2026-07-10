import { NextResponse } from "next/server";
import { enqueueMissingJobs, requireCronSecret } from "@/lib/engine/sync-orchestrator";
import { CHUNKED_JOB_KINDS, processOneChunkOfKind, runTokenHealthCheck } from "@/lib/engine/sync-workers";
import { processNextGa4Incremental, processNextGa4BackfillChunk } from "@/lib/connectors/ga4/sync";

/**
 * Worker único, agendado 1x/dia (plano Hobby da Vercel só permite cron
 * diário — ver README). Em vez de 5 crons separados e frequentes, esta rota
 * roda em loop dentro de um orçamento de tempo, processando quantos chunks
 * couberem de cada tipo de sync_job antes do timeout da função.
 *
 * Cada chunk continua sendo "1 página/dimensão/fase de 1 conta" — a
 * chunking em si (PROJECT.md 3.2) não muda, só a forma de agendar.
 */
export const maxDuration = 60;
const TIME_BUDGET_MS = 50_000;

// Frequência generosa (menor que 24h) para garantir que o enfileiramento
// pegue todas as contas mesmo com o jitter do cron diário da Vercel.
const ENQUEUE_FREQUENCY_HOURS = 20;

export async function GET(request: Request) {
  if (!requireCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();

  await Promise.all([
    enqueueMissingJobs("sync_entities", ENQUEUE_FREQUENCY_HOURS),
    enqueueMissingJobs("sync_insights_daily", ENQUEUE_FREQUENCY_HOURS),
    enqueueMissingJobs("sync_breakdowns", ENQUEUE_FREQUENCY_HOURS),
    enqueueMissingJobs("daily_analysis", ENQUEUE_FREQUENCY_HOURS),
    enqueueMissingJobs("measure_action_results", ENQUEUE_FREQUENCY_HOURS),
  ]);

  const tokenHealth = await runTokenHealthCheck().catch((error) => ({
    processed: false,
    error: String(error),
  }));

  const processedCounts: Record<string, number> = Object.fromEntries(
    CHUNKED_JOB_KINDS.map((kind) => [kind, 0]),
  );
  const ga4Counts = { incremental: 0, backfill: 0 };

  // Round-robin entre os tipos de sync_jobs (Meta) + o conector GA4
  // (connections.sync_cursor) até o orçamento de tempo acabar ou uma volta
  // inteira não processar nada (filas drenadas).
  while (Date.now() - startedAt < TIME_BUDGET_MS) {
    let processedAnyThisRound = false;

    for (const kind of CHUNKED_JOB_KINDS) {
      if (Date.now() - startedAt >= TIME_BUDGET_MS) break;

      const result = await processOneChunkOfKind(kind);
      if (result.processed) {
        processedCounts[kind] += 1;
        processedAnyThisRound = true;
      }
    }

    // GA4: backfill tem prioridade sobre incremental (recém-conectadas
    // precisam do histórico antes da análise cruzada fazer sentido).
    if (Date.now() - startedAt < TIME_BUDGET_MS) {
      const backfill = await processNextGa4BackfillChunk().catch(() => ({ processed: false }));
      if (backfill.processed) {
        ga4Counts.backfill += 1;
        processedAnyThisRound = true;
      }
    }
    if (Date.now() - startedAt < TIME_BUDGET_MS) {
      const incremental = await processNextGa4Incremental().catch(() => ({ processed: false }));
      if (incremental.processed) {
        ga4Counts.incremental += 1;
        processedAnyThisRound = true;
      }
    }

    if (!processedAnyThisRound) break;
  }

  return NextResponse.json({
    durationMs: Date.now() - startedAt,
    tokenHealth,
    chunksProcessed: processedCounts,
    ga4: ga4Counts,
  });
}
