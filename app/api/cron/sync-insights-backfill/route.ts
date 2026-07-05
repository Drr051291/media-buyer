import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/engine/sync-orchestrator";
import { processOneBackfillChunk } from "@/lib/engine/sync-workers";

/**
 * Endpoint individual mantido para disparo/debug manual. O agendamento de
 * produção usa /api/cron/sync (worker unificado) por causa do limite de
 * cron 1x/dia do plano Hobby da Vercel. sync_insights_backfill não usa
 * enqueueMissingJobs — é disparado 1x no onboarding por /api/meta/connect.
 */
export async function GET(request: Request) {
  if (!requireCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await processOneBackfillChunk();
  return NextResponse.json(result);
}
