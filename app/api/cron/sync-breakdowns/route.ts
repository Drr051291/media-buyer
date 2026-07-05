import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { MetaClient, MetaApiError } from "@/lib/meta/client";
import { fetchDailyBreakdownInsights, breakdownKey, type BreakdownDimension } from "@/lib/meta/breakdowns";
import {
  enqueueMissingJobs,
  claimNextJob,
  updateJobProgress,
  resolveAdAccountForSync,
  requireCronSecret,
} from "@/lib/engine/sync-orchestrator";

const DIMENSIONS: BreakdownDimension[] = ["publisher_platform", "platform_position", "age", "gender"];
const FREQUENCY_HOURS = 24; // PROJECT.md 6.1: sync_breakdowns 1x/dia
const WINDOW_DAYS = 7;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

interface BreakdownsCursor {
  dimensionIndex?: number;
}

/**
 * Worker do job sync_breakdowns. Cada invocação processa UMA dimensão
 * (nunca combinadas — PROJECT.md 6.1) de UMA conta.
 */
export async function GET(request: Request) {
  if (!requireCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await enqueueMissingJobs("sync_breakdowns", FREQUENCY_HOURS);

  const job = await claimNextJob("sync_breakdowns");
  if (!job) {
    return NextResponse.json({ processed: false, reason: "sem jobs pendentes" });
  }

  try {
    const account = await resolveAdAccountForSync(job.ad_account_id);
    const client = new MetaClient({ accessToken: account.accessToken });

    const cursor = job.cursor as unknown as BreakdownsCursor;
    const dimensionIndex = cursor.dimensionIndex ?? 0;
    const dimension = DIMENSIONS[dimensionIndex];

    const until = new Date();
    const since = new Date(until);
    since.setDate(since.getDate() - WINDOW_DAYS);

    const rows = await fetchDailyBreakdownInsights(
      client,
      account.metaAccountId,
      dimension,
      isoDate(since),
      isoDate(until),
    );

    const supabase = createServiceRoleClient();
    if (rows.length > 0) {
      const { error } = await supabase.from("metrics_daily").upsert(
        rows.map((r) => ({
          ad_account_id: job.ad_account_id,
          entity_level: "ad" as const,
          entity_meta_id: r.adMetaId,
          date: r.date,
          breakdown_key: breakdownKey(r.dimension, r.dimensionValue),
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

    const usagePct = client.usage?.accountUsagePct ?? null;

    if (dimensionIndex + 1 < DIMENSIONS.length) {
      await updateJobProgress(job.id, {
        cursor: { dimensionIndex: dimensionIndex + 1 },
        status: "pending",
        meta_usage_pct: usagePct,
      });
    } else {
      await updateJobProgress(job.id, {
        status: "done",
        finished_at: new Date().toISOString(),
        meta_usage_pct: usagePct,
      });
    }

    return NextResponse.json({ processed: true, dimension, rowsUpserted: rows.length });
  } catch (error) {
    const message = error instanceof MetaApiError ? `Meta: ${error.message}` : String(error);
    await updateJobProgress(job.id, { status: "failed", error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
