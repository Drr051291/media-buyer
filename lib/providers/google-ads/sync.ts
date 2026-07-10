import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  claimNextJob,
  updateJobProgress,
  type SyncJobKind,
} from "@/lib/engine/sync-orchestrator";
import type { CanonicalLevel, ProviderInsightRow } from "@/lib/providers/ads-provider";
import { googleAdsProvider } from "./provider";
import { resolveGoogleAccount } from "./credentials";

/**
 * Workers de sync do Google Ads (ETAPA3GOOGLEADS BLOCO 5). Jobs fatiados e
 * retomáveis (PROJECT.md §3.2): 1 conta (ou 1 janela) por invocação, progresso
 * em sync_jobs.cursor, o orquestrador re-invoca até status='done'.
 *
 * Google REUSA sync_jobs (keyed por ad_account_id, que o Google tem) com kinds
 * próprios (google_*) — nunca cai nos workers do Meta.
 *
 * Regra anti-bug: a normalização de micros já foi feita no provider/gaql; aqui
 * só gravamos. CPA/ROAS derivados em código (mesma disciplina do Meta,
 * PROJECT.md §6.1) — o motor recalcula sobre o evento do business_context.
 */

const LEVELS: CanonicalLevel[] = ["campaign", "adset", "ad"];
// Janela de 7 dias no incremental: já re-busca os últimos dias, cobrindo o
// ajuste retroativo de conversões do Google (atribuição).
const INSIGHTS_WINDOW_DAYS = 7;
const BACKFILL_CHUNK_DAYS = 14;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function shiftIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function maxIso(a: string, b: string): string {
  return a >= b ? a : b;
}

interface WorkerResult {
  processed: boolean;
  [key: string]: unknown;
}

// Deriva ctr/cpm/cpc/cpa/roas das métricas base (mesmas fórmulas do rollup SQL).
function toMetricsRow(adAccountId: string, r: ProviderInsightRow) {
  const ctr = r.impressions > 0 ? (r.clicks / r.impressions) * 100 : null;
  const cpm = r.impressions > 0 ? (r.spend / r.impressions) * 1000 : null;
  const cpc = r.clicks > 0 ? r.spend / r.clicks : null;
  const cpa = r.conversions > 0 ? r.spend / r.conversions : null;
  const roas = r.spend > 0 ? r.conversionValue / r.spend : null;
  return {
    ad_account_id: adAccountId,
    entity_level: "ad" as const,
    entity_meta_id: r.externalId,
    date: r.date,
    breakdown_key: "all",
    provider: "google",
    spend: r.spend,
    impressions: r.impressions,
    reach: 0, // Google Ads não expõe reach/frequency no mesmo recorte do Meta
    frequency: null,
    clicks: r.clicks,
    link_clicks: r.clicks,
    ctr,
    cpm,
    cpc,
    conversions: r.conversions,
    conversion_value: r.conversionValue,
    cpa,
    roas,
    raw: r.raw,
    synced_at: new Date().toISOString(),
  };
}

async function upsertGoogleMetrics(adAccountId: string, rows: ProviderInsightRow[]): Promise<number> {
  if (rows.length === 0) return 0;
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("metrics_daily")
    .upsert(
      rows.map((r) => toMetricsRow(adAccountId, r)),
      { onConflict: "ad_account_id,entity_level,entity_meta_id,date,breakdown_key" },
    );
  if (error) throw error;
  return rows.length;
}

// ---------------------------------------------------------------------------
// Entidades — cursor por nível (campaign → adset → ad).
// ---------------------------------------------------------------------------
interface EntitiesCursor {
  levelIndex?: number;
}

