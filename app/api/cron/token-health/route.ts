import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/engine/sync-orchestrator";
import { runTokenHealthCheck } from "@/lib/engine/sync-workers";

/**
 * Endpoint individual mantido para disparo/debug manual. O agendamento de
 * produção usa /api/cron/sync (worker unificado), que já roda o token
 * health check a cada invocação diária.
 */
export async function GET(request: Request) {
  if (!requireCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runTokenHealthCheck();
  return NextResponse.json(result);
}
