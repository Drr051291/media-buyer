import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  computeEntityMetrics,
  filterWindow,
  rollUpToAdsetAndCampaign,
  shareOfSpend,
  shiftIsoDate,
  summarizeWindow,
  toEngineRow,
  type AdDailyRow,
  type EntityHierarchy,
  type EntityWindowSummary,
  type RawActionsLike,
} from "./metrics";
import { runSignalScan, type Signal } from "./signals";
import type { EntityLevel, EntityRef } from "./signals/types";
import type { DailyAnalysisOutput } from "./reasoner";

const SNAPSHOT_WINDOW_DAYS = 30;
const DEFAULT_CONVERSION_EVENT = "purchase";

interface CompactWindow {
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number | null;
  cpm: number | null;
  cpc: number | null;
  cpa: number | null;
  roas: number | null;
  frequency: number | null;
  days_with_data: number;
}

export interface SnapshotEntityEntry {
  level: EntityLevel;
  meta_id: string;
  name: string;
  status: string | null;
  windows: { d3: CompactWindow; d7: CompactWindow; d14: CompactWindow; d30: CompactWindow };
  delta_7d_pct: Record<string, number | null>;
  share_of_parent_spend_7d: number | null;
  signals: Signal[];
}

export interface AccountSnapshotPayload {
  date: string;
  currency: string;
  business_context_configured: boolean;
  conversion_event: string;
  entities: SnapshotEntityEntry[];
}

function round2(n: number | null): number | null {
  return n == null ? null : Math.round(n * 100) / 100;
}

function toCompactWindow(w: EntityWindowSummary): CompactWindow {
  return {
    spend: round2(w.spend) ?? 0,
    impressions: w.impressions,
    clicks: w.clicks,
    conversions: w.conversions,
    ctr: round2(w.ctr),
    cpm: round2(w.cpm),
    cpc: round2(w.cpc),
    cpa: round2(w.cpa),
    roas: round2(w.roas),
    frequency: round2(w.frequency),
    days_with_data: w.daysWithData,
  };
}

interface EntityRow {
  level: EntityLevel;
  meta_id: string;
  parent_meta_id: string | null;
  name: string;
  status: string | null;
}

/**
 * Monta o Account Snapshot (PROJECT.md 6.3): busca 30 dias de insights nível
 * ad, recalcula conversões pelo evento REAL do Business Context, agrega
 * para adset/campanha e roda os 6 detectores de sinais. Só entidades com
 * spend ou sinal entram no payload final (teto de tokens para o Reasoner).
 */
export async function buildAccountSnapshot(adAccountId: string, asOfIso: string): Promise<AccountSnapshotPayload> {
  const supabase = createServiceRoleClient();

  const [{ data: account, error: accountError }, { data: context }, { data: entities }, { data: metricsRows }] =
    await Promise.all([
      supabase.from("ad_accounts").select("id, currency").eq("id", adAccountId).single(),
      supabase
        .from("business_context")
        .select("objetivo_principal, cpa_alvo, cpa_maximo, business_model")
        .eq("ad_account_id", adAccountId)
        .maybeSingle(),
      supabase.from("entities").select("level, meta_id, parent_meta_id, name, status").eq("ad_account_id", adAccountId),
      supabase
        .from("metrics_daily")
        .select("entity_meta_id, date, spend, impressions, reach, clicks, link_clicks, raw")
        .eq("ad_account_id", adAccountId)
        .eq("entity_level", "ad")
        .eq("breakdown_key", "all")
        .gte("date", shiftIsoDate(asOfIso, -(SNAPSHOT_WINDOW_DAYS - 1)))
        .lte("date", asOfIso),
    ]);

  if (accountError || !account) throw new Error("Conta não encontrada para snapshot");

  const eventType = context?.objetivo_principal || DEFAULT_CONVERSION_EVENT;
  const cpaAlvo = context?.cpa_alvo ?? null;
  const cpaMaximo = context?.cpa_maximo ?? null;
  const businessModel = context?.business_model ?? null;

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

  const allEntities = (entities ?? []) as EntityRow[];
  const adEntities = allEntities.filter((e) => e.level === "ad");
  const adsetEntities = allEntities.filter((e) => e.level === "adset");
  const campaignEntities = allEntities.filter((e) => e.level === "campaign");

  const hierarchy: EntityHierarchy = {
    adsetIdByAd: new Map(
      adEntities.filter((e) => e.parent_meta_id).map((e) => [e.meta_id, e.parent_meta_id as string]),
    ),
    campaignIdByAdset: new Map(
      adsetEntities.filter((e) => e.parent_meta_id).map((e) => [e.meta_id, e.parent_meta_id as string]),
    ),
  };

  const { adsetRows, campaignRows } = rollUpToAdsetAndCampaign(adRowsMap, hierarchy);

  const campaignSpend7dByMetaId = new Map<string, number>();
  for (const [campaignId, rows] of campaignRows) {
    campaignSpend7dByMetaId.set(campaignId, summarizeWindow(filterWindow(rows, asOfIso, 7)).spend);
  }

  const entries: SnapshotEntityEntry[] = [];

  function processLevel(level: EntityLevel, ents: EntityRow[], rowsByMetaId: Map<string, AdDailyRow[]>) {
    for (const ent of ents) {
      const rows = rowsByMetaId.get(ent.meta_id) ?? [];
      if (rows.length === 0) continue;

      const metrics = computeEntityMetrics(rows, asOfIso);
      const entityRef: EntityRef = { level, metaId: ent.meta_id, name: ent.name };

      let shareOfParentSpend7d: number | null = null;
      if (level === "adset" && ent.parent_meta_id) {
        const parentSpend = campaignSpend7dByMetaId.get(ent.parent_meta_id) ?? null;
        shareOfParentSpend7d = parentSpend != null ? shareOfSpend(metrics.d7.spend, parentSpend) : null;
      }

      const signals = runSignalScan({
        entity: entityRef,
        metrics,
        dailyRows: rows,
        asOfIso,
        entityStatus: ent.status,
        businessModel,
        cpaAlvo,
        cpaMaximo,
        shareOfParentSpend7d,
      });

      if (metrics.d7.spend <= 0 && signals.length === 0) continue;

      entries.push({
        level,
        meta_id: ent.meta_id,
        name: ent.name,
        status: ent.status,
        windows: {
          d3: toCompactWindow(metrics.d3),
          d7: toCompactWindow(metrics.d7),
          d14: toCompactWindow(metrics.d14),
          d30: toCompactWindow(metrics.d30),
        },
        delta_7d_pct: {
          spend: round2(metrics.deltaPct7d.spend),
          ctr: round2(metrics.deltaPct7d.ctr),
          cpm: round2(metrics.deltaPct7d.cpm),
          cpa: round2(metrics.deltaPct7d.cpa),
          roas: round2(metrics.deltaPct7d.roas),
          frequency: round2(metrics.frequencyDeltaPct7d),
        },
        share_of_parent_spend_7d: round2(shareOfParentSpend7d),
        signals,
      });
    }
  }

  processLevel("campaign", campaignEntities, campaignRows);
  processLevel("adset", adsetEntities, adsetRows);
  processLevel("ad", adEntities, adRowsMap);

  return {
    date: asOfIso,
    currency: account.currency,
    business_context_configured: !!context?.objetivo_principal,
    conversion_event: eventType,
    entities: entries,
  };
}