export async function processOneGoogleEntitiesChunk(): Promise<WorkerResult> {
  const job = await claimNextJob("google_sync_entities");
  if (!job) return { processed: false, reason: "sem jobs pendentes" };

  try {
    const account = await resolveGoogleAccount(job.ad_account_id);
    const cursor = job.cursor as unknown as EntitiesCursor;
    const levelIndex = cursor.levelIndex ?? 0;
    const level = LEVELS[levelIndex];

    const entities = await googleAdsProvider.fetchEntities(account.refreshToken, account.customerId, level);

    const supabase = createServiceRoleClient();
    if (entities.length > 0) {
      const { error } = await supabase.from("entities").upsert(
        entities.map((e) => ({
          ad_account_id: job.ad_account_id,
          level: e.level,
          meta_id: e.externalId,
          parent_meta_id: e.parentExternalId,
          name: e.name,
          status: e.status,
          objective: e.objective,
          daily_budget: e.dailyBudget,
          targeting_summary: {},
          provider: "google",
          synced_at: new Date().toISOString(),
        })),
        { onConflict: "ad_account_id,level,meta_id" },
      );
      if (error) throw error;
    }

    if (levelIndex + 1 < LEVELS.length) {
      await updateJobProgress(job.id, { cursor: { levelIndex: levelIndex + 1 }, status: "pending" });
    } else {
      await updateJobProgress(job.id, { status: "done", finished_at: new Date().toISOString() });
    }

    return { processed: true, level, entitiesUpserted: entities.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateJobProgress(job.id, { status: "failed", error: message });
    return { processed: true, error: message };
  }
}

// ---------------------------------------------------------------------------
// Insights diários — últimos 7 dias (re-fetch cobre ajuste de atribuição).
// ---------------------------------------------------------------------------
export async function processOneGoogleInsightsDailyChunk(): Promise<WorkerResult> {
  const job = await claimNextJob("google_sync_insights_daily");
  if (!job) return { processed: false, reason: "sem jobs pendentes" };

  try {
    const account = await resolveGoogleAccount(job.ad_account_id);
    const end = todayIso();
    const start = shiftIso(end, -INSIGHTS_WINDOW_DAYS);
    const rows = await googleAdsProvider.fetchInsights(account.refreshToken, account.customerId, start, end);
    const written = await upsertGoogleMetrics(job.ad_account_id, rows);

    await updateJobProgress(job.id, { status: "done", finished_at: new Date().toISOString() });
    return { processed: true, rowsUpserted: written, window: { start, end } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateJobProgress(job.id, { status: "failed", error: message });
    return { processed: true, error: message };
  }
}

// ---------------------------------------------------------------------------
// Backfill 90d — janelas de 14 dias, retomável. Cursor no sync_jobs.
// ---------------------------------------------------------------------------
interface BackfillCursor {
  status?: "running" | "done";
  next_until?: string;
  floor?: string;
}

export async function processOneGoogleBackfillChunk(): Promise<WorkerResult> {
  const job = await claimNextJob("google_sync_backfill");
  if (!job) return { processed: false, reason: "sem jobs pendentes" };

  const cursor = job.cursor as unknown as BackfillCursor;

  try {
    if (!cursor.next_until || !cursor.floor) {
      // cursor não inicializado — nada a fazer, marca done defensivamente.
      await updateJobProgress(job.id, { status: "done", finished_at: new Date().toISOString() });
      return { processed: true, reason: "cursor_vazio" };
    }

    const account = await resolveGoogleAccount(job.ad_account_id);
    const end = cursor.next_until;
    const start = maxIso(cursor.floor, shiftIso(end, -(BACKFILL_CHUNK_DAYS - 1)));

    const rows = await googleAdsProvider.fetchInsights(account.refreshToken, account.customerId, start, end);
    const written = await upsertGoogleMetrics(job.ad_account_id, rows);

    const done = start <= cursor.floor;
    if (done) {
      await updateJobProgress(job.id, { status: "done", finished_at: new Date().toISOString() });
    } else {
      await updateJobProgress(job.id, {
        cursor: { ...cursor, status: "running", next_until: shiftIso(start, -1) },
        status: "pending",
      });
    }

    return { processed: true, rowsUpserted: written, window: { start, end }, done };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await updateJobProgress(job.id, { status: "failed", error: message });
    return { processed: true, error: message };
  }
}

const GOOGLE_JOB_KINDS: Extract<SyncJobKind, `google_${string}`>[] = [
  "google_sync_entities",
  "google_sync_insights_daily",
  "google_sync_backfill",
];

/** Enfileira o backfill inicial (chamado no fim do wizard / connect). */
export async function enqueueGoogleBackfill(adAccountId: string, days = 90): Promise<void> {
  const supabase = createServiceRoleClient();
  const end = todayIso();
  await supabase.from("sync_jobs").insert({
    ad_account_id: adAccountId,
    kind: "google_sync_backfill",
    status: "pending",
    cursor: { status: "running", next_until: end, floor: shiftIso(end, -days) },
  });
}

/** Enfileira o sync de entidades inicial (chamado no connect). */
export async function enqueueGoogleEntities(adAccountId: string): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase.from("sync_jobs").insert({
    ad_account_id: adAccountId,
    kind: "google_sync_entities",
    status: "pending",
    cursor: {},
  });
}

export const GOOGLE_CHUNK_PROCESSORS: Record<
  (typeof GOOGLE_JOB_KINDS)[number],
  () => Promise<WorkerResult>
> = {
  google_sync_entities: processOneGoogleEntitiesChunk,
  google_sync_insights_daily: processOneGoogleInsightsDailyChunk,
  google_sync_backfill: processOneGoogleBackfillChunk,
};

export const GOOGLE_CHUNKED_JOB_KINDS = GOOGLE_JOB_KINDS;
