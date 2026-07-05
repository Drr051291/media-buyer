import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { MetaClient, MetaApiError } from "@/lib/meta/client";
import { fetchEntitiesPage, type EntityLevel } from "@/lib/meta/entities";
import {
  enqueueMissingJobs,
  claimNextJob,
  updateJobProgress,
  resolveAdAccountForSync,
  requireCronSecret,
} from "@/lib/engine/sync-orchestrator";

const LEVEL_ORDER: EntityLevel[] = ["campaign", "adset", "ad"];
const FREQUENCY_HOURS = 6; // PROJECT.md 6.1: sync_entities roda 6/6h

interface EntitiesCursor {
  levelIndex?: number;
  after?: string;
}

/**
 * Worker do job sync_entities. Cada invocação processa UMA página de UM
 * nível (campaign|adset|ad) de UMA conta — nunca a estrutura inteira de
 * todas as contas (PROJECT.md 3.2).
 */
export async function GET(request: Request) {
  if (!requireCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await enqueueMissingJobs("sync_entities", FREQUENCY_HOURS);

  const job = await claimNextJob("sync_entities");
  if (!job) {
    return NextResponse.json({ processed: false, reason: "sem jobs pendentes" });
  }

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

    return NextResponse.json({ processed: true, level, entitiesUpserted: page.entities.length });
  } catch (error) {
    const message = error instanceof MetaApiError ? `Meta: ${error.message}` : String(error);
    await updateJobProgress(job.id, { status: "failed", error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
