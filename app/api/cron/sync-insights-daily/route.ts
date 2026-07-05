import { NextResponse } from "next/server";
import { enqueueMissingJobs, requireCronSecret } from "@/lib/engine/sync-orchestrator";
import { processOneInsightsDailyChunk } from "@/lib/engine/sync-workers";

const FREQUENCY_HOURS = 6; // PROJECT.md 6.1: alvo 3x/dia (ver README sobre o limite do plano Hobby)

/**
 * Endpoint individual mantido para disparo/debug manual. O agendamento de
 * produção usa /api/cron/sync (worker unificado) por causa do limite de
 * cron 1x/dia do plano Hobby da Vercel.
 */
export async function GET(request: Request) {
  if (!requireCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await enqueueMissingJobs("sync_insights_daily", FREQUENCY_HOURS);
  const result = await processOneInsightsDailyChunk();
  return NextResponse.json(result);
}
