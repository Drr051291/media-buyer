import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { MetaClient, MetaApiError } from "@/lib/meta/client";
import { fetchDailyAdInsights } from "@/lib/meta/insights";
import {
  enqueueMissingJobs,
  claimNextJob,
  updateJobProgress,
  resolveAdAccountForSync,
  requireCronSecret,
} from "@/lib/engine/sync-orchestrator";

const FREQUENCY_HOURS = 6; // PROJECT.md 6.1: 3x/dia (manhã, tarde, noite)
const WINDOW_DAYS = 7; // re-fetch cobre atualização de atribuição

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Worker do job sync_insights_daily. Cada invocação sincroniza os últimos 7
 * dias de insights nível ad de UMA conta (janela pequena o bastante para
 * caber inteira numa invocação — PROJECT.md 3.2).
 */
export async function GET(request: Request) {
  if (!requireCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await enqueueMissingJobs("sync_insights_daily", FREQUENCY_HOURS);

  const job = await claimNextJob("sync_insights_daily");
  if (!job) {
    return NextResponse.json({ processed: false, reason: "sem jobs pendentes" });
  }

  try {
    const account = await resolveAdAccountForSync(job.ad_account_id);
    const client = new MetaClient({ accessToken: account.accessToken });

    const until = new Date();
    const since = new Date(until);
    since.setDate(since.getDate() - WINDOW_DAYS);

    const rows = await fetchDailyAdInsights(client, account.metaAccountId, isoDate(since), isoDate(until));

    const supabase = createServiceRoleClient();
    if (rows.length > 0) {
      const { error } = await supabase.from("metrics_daily").upsert(
        rows.map((r) => ({
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

    await updateJobProgress(job.id, {
      status: "done",
      finished_at: new Date().toISOString(),
      meta_usage_pct: client.usage?.accountUsagePct ?? null,
    });

    return NextResponse.json({ processed: true, rowsUpserted: rows.length });
  } catch (error) {
    const message = error instanceof MetaApiError ? `Meta: ${error.message}` : String(error);
    await updateJobProgress(job.id, { status: "failed", error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
