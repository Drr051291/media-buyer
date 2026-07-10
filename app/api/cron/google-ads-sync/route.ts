import { NextResponse } from "next/server";
import { enqueueMissingJobs, requireCronSecret } from "@/lib/engine/sync-orchestrator";
import {
  processOneGoogleEntitiesChunk,
  processOneGoogleInsightsDailyChunk,
} from "@/lib/providers/google-ads/sync";

/**
 * Sync incremental do Google Ads (ETAPA3GOOGLEADS BLOCO 5). Enfileira jobs
 * (só para contas provider='google') e processa chunks dentro de um orçamento
 * de tempo (disciplina de timeout Vercel, PROJECT.md §3.2). 1 conta/chunk.
 *
 * No plano Hobby o worker consolidado /api/cron/sync também drena essas filas;
 * esta rota existe para acionamento manual/Pro e testes.
 */
export const maxDuration = 60;
const TIME_BUDGET_MS = 50_000;
const ENQUEUE_FREQUENCY_HOURS = 6;

export async function GET(request: Request) {
  if (!requireCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await Promise.all([
    enqueueMissingJobs("google_sync_entities", ENQUEUE_FREQUENCY_HOURS, "google"),
    enqueueMissingJobs("google_sync_insights_daily", ENQUEUE_FREQUENCY_HOURS, "google"),
  ]);

  const startedAt = Date.now();
  const counts = { entities: 0, insights: 0 };
  while (Date.now() - startedAt < TIME_BUDGET_MS) {
    let any = false;
    const e = await processOneGoogleEntitiesChunk();
    if (e.processed) {
      counts.entities += 1;
      any = true;
    }
    if (Date.now() - startedAt >= TIME_BUDGET_MS) break;
    const i = await processOneGoogleInsightsDailyChunk();
    if (i.processed) {
      counts.insights += 1;
      any = true;
    }
    if (!any) break;
  }

  return NextResponse.json({ durationMs: Date.now() - startedAt, chunksProcessed: counts });
}
