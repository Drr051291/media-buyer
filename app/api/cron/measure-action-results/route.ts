import { NextResponse } from "next/server";
import { enqueueMissingJobs, requireCronSecret } from "@/lib/engine/sync-orchestrator";
import { processOneMeasureActionResultsChunk } from "@/lib/engine/sync-workers";

const FREQUENCY_HOURS = 20; // PROJECT.md 6.5: medição de resultado, varredura diária

/**
 * Endpoint individual mantido para disparo/debug manual. O agendamento de
 * produção usa /api/cron/sync (worker unificado) por causa do limite de
 * cron 1x/dia do plano Hobby da Vercel.
 */
export async function GET(request: Request) {
  if (!requireCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await enqueueMissingJobs("measure_action_results", FREQUENCY_HOURS);
  const result = await processOneMeasureActionResultsChunk();
  return NextResponse.json(result);
}
