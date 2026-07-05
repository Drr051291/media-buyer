import { NextResponse } from "next/server";
import { enqueueMissingJobs, requireCronSecret } from "@/lib/engine/sync-orchestrator";
import { processOneEntitiesChunk } from "@/lib/engine/sync-workers";

const FREQUENCY_HOURS = 6; // PROJECT.md 6.1: sync_entities roda 6/6h (alvo; ver README sobre o limite do plano Hobby)

/**
 * Endpoint individual mantido para disparo/debug manual (ex: curl com
 * CRON_SECRET). O agendamento de produção usa /api/cron/sync (worker
 * unificado), já que o plano Hobby da Vercel só permite cron 1x/dia.
 */
export async function GET(request: Request) {
  if (!requireCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await enqueueMissingJobs("sync_entities", FREQUENCY_HOURS);
  const result = await processOneEntitiesChunk();
  return NextResponse.json(result);
}
