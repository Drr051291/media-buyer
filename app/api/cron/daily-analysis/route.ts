import { NextResponse } from "next/server";
import { enqueueMissingJobs, requireCronSecret } from "@/lib/engine/sync-orchestrator";
import { processOneDailyAnalysisChunk } from "@/lib/engine/sync-workers";

const FREQUENCY_HOURS = 20; // PROJECT.md 6.4: analise diaria, 1x/dia

/**
 * Endpoint individual mantido para disparo/debug manual. O agendamento de
 * produção usa /api/cron/sync (worker unificado) por causa do limite de
 * cron 1x/dia do plano Hobby da Vercel.
 */
export async function GET(request: Request) {
  if (!requireCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await enqueueMissingJobs("daily_analysis", FREQUENCY_HOURS);
  const result = await processOneDailyAnalysisChunk();
  return NextResponse.json(result);
}
