import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  rollUpToAdsetAndCampaign,
  shiftIsoDate,
  summarizeWindow,
  toEngineRow,
  type AdDailyRow,
  type EntityHierarchy,
  type RawActionsLike,
} from "./metrics";
import type { EntityLevel } from "./signals/types";

/**
 * Medição de resultado (PROJECT.md 6.5): snapshot da métrica-alvo (CPA, no
 * evento real do Business Context) no D0 (véspera da execução) e no D+4/D+7,
 * uma linha por action executada em `action_results`. O delta vira memória
 * do agente (lib/engine/memory.ts).
 */

const DEFAULT_CONVERSION_EVENT = "purchase";
const CPA_WINDOW_DAYS = 7;
const IMPROVED_THRESHOLD_PCT = -10;
const WORSENED_THRESHOLD_PCT = 10;

interface EntityRow {
  level: EntityLevel;
  meta_id: string;
  parent_meta_id: string | null;
}

/** CPA médio de uma entidade nos 7 dias terminando em asOfIso, no evento real da conta. */
export async function computeCpaAsOf(
  adAccountId: string,
  entityLevel: EntityLevel,
  entityMetaId: string,
  asOfIso: string,
): Promise<number | null> {
  const supabase = createServiceRoleClient();

  const [{ data: context }, { data: entities }, { data: metricsRows }] = await Promise.all([
    supabase.from("business_context").select("objetivo_principal").eq("ad_account_id", adAccountId).maybeSingle(),
    supabase.from("entities").select("level, meta_id, parent_meta_id").eq("ad_account_id", adAccountId),
    supabase
      .from("metrics_daily")
      .select("entity_meta_id, date, spend, impressions, reach, clicks, link_clicks, raw")
      .eq("ad_account_id", adAccountId)
      .eq("entity_level", "ad")
      .eq("breakdown_key", "all")
      .gte("date", shiftIsoDate(asOfIso, -(CPA_WINDOW_DAYS - 1)))
      .lte("date", asOfIso),
  ]);

  const eventType = context?.objetivo_principal || DEFAULT_CONVERSION_EVENT;

  const adRowsMap = new Map<string, AdDailyRow[]>();
  for (const row of metricsRows ?? []) {
    const engineRow = toEngineRow(
      {
        date: row.date,
        spend: Number(row.spend),
        impressions: Number(row.impressions),
        reach: Number(row.reach),
        clicks: Number(row.clicks),
        linkClicks: Number(row.link_clicks),
        raw: (row.raw ?? {}) as RawActionsLike,
      },
      eventType,
    );
    const list = adRowsMap.get(row.entity_meta_id) ?? [];
    list.push(engineRow);
    adRowsMap.set(row.entity_meta_id, list);
  }

  let rows: AdDailyRow[] | undefined;

  if (entityLevel === "ad") {
    rows = adRowsMap.get(entityMetaId);
  } else {
    const allEntities = (entities ?? []) as EntityRow[];
    const hierarchy: EntityHierarchy = {
      adsetIdByAd: new Map(
        allEntities.filter((e) => e.level === "ad" && e.parent_meta_id).map((e) => [e.meta_id, e.parent_meta_id as string]),
      ),
      campaignIdByAdset: new Map(
        allEntities
          .filter((e) => e.level === "adset" && e.parent_meta_id)
          .map((e) => [e.meta_id, e.parent_meta_id as string]),
      ),
    };
    const { adsetRows, campaignRows } = rollUpToAdsetAndCampaign(adRowsMap, hierarchy);
    rows = entityLevel === "adset" ? adsetRows.get(entityMetaId) : campaignRows.get(entityMetaId);
  }

  if (!rows || rows.length === 0) return null;
  return summarizeWindow(rows).cpa;
}

export function verdictFor(
  baseline: number | null,
  current: number | null,
): { deltaPct: number | null; verdict: string | null } {
  if (baseline == null || current == null || baseline === 0) return { deltaPct: null, verdict: null };
  const deltaPct = ((current - baseline) / baseline) * 100;
  const verdict = deltaPct <= IMPROVED_THRESHOLD_PCT ? "improved" : deltaPct >= WORSENED_THRESHOLD_PCT ? "worsened" : "neutral";
  return { deltaPct, verdict };
}

interface ActionForMeasurement {
  id: string;
  entity_ref: { level: EntityLevel; id: string; name: string };
  executed_at: string;
}

interface ExistingResultRow {
  action_id: string;
  baseline_value: number | null;
  d4_value: number | null;
  d7_value: number | null;
}

/**
 * Avalia todas as actions executadas de uma conta que ainda precisam de
 * medição (baseline, D+4 ou D+7 pendentes) e grava/atualiza `action_results`.
 * Roda 1x por invocação do job `measure_action_results` (uma conta inteira
 * por chunk, como daily_analysis — o volume de actions executadas é baixo).
 */
export async function measurePendingActionResults(adAccountId: string): Promise<{ measured: number }> {
  const supabase = createServiceRoleClient();

  const { data: executedActions } = await supabase
    .from("actions")
    .select("id, entity_ref, executed_at")
    .eq("ad_account_id", adAccountId)
    .eq("status", "executed")
    .not("executed_at", "is", null);

  const actions = (executedActions ?? []) as ActionForMeasurement[];
  if (actions.length === 0) return { measured: 0 };

  const actionIds = actions.map((a) => a.id);
  const { data: existingRows } = await supabase
    .from("action_results")
    .select("action_id, baseline_value, d4_value, d7_value")
    .in("action_id", actionIds);

  const existingByActionId = new Map((existingRows ?? []).map((r) => [r.action_id as string, r as ExistingResultRow]));
  const todayIso = new Date().toISOString().slice(0, 10);
  let measured = 0;

  for (const action of actions) {
    const executedDateIso = action.executed_at.slice(0, 10);
    const existing = existingByActionId.get(action.id) ?? null;

    if (existing?.d7_value != null) continue; // já mediu tudo que precisava

    const needsBaseline = existing == null;
    const needsD4 = existing?.d4_value == null && todayIso >= shiftIsoDate(executedDateIso, 4);
    const needsD7 = existing?.d7_value == null && todayIso >= shiftIsoDate(executedDateIso, 7);

    if (!needsBaseline && !needsD4 && !needsD7) continue;

    const baselineValue = needsBaseline
      ? await computeCpaAsOf(adAccountId, action.entity_ref.level, action.entity_ref.id, shiftIsoDate(executedDateIso, -1))
      : existing!.baseline_value;

    const d4Value = needsD4
      ? await computeCpaAsOf(adAccountId, action.entity_ref.level, action.entity_ref.id, shiftIsoDate(executedDateIso, 4))
      : (existing?.d4_value ?? null);

    const d7Value = needsD7
      ? await computeCpaAsOf(adAccountId, action.entity_ref.level, action.entity_ref.id, shiftIsoDate(executedDateIso, 7))
      : (existing?.d7_value ?? null);

    const { deltaPct, verdict } = verdictFor(baselineValue, d7Value ?? d4Value);

    await supabase.from("action_results").upsert(
      {
        action_id: action.id,
        metric: "cpa",
        baseline_value: baselineValue,
        d4_value: d4Value,
        d7_value: d7Value,
        delta_pct: deltaPct,
        verdict,
        measured_at: new Date().toISOString(),
      },
      { onConflict: "action_id" },
    );

    measured++;
  }

  return { measured };
}