export interface SnapshotAnalysisResult {
  diagnosis: string;
  healthScore: number;
  proposedActions: DailyAnalysisOutput["proposed_actions"];
  model: string;
}

export interface SnapshotInsightInput {
  entity_ref: unknown;
  finding: string;
  evidence: string[];
  severity: string;
}

/**
 * Grava o snapshot do dia (upsert por ad_account_id+date) já com o
 * resultado do Reasoner, e normaliza os insights validados em linhas
 * próprias na tabela `insights` (PROJECT.md 7).
 */
export async function saveSnapshotWithAnalysis(
  adAccountId: string,
  asOfIso: string,
  payload: AccountSnapshotPayload,
  analysis: SnapshotAnalysisResult,
  insights: SnapshotInsightInput[],
): Promise<string> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("snapshots")
    .upsert(
      {
        ad_account_id: adAccountId,
        date: asOfIso,
        payload,
        diagnosis: analysis.diagnosis,
        health_score: Math.round(analysis.healthScore),
        proposed_actions: analysis.proposedActions,
        llm_model: analysis.model,
      },
      { onConflict: "ad_account_id,date" },
    )
    .select("id")
    .single();

  if (error || !data) throw error ?? new Error("Falha ao salvar snapshot");
  const snapshotId = data.id as string;

  const { error: deleteError } = await supabase.from("insights").delete().eq("snapshot_id", snapshotId);
  if (deleteError) throw deleteError;

  if (insights.length > 0) {
    const { error: insightsError } = await supabase.from("insights").insert(
      insights.map((i) => ({
        ad_account_id: adAccountId,
        snapshot_id: snapshotId,
        entity_ref: i.entity_ref,
        finding: i.finding,
        evidence: i.evidence,
        severity: i.severity,
      })),
    );
    if (insightsError) throw insightsError;
  }

  if (analysis.proposedActions.length > 0) {
    // idempotency_key evita reproposta duplicada da mesma ação todo dia
    // enquanto ela seguir pendente. Ações já decididas pelo gestor (approved/
    // rejected/executed/...) NUNCA são sobrescritas pelo upsert — só as que
    // ainda estão 'proposed' (ou que ainda não existem).
    const withKeys = analysis.proposedActions.map((a) => ({
      ...a,
      idempotencyKey: `${adAccountId}:${asOfIso}:${a.type}:${a.entity_ref.id}`,
    }));

    const { data: existing } = await supabase
      .from("actions")
      .select("idempotency_key, status")
      .in(
        "idempotency_key",
        withKeys.map((a) => a.idempotencyKey),
      );

    const decidedKeys = new Set(
      (existing ?? []).filter((e) => e.status !== "proposed").map((e) => e.idempotency_key),
    );
    const toUpsert = withKeys.filter((a) => !decidedKeys.has(a.idempotencyKey));

    if (toUpsert.length > 0) {
      const { error: actionsError } = await supabase.from("actions").upsert(
        toUpsert.map((a) => ({
          ad_account_id: adAccountId,
          snapshot_id: snapshotId,
          type: a.type,
          entity_ref: a.entity_ref,
          params: a.params,
          reasoning: a.reasoning,
          expected_impact: a.expected_impact,
          risk: a.risk,
          priority: a.priority,
          status: "proposed",
          idempotency_key: a.idempotencyKey,
        })),
        { onConflict: "idempotency_key" },
      );
      if (actionsError) throw actionsError;
    }
  }

  return snapshotId;
}
