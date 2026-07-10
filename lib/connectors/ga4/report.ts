/**
 * Montagem e normalizacao do `runReport` do GA4 (ETAPA2-GA4 BLOCO 5).
 *
 * Funcoes PURAS (sem I/O) para serem testaveis — a chamada de rede fica em
 * connector.pull(). Regras anti-bug centrais aqui:
 * - dimensao vazia -> '(not set)', NUNCA NULL (senao o UNIQUE do BLOCO 1
 *   quebra: Postgres trata NULL como distinto).
 * - `date` do GA4 vem como 'YYYYMMDD' -> normaliza para 'YYYY-MM-DD'.
 */

/** Dimensoes pedidas — cobrem source/medium/campaign/landing/device por dia. */
export const GA4_DIMENSIONS = [
  "date",
  "sessionSource",
  "sessionMedium",
  "sessionCampaignName",
  "landingPage",
  "deviceCategory",
] as const;

/** Metricas pedidas — sessoes/engajamento/conversoes/receita. */
export const GA4_METRICS = [
  "sessions",
  "engagedSessions",
  "engagementRate",
  "conversions",
  "eventCount",
  "purchaseRevenue",
  "transactions",
] as const;

export const GA4_PAGE_SIZE = 100_000; // limite maximo do runReport por request

const NOT_SET = "(not set)";

/** Linha normalizada, pronta para virar row de `ga4_metrics_daily`. */
export interface Ga4NormalizedRow {
  date: string; // 'YYYY-MM-DD'
  session_source: string;
  session_medium: string;
  session_campaign: string;
  landing_page: string;
  device_category: string;
  sessions: number;
  engaged_sessions: number;
  engagement_rate: number | null;
  conversions: number;
  event_count: number;
  purchase_revenue: number;
  transactions: number;
}

/** Shapes minimos do SDK (@google-analytics/data) que consumimos. */
interface HeaderLike {
  name?: string | null;
}
interface DimensionValueLike {
  value?: string | null;
}
interface MetricValueLike {
  value?: string | null;
}
export interface RunReportRowLike {
  dimensionValues?: DimensionValueLike[] | null;
  metricValues?: MetricValueLike[] | null;
}
export interface RunReportResponseLike {
  dimensionHeaders?: HeaderLike[] | null;
  metricHeaders?: HeaderLike[] | null;
  rows?: RunReportRowLike[] | null;
  rowCount?: number | null;
}

/** Monta o request do runReport para uma janela de datas + paginacao. */
export function buildRunReportRequest(params: {
  propertyId: string;
  startDate: string; // 'YYYY-MM-DD'
  endDate: string; // 'YYYY-MM-DD'
  offset?: number;
  limit?: number;
}) {
  return {
    property: params.propertyId,
    dateRanges: [{ startDate: params.startDate, endDate: params.endDate }],
    dimensions: GA4_DIMENSIONS.map((name) => ({ name })),
    metrics: GA4_METRICS.map((name) => ({ name })),
    limit: params.limit ?? GA4_PAGE_SIZE,
    offset: params.offset ?? 0,
    // keepEmptyRows=false (default) evita puxar linhas totalmente vazias.
    returnPropertyQuota: true,
  };
}

function dim(value: string | null | undefined): string {
  const v = (value ?? "").trim();
  return v.length === 0 ? NOT_SET : v;
}

function numMetric(value: string | null | undefined): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function nullableMetric(value: string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** 'YYYYMMDD' (formato do GA4) -> 'YYYY-MM-DD'. Passa 'YYYY-MM-DD' inalterado. */
export function normalizeGa4Date(raw: string | null | undefined): string {
  const v = (raw ?? "").trim();
  if (/^\d{8}$/.test(v)) return `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
  return v;
}

/**
 * Converte a resposta do runReport em linhas normalizadas, mapeando por NOME
 * de header (robusto a reordenacao do SDK), com fallback '(not set)'.
 */
export function normalizeReport(response: RunReportResponseLike): Ga4NormalizedRow[] {
  const dimNames = (response.dimensionHeaders ?? []).map((h) => h?.name ?? "");
  const metricNames = (response.metricHeaders ?? []).map((h) => h?.name ?? "");
  const rows = response.rows ?? [];

  return rows.map((row) => {
    const d: Record<string, string | undefined> = {};
    dimNames.forEach((name, i) => {
      d[name] = row.dimensionValues?.[i]?.value ?? undefined;
    });
    const m: Record<string, string | undefined> = {};
    metricNames.forEach((name, i) => {
      m[name] = row.metricValues?.[i]?.value ?? undefined;
    });

    return {
      date: normalizeGa4Date(d.date),
      session_source: dim(d.sessionSource),
      session_medium: dim(d.sessionMedium),
      session_campaign: dim(d.sessionCampaignName),
      landing_page: dim(d.landingPage),
      device_category: dim(d.deviceCategory),
      sessions: numMetric(m.sessions),
      engaged_sessions: numMetric(m.engagedSessions),
      engagement_rate: nullableMetric(m.engagementRate),
      conversions: numMetric(m.conversions),
      event_count: numMetric(m.eventCount),
      purchase_revenue: numMetric(m.purchaseRevenue),
      transactions: numMetric(m.transactions),
    };
  });
}
