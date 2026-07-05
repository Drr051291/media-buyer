import {
  sumMetrics,
  deriveMetrics,
  comparePeriods,
  type MetricRow,
  type DerivedMetrics,
} from "./period-comparison";

/**
 * Metric Engine — PROJECT.md secao 6.3. Roda 1x/dia por conta, em código
 * puro, sem LLM ("Regra de ouro: determinístico primeiro"). Recalcula
 * conversions/conversionValue a partir das actions brutas usando o EVENTO
 * REAL definido no Business Context — não mais o proxy genérico usado no
 * momento do sync (PROJECT.md 6.2: "CPA de R$60 é desastre ou excelente
 * dependendo do ticket e da margem").
 */

export interface RawActionsLike {
  actions?: { action_type: string; value: string }[];
  action_values?: { action_type: string; value: string }[];
}

export function extractEventMetrics(
  raw: RawActionsLike | null | undefined,
  eventType: string,
): { conversions: number; conversionValue: number } {
  if (!raw || !eventType) return { conversions: 0, conversionValue: 0 };

  const action = raw.actions?.find((a) => a.action_type === eventType);
  if (!action) return { conversions: 0, conversionValue: 0 };

  const value = raw.action_values?.find((a) => a.action_type === eventType);
  return { conversions: Number(action.value), conversionValue: value ? Number(value.value) : 0 };
}

/** Uma linha diária nível ad, pronta para o Metric Engine (reach incluso p/ frequência). */
export interface AdDailyRow extends MetricRow {
  reach: number;
}

/** Converte um dia bruto de insight (raw actions da Meta) para uma linha de métrica usando o evento real. */
export function toEngineRow(row: {
  date: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  raw: RawActionsLike;
}, eventType: string): AdDailyRow {
  const { conversions, conversionValue } = extractEventMetrics(row.raw, eventType);
  return {
    date: row.date,
    spend: row.spend,
    impressions: row.impressions,
    reach: row.reach,
    clicks: row.clicks,
    linkClicks: row.linkClicks,
    conversions,
    conversionValue,
  };
}

export interface EntityWindowSummary extends DerivedMetrics {
  reach: number;
  frequency: number | null;
  /** dias_de_dados — quantos dias distintos tiveram alguma linha na janela. */
  daysWithData: number;
}

