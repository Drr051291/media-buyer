import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/engine/sync-orchestrator";
import { processNextGa4Incremental } from "@/lib/connectors/ga4/sync";

/**
 * Sync incremental do GA4 (ETAPA2-GA4 BLOCO 6). Processa UMA propriedade por
 * invocacao, dentro de um orcamento de tempo (disciplina de timeout Vercel,
 * PROJECT.md 3.2), avancando o cursor em connections.sync_cursor.
 *
 * No plano Hobby (1 cron/dia) o worker consolidado /api/cron/sync tambem drena
 * essa fila; esta rota existe para acionamento manual/Pro e testes.
 */
export const maxDuration = 60;
const TIME_BUDGET_MS = 50_000;

export async function GET(request: Request) {
  if (!requireCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startedAt = Date.now();
  let processed = 0;
  while (Date.now() - startedAt < TIME_BUDGET_MS) {
    const result = await processNextGa4Incremental();
    if (!result.processed) break;
    processed += 1;
  }

  return NextResponse.json({ durationMs: Date.now() - startedAt, connectionsSynced: processed });
}
