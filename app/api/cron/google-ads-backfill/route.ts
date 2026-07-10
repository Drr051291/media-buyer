import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/engine/sync-orchestrator";
import { processOneGoogleBackfillChunk } from "@/lib/providers/google-ads/sync";

/**
 * Backfill 90d do Google Ads (ETAPA3GOOGLEADS BLOCO 5), chunked e retomável.
 * Uma janela (~14 dias) por iteração até esgotar o orçamento de tempo; o
 * progresso fica em sync_jobs.cursor, então uma falha no meio retoma do cursor
 * (não recomeça do zero). Enfileirado no connect (enqueueGoogleBackfill).
 */
export const maxDuration = 60;
const TIME_BUDGET_MS = 50_000;

export async function GET(request: Request) {
  if (!requireCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  let chunks = 0;
  while (Date.now() - startedAt < TIME_BUDGET_MS) {
    const result = await processOneGoogleBackfillChunk();
    if (!result.processed) break;
    chunks += 1;
  }

  return NextResponse.json({ durationMs: Date.now() - startedAt, chunksProcessed: chunks });
}
