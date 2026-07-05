import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { MetaClient, MetaApiError } from "@/lib/meta/client";
import { fetchEntitiesPage, type EntityLevel } from "@/lib/meta/entities";
import { fetchDailyAdInsights } from "@/lib/meta/insights";
import {
  submitAsyncInsightsJob,
  pollAsyncInsightsJob,
  fetchAsyncInsightsPage,
} from "@/lib/meta/async-reports";
import { fetchDailyBreakdownInsights, breakdownKey, type BreakdownDimension } from "@/lib/meta/breakdowns";
import { readSecret } from "@/lib/vault";
import { validateToken, hasMinimumScope } from "@/lib/meta/debug-token";
import { claimNextJob, updateJobProgress, resolveAdAccountForSync, type SyncJobKind } from "./sync-orchestrator";

/**
 * Lógica de processamento de UM chunk por tipo de job, extraída das rotas
 * /api/cron/sync-* para ser reutilizável tanto pelas rotas individuais
 * (debug manual) quanto pelo worker unificado /api/cron/sync (necessário no
 * plano Hobby da Vercel, que só permite 1 cron por dia — ver README).
 *
 * Cada função reivindica NO MÁXIMO um job pendente e processa UM chunk dele.
 * Quem chama decide se roda em loop (com orçamento de tempo) ou uma vez só.
 */

const WINDOW_DAYS = 7;

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export interface WorkerResult {
  processed: boolean;
  [key: string]: unknown;
}

const LEVEL_ORDER: EntityLevel[] = ["campaign", "adset", "ad"];

interface EntitiesCursor {
  levelIndex?: number;
  after?: string;
}

export async function processOneEntitiesChunk(): Promise<WorkerResult> {
  const job = await claimNextJob("sync_entities");
  if (!job) return { processed: false, reason: "sem jobs pendentes" };

  try {
    const account = await resolveAdAccountForSync(job.ad_account_id);
    const client = new MetaClient({ accessToken: account.accessToken });

    const cursor = job.cursor as unknown as EntitiesCursor;
    const levelIndex = cursor.levelIndex ?? 0;
    const level = LEVEL_ORDER[levelIndex];

    const page = await fetchEntitiesPage(client, account.metaAccountId, level, cursor.after);

    const supabase = createServiceRoleClient();
    if (page.entities.length > 0) {
      const { error } = await supabase.from("entities").upsert(
        page.entities.map((e) => ({
          ad_account_id: job.ad_account_id,
          level: e.level,
          meta_id: e.metaId,
          parent_meta_id: e.parentMetaId,
          name: e.name,
          status: e.status,
          objective: e.objective,
          daily_budget: e.dailyBudget,
          targeting_summary: e.targetingSummary,
          creative_id: e.creativeId,
          synced_at: new Date().toISOString(),
        })),
        { onConflict: "ad_account_id,level,meta_id" },
      );
      if (error) throw error;
    }

    const usagePct = client.usage?.accountUsagePct ?? null;

    if (page.nextAfter) {
      await updateJobProgress(job.id, {
        cursor: { levelIndex, after: page.nextAfter },
        status: "pending",
        meta_usage_pct: usagePct,
      });
    } else if (levelIndex + 1 < LEVEL_ORDER.length) {
      await updateJobProgress(job.id, {
        cursor: { levelIndex: levelIndex + 1 },
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

    return { processed: true, level, entitiesUpserted: page.entities.length };
  } catch (error) {
    const message = error instanceof MetaApiError ? `Meta: ${error.message}` : String(error);
    await updateJobProgress(job.id, { status: "failed", error: message });
    return { processed: true, error: message };
  }
}

export async function processOneInsightsDailyChunk(): Promise<WorkerResult> {
  const job = await claimNextJob("sync_insights_daily");
  if (!job) return { processed: false, reason: "sem jobs pendentes" };

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

    return { processed: true, rowsUpserted: rows.length };
  } catch (error) {
    const message = error instanceof MetaApiError ? `Meta: ${error.message}` : String(error);
    await updateJobProgress(job.id, { status: "failed", error: message });
    return { processed: true, error: message };
  }
}

interface BackfillCursor {
  phase: "submit" | "poll" | "download";
  since: string;
  until: string;
  reportRunId?: string;
  after?: string;
}

export async function processOneBackfillChunk(): Promise<WorkerResult> {
  const job = await claimNextJob("sync_insights_backfill");
  if (!job) return { processed: false, reason: "sem jobs pendentes" };

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
      return { processed: true, phase: "submit", reportRunId };
    }

    if (cursor.phase === "poll") {
      if (!cursor.reportRunId) throw new Error("cursor sem reportRunId na fase poll");

      const progress = await pollAsyncInsightsJob(client, cursor.reportRunId);
      if (progress.status === "failed") {
        throw new Error("Job assíncrono da Meta falhou (async_status=Job Failed)");
      }
      if (progress.status === "completed") {
        await updateJobProgress(job.id, { cursor: { ...cursor, phase: "download" }, status: "pending" });
        return { processed: true, phase: "poll", result: "completed" };
      }

      await updateJobProgress(job.id, { cursor, status: "pending" });
      return { processed: true, phase: "poll", result: "running", percentCompletion: progress.percentCompletion };
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
      await updateJobProgress(job.id, { cursor: { ...cursor, after: page.nextAfter }, status: "pending" });
    } else {
      await updateJobProgress(job.id, { status: "done", finished_at: new Date().toISOString() });
    }

    return { processed: true, phase: "download", rowsUpserted: page.rows.length };
  } catch (error) {
    const message = error instanceof MetaApiError ? `Meta: ${error.message}` : String(error);
    await updateJobProgress(job.id, { status: "failed", error: message });
    return { processed: true, error: message };
  }
}