/** Desloca uma data YYYY-MM-DD por N dias (negativo = passado). */
export function shiftIsoDate(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function filterWindow(rows: AdDailyRow[], asOfIso: string, days: number): AdDailyRow[] {
  const asOf = new Date(`${asOfIso}T00:00:00Z`);
  const start = new Date(asOf);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  return rows.filter((r) => {
    const d = new Date(`${r.date}T00:00:00Z`);
    return d >= start && d <= asOf;
  });
}

export function summarizeWindow(rows: AdDailyRow[]): EntityWindowSummary {
  const derived = deriveMetrics(sumMetrics(rows));
  const reach = rows.reduce((sum, r) => sum + r.reach, 0);
  const frequency = reach > 0 ? derived.impressions / reach : null;
  const daysWithData = new Set(rows.map((r) => r.date)).size;

  return { ...derived, reach, frequency, daysWithData };
}

export interface EntityMetrics {
  d3: EntityWindowSummary;
  d7: EntityWindowSummary;
  d14: EntityWindowSummary;
  d30: EntityWindowSummary;
  /** 14 dias imediatamente ANTERIORES à janela de 7d (não sobrepõe) — usado
   * por sinais que comparam "período atual vs período anterior" de fato,
   * como CREATIVE_FATIGUE ("CTR 7d caiu vs 14d anteriores"). */
  previous14d: EntityWindowSummary;
  /** 7d vs 7d anterior — spend, CPA, ROAS, CTR, CPM (PROJECT.md 6.3). */
  deltaPct7d: Record<keyof DerivedMetrics, number | null>;
  frequencyDeltaPct7d: number | null;
}

/** Métricas derivadas de UMA entidade nas janelas 3d/7d/14d/30d + deltas 7d vs 7d anterior. */
export function computeEntityMetrics(rows: AdDailyRow[], asOfIso: string): EntityMetrics {
  const d3 = summarizeWindow(filterWindow(rows, asOfIso, 3));
  const d7 = summarizeWindow(filterWindow(rows, asOfIso, 7));
  const d14 = summarizeWindow(filterWindow(rows, asOfIso, 14));
  const d30 = summarizeWindow(filterWindow(rows, asOfIso, 30));
  const previous14d = summarizeWindow(filterWindow(rows, shiftIsoDate(asOfIso, -7), 14));

  // "7d vs 7d anterior": janelas de 7 dias exatas, uma logo antes da outra —
  // não usar um corte único (rows antes de X), que agregaria mais de 7 dias.
  const currentRows = filterWindow(rows, asOfIso, 7);
  const previousWindowEnd = shiftIsoDate(asOfIso, -7);
  const previousRows = filterWindow(rows, previousWindowEnd, 7);
  const deltaPct7d = comparePeriods(currentRows, previousRows).deltaPct;

  const currentFreq = summarizeWindow(currentRows).frequency;
  const previousFreq = summarizeWindow(previousRows).frequency;
  const frequencyDeltaPct7d =
    currentFreq != null && previousFreq != null && previousFreq !== 0
      ? ((currentFreq - previousFreq) / previousFreq) * 100
      : null;

  return { d3, d7, d14, d30, previous14d, deltaPct7d, frequencyDeltaPct7d };
}

export interface EntityHierarchy {
  /** ad metaId -> adset metaId */
  adsetIdByAd: Map<string, string>;
  /** adset metaId -> campaign metaId */
  campaignIdByAdset: Map<string, string>;
}

/**
 * Agrega linhas nível ad para adset e campanha somando por dia (mesma
 * abordagem aditiva usada em aggregate_metrics_daily_for_account_date no
 * Postgres — reach agregado é uma aproximação aceita).
 */
export function rollUpToAdsetAndCampaign(
  adRows: Map<string, AdDailyRow[]>,
  hierarchy: EntityHierarchy,
): { adsetRows: Map<string, AdDailyRow[]>; campaignRows: Map<string, AdDailyRow[]> } {
  const adsetRows = new Map<string, AdDailyRow[]>();

  for (const [adId, rows] of adRows) {
    const adsetId = hierarchy.adsetIdByAd.get(adId);
    if (!adsetId) continue;
    const list = adsetRows.get(adsetId) ?? [];
    list.push(...rows);
    adsetRows.set(adsetId, list);
  }

  const campaignRows = new Map<string, AdDailyRow[]>();
  for (const [adsetId, rows] of adsetRows) {
    const campaignId = hierarchy.campaignIdByAdset.get(adsetId);
    if (!campaignId) continue;
    const list = campaignRows.get(campaignId) ?? [];
    list.push(...rows);
    campaignRows.set(campaignId, list);
  }

  return { adsetRows, campaignRows };
}

/** Share de spend da entidade sobre o spend do pai, na janela de 7d (concentração de budget). */
export function shareOfSpend(entitySpend7d: number, parentSpend7d: number): number | null {
  if (parentSpend7d <= 0) return null;
  return entitySpend7d / parentSpend7d;
}

/**
 * spend do dia > 2 desvios-padrão da média 30d (usado pelo detector
 * SPEND_ANOMALY). Amostra populacional simples (30 dias é a janela toda).
 */
export function isSpendAnomaly(dailySpend: number[], todaySpend: number): boolean {
  if (dailySpend.length === 0) return false;
  const mean = dailySpend.reduce((a, b) => a + b, 0) / dailySpend.length;
  const variance = dailySpend.reduce((sum, v) => sum + (v - mean) ** 2, 0) / dailySpend.length;
  const stdDev = Math.sqrt(variance);
  return Math.abs(todaySpend - mean) > 2 * stdDev;
}
