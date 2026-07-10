import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/engine/sync-orchestrator";
import { processNextGa4BackfillChunk } from "@/lib/connectors/ga4/sync";

/**
 * Backfill 90d do GA4 (ETAPA2-GA4 BLOCO 6), chunked e retomavel. Uma janela
 * (~14 dias) por iteracao ate esgotar o orcamento de tempo; o progresso fica
 * em connections.sync_cursor.backfill, entao uma falha no meio retoma do
 * cursor (nao recomeca do zero). Disparado no fim do wizard (initBackfill).
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
    const result = await processNextGa4BackfillChunk();
    if (!result.processed) break;
    chunks += 1;
  }

  return NextResponse.json({ durationMs: Date.now() - startedAt, chunksProcessed: chunks });
}