const DIMENSIONS: BreakdownDimension[] = ["publisher_platform", "platform_position", "age", "gender"];

interface BreakdownsCursor {
  dimensionIndex?: number;
}

export async function processOneBreakdownsChunk(): Promise<WorkerResult> {
  const job = await claimNextJob("sync_breakdowns");
  if (!job) return { processed: false, reason: "sem jobs pendentes" };

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

    return { processed: true, dimension, rowsUpserted: rows.length };
  } catch (error) {
    const message = error instanceof MetaApiError ? `Meta: ${error.message}` : String(error);
    await updateJobProgress(job.id, { status: "failed", error: message });
    return { processed: true, error: message };
  }
}

function isExpiringSoon(expiresAt: Date | null): boolean {
  if (!expiresAt) return false;
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  return expiresAt.getTime() - Date.now() < sevenDaysMs;
}

export async function runTokenHealthCheck(): Promise<WorkerResult> {
  const supabase = createServiceRoleClient();
  const { data: tokens, error } = await supabase.from("meta_tokens").select("id, org_id, vault_secret_id");
  if (error) throw error;

  async function markDegraded(id: string, orgId: string, health: string) {
    await supabase.from("meta_tokens").update({ token_health: health }).eq("id", id);
    await supabase.from("ad_accounts").update({ status: "disconnected" }).eq("meta_token_id", id);
    await supabase.from("audit_log").insert({
      org_id: orgId,
      event: "meta_token_health_degraded",
      payload: { meta_token_id: id, health },
    });
  }

  const results = await Promise.allSettled(
    (tokens ?? []).map(async (row) => {
      const secret = await readSecret(row.vault_secret_id);
      if (!secret) {
        await markDegraded(row.id, row.org_id, "revoked");
        return { id: row.id, health: "revoked" as const };
      }

      const health = await validateToken(secret);
      const status = !health.isValid
        ? "invalid"
        : !hasMinimumScope(health.scopes)
          ? "invalid"
          : isExpiringSoon(health.expiresAt)
            ? "expiring"
            : "valid";

      await supabase
        .from("meta_tokens")
        .update({
          token_health: status,
          scopes: health.scopes,
          expires_at: health.expiresAt,
          last_validated_at: new Date().toISOString(),
        })
        .eq("id", row.id);

      if (status === "invalid") {
        await supabase.from("ad_accounts").update({ status: "disconnected" }).eq("meta_token_id", row.id);
      }

      return { id: row.id, health: status };
    }),
  );

  return {
    processed: true,
    checked: results.length,
    results: results.map((r) => (r.status === "fulfilled" ? r.value : { error: String(r.reason) })),
  };
}

const CHUNK_PROCESSORS: Record<
  Exclude<SyncJobKind, "token_health">,
  () => Promise<WorkerResult>
> = {
  sync_entities: processOneEntitiesChunk,
  sync_insights_daily: processOneInsightsDailyChunk,
  sync_insights_backfill: processOneBackfillChunk,
  sync_breakdowns: processOneBreakdownsChunk,
};

export const CHUNKED_JOB_KINDS = Object.keys(CHUNK_PROCESSORS) as Exclude<SyncJobKind, "token_health">[];

export async function processOneChunkOfKind(kind: Exclude<SyncJobKind, "token_health">): Promise<WorkerResult> {
  return CHUNK_PROCESSORS[kind]();
}
