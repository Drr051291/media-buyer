import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { MetaClient, MetaApiError } from "@/lib/meta/client";
import {
  submitAsyncInsightsJob,
  pollAsyncInsightsJob,
  fetchAsyncInsightsPage,
} from "@/lib/meta/async-reports";
import {
  claimNextJob,
  updateJobProgress,
  resolveAdAccountForSync,
  requireCronSecret,
} from "@/lib/engine/sync-orchestrator";

interface BackfillCursor {
  phase: "submit" | "poll" | "download";
  since: string;
  until: string;
  reportRunId?: string;
  after?: string;
}

/**
 * Worker do job sync_insights_backfill (90 dias, 1x no onboarding —
 * disparado por /api/meta/connect, não por frequência). Três fases
 * deliberadamente separadas em invocações distintas (PROJECT.md 3.2):
 *   submit  → cria o async job na Meta
 *   poll    → consulta status até "completed"
 *   download → baixa UMA página por invocação
 */
export async function GET(request: Request) {
  if (!requireCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const job = await claimNextJob("sync_insights_backfill");
  if (!job) {
    return NextResponse.json({ processed: false, reason: "sem jobs pendentes" });
  }

  const cursor = job.cursor as unknown as BackfillCursor;

  try {
    const account = await resolveAdAccountForSync(job.ad_account_id);
    const client = new MetaClient({ accessToken: account.accessToken });

    if (cursor.phase === "submit") {
      const { reportRunId } = await submitAsyncInsightsJob(
        client,
        account.metaAccountId,
        cursor.since,
        cursor.until,
      );
      await updateJobProgress(job.id, {
        cursor: { ...cursor, phase: "poll", reportRunId },
        status: "pending",
      });
      return NextResponse.json({ processed: true, phase: "submit", reportRunId });
    }

    if (cursor.phase === "poll") {
      if (!cursor.reportRunId) throw new Error("cursor sem reportRunId na fase poll");

      const progress = await pollAsyncInsightsJob(client, cursor.reportRunId);
      if (progress.status === "failed") {
        throw new Error("Job assíncrono da Meta falhou (async_status=Job Failed)");
      }
      if (progress.status === "completed") {
        await updateJobProgress(job.id, { cursor: { ...cursor, phase: "download" }, status: "pending" });
        return NextResponse.json({ processed: true, phase: "poll", result: "completed" });
      }

      // ainda rodando: devolve para pending, o orquestrador re-invoca depois
      await updateJobProgress(job.id, { cursor, status: "pending" });
      return NextResponse.json({
        processed: true,
        phase: "poll",
        result: "running",
        percentCompletion: progress.percentCompletion,
      });
    }

    // phase === "download"
    if (!cursor.reportRunId) throw new Error("cursor sem reportRunId na fase download");

    const page = await fetchAsyncInsightsPage(client, cursor.reportRunId, cursor.after);

    const supabase = createServiceRoleClient();
    if (page.rows.length > 0) {
      const { error } = await supabase.from("metrics_daily").upsert(
        page.rows.map((r) => ({
          ad_account_id: job.ad_account_id,
          entity_level: "ad" as const,
          entity_meta_id: r.adMetaId,
          date: r.date,
          breakdown_key: "all",
          spend: r.spend,
          impressions: r.impressions,
          reach: r.reach,
          frequency: r.frequency,
          clicks: r.clicks,
          link_clicks: r.linkClicks,
          ctr: r.ctr,
          cpm: r.cpm,
          cpc: r.cpc,
          conversions: r.conversions,
          conversion_value: r.conversionValue,
          cpa: r.cpa,
          roas: r.roas,
          raw: r.raw,
          synced_at: new Date().toISOString(),
        })),
        { onConflict: "ad_account_id,entity_level,entity_meta_id,date,breakdown_key" },
      );
      if (error) throw error;
    }

    if (page.nextAfter) {
      await updateJobProgress(job.id, {
        cursor: { ...cursor, after: page.nextAfter },
        status: "pending",
      });
    } else {
      await updateJobProgress(job.id, { status: "done", finished_at: new Date().toISOString() });
    }

    return NextResponse.json({ processed: true, phase: "download", rowsUpserted: page.rows.length });
  } catch (error) {
    const message = error instanceof MetaApiError ? `Meta: ${error.message}` : String(error);
    await updateJobProgress(job.id, { status: "failed", error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
