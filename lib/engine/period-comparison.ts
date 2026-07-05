/**
 * Agregação de métricas e comparação de período (7d vs 7d anterior).
 * Pura e testável — sem I/O. O dashboard busca as linhas diárias do Postgres
 * e passa para cá; nunca calcula CPA/CTR/CPM/ROAS "no olho" na UI.
 */

export interface MetricRow {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  conversions: number;
  conversionValue: number;
}

export interface MetricTotals {
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  conversions: number;
  conversionValue: number;
}

export interface DerivedMetrics extends MetricTotals {
  ctr: number | null;
  cpm: number | null;
  cpc: number | null;
  cpa: number | null;
  roas: number | null;
}

const ZERO_TOTALS: MetricTotals = {
  spend: 0,
  impressions: 0,
  clicks: 0,
  linkClicks: 0,
  conversions: 0,
  conversionValue: 0,
};

export function sumMetrics(rows: MetricRow[]): MetricTotals {
  return rows.reduce<MetricTotals>(
    (acc, r) => ({
      spend: acc.spend + r.spend,
      impressions: acc.impressions + r.impressions,
      clicks: acc.clicks + r.clicks,
      linkClicks: acc.linkClicks + r.linkClicks,
      conversions: acc.conversions + r.conversions,
      conversionValue: acc.conversionValue + r.conversionValue,
    }),
    { ...ZERO_TOTALS },
  );
}

export function deriveMetrics(totals: MetricTotals): DerivedMetrics {
  return {
    ...totals,
    ctr: totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : null,
    cpm: totals.impressions > 0 ? (totals.spend / totals.impressions) * 1000 : null,
    cpc: totals.clicks > 0 ? totals.spend / totals.clicks : null,
    cpa: totals.conversions > 0 ? totals.spend / totals.conversions : null,
    roas: totals.spend > 0 && totals.conversionValue > 0 ? totals.conversionValue / totals.spend : null,
  };
}

/** Delta percentual current vs previous; null quando não há base de comparação. */
export function deltaPct(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

export interface PeriodComparison {
  current: DerivedMetrics;
  previous: DerivedMetrics;
  deltaPct: Record<keyof DerivedMetrics, number | null>;
}

const DERIVED_KEYS: (keyof DerivedMetrics)[] = [
  "spend",
  "impressions",
  "clicks",
  "linkClicks",
  "conversions",
  "conversionValue",
  "ctr",
  "cpm",
  "cpc",
  "cpa",
  "roas",
];

export function comparePeriods(currentRows: MetricRow[], previousRows: MetricRow[]): PeriodComparison {
  const current = deriveMetrics(sumMetrics(currentRows));
  const previous = deriveMetrics(sumMetrics(previousRows));

  const deltas = {} as Record<keyof DerivedMetrics, number | null>;
  for (const key of DERIVED_KEYS) {
    deltas[key] = deltaPct(current[key], previous[key]);
  }

  return { current, previous, deltaPct: deltas };
}

/** Divide uma janela de `windowDays*2` dias em [anterior, atual], por data (YYYY-MM-DD). */
export function splitByPeriod(
  rows: MetricRow[],
  todayIso: string,
  windowDays: number,
): { currentRows: MetricRow[]; previousRows: MetricRow[] } {
  const today = new Date(`${todayIso}T00:00:00Z`);
  const currentStart = new Date(today);
  currentStart.setUTCDate(currentStart.getUTCDate() - (windowDays - 1));

  const currentRows: MetricRow[] = [];
  const previousRows: MetricRow[] = [];

  for (const row of rows) {
    const d = new Date(`${row.date}T00:00:00Z`);
    if (d >= currentStart && d <= today) currentRows.push(row);
    else if (d < currentStart) previousRows.push(row);
  }

  return { currentRows, previousRows };
}
