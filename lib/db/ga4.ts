import { createClient } from "@/lib/supabase/server";

/**
 * Leituras tipadas do GA4 (ETAPA2-GA4 BLOCO 7). Lê SEMPRE do Postgres
 * (ga4_metrics_daily), nunca da GA4 API em tempo real. Usa o cliente com a
 * sessão do usuário (respeita RLS por org).
 */

export interface Ga4Totals {
  sessions: number;
  engagedSessions: number;
  conversions: number;
  revenue: number;
  transactions: number;
  engagementRate: number | null;
}

export interface Ga4Breakdown {
  key: string;
  sessions: number;
  conversions: number;
  revenue: number;
}

export interface Ga4Overview {
  connected: boolean;
  totals: Ga4Totals;
  byDevice: Ga4Breakdown[];
  byLandingPage: Ga4Breakdown[];
  bySourceMedium: Ga4Breakdown[];
  topConvertingDevice: Ga4Breakdown | null;
}

interface Ga4MetricRow {
  date: string;
  device_category: string;
  landing_page: string;
  session_source: string;
  session_medium: string;
  sessions: number | string;
  engaged_sessions: number | string;
  conversions: number | string;
  purchase_revenue: number | string;
  transactions: number | string;
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function accumulate(map: Map<string, Ga4Breakdown>, key: string, row: Ga4MetricRow) {
  const entry = map.get(key) ?? { key, sessions: 0, conversions: 0, revenue: 0 };
  entry.sessions += Number(row.sessions);
  entry.conversions += Number(row.conversions);
  entry.revenue += Number(row.purchase_revenue);
  map.set(key, entry);
}

function topN(map: Map<string, Ga4Breakdown>, n: number, by: "conversions" | "sessions" = "sessions") {
  return Array.from(map.values())
    .sort((a, b) => b[by] - a[by])
    .slice(0, n);
}

/**
 * Visão consolidada do GA4 para uma ad_account (via a connection vinculada) ou,
 * se não houver vínculo, para toda a org. Janela em dias (default 28).
 */
export async function getGa4Overview(adAccountId: string, windowDays = 28): Promise<Ga4Overview> {
  const supabase = await createClient();
  const since = isoDaysAgo(windowDays);

  // Só há GA4 relevante para esta conta se existir connection vinculada OU
  // uma connection GA4 da org sem vínculo específico (fallback).
  let query = supabase
    .from("ga4_metrics_daily")
    .select(
      "date, device_category, landing_page, session_source, session_medium, sessions, engaged_sessions, conversions, purchase_revenue, transactions",
    )
    .gte("date", since);

  // Prioriza o vínculo direto com a ad_account.
  const { data: linked } = await supabase
    .from("connections")
    .select("id")
    .eq("connector_id", "ga4")
    .eq("ad_account_id", adAccountId)
    .maybeSingle();

  if (linked) {
    query = query.eq("ad_account_id", adAccountId);
  }
  // Sem vínculo: RLS já limita à org do usuário; mostramos o GA4 da org.

  const { data } = await query;
  const rows = (data ?? []) as Ga4MetricRow[];

  const empty: Ga4Overview = {
    connected: false,
    totals: {
      sessions: 0,
      engagedSessions: 0,
      conversions: 0,
      revenue: 0,
      transactions: 0,
      engagementRate: null,
    },
    byDevice: [],
    byLandingPage: [],
    bySourceMedium: [],
    topConvertingDevice: null,
  };
  if (rows.length === 0) return empty;

  const totals: Ga4Totals = {
    sessions: 0,
    engagedSessions: 0,
    conversions: 0,
    revenue: 0,
    transactions: 0,
    engagementRate: null,
  };
  const device = new Map<string, Ga4Breakdown>();
  const landing = new Map<string, Ga4Breakdown>();
  const sourceMedium = new Map<string, Ga4Breakdown>();

  for (const row of rows) {
    totals.sessions += Number(row.sessions);
    totals.engagedSessions += Number(row.engaged_sessions);
    totals.conversions += Number(row.conversions);
    totals.revenue += Number(row.purchase_revenue);
    totals.transactions += Number(row.transactions);
    accumulate(device, row.device_category, row);
    accumulate(landing, row.landing_page, row);
    accumulate(sourceMedium, `${row.session_source} / ${row.session_medium}`, row);
  }
  totals.engagementRate = totals.sessions > 0 ? totals.engagedSessions / totals.sessions : null;

  const byDevice = topN(device, 10, "sessions");
  const topConvertingDevice = topN(device, 1, "conversions")[0] ?? null;

  return {
    connected: true,
    totals,
    byDevice,
    byLandingPage: topN(landing, 8, "sessions"),
    bySourceMedium: topN(sourceMedium, 8, "sessions"),
    topConvertingDevice,
  };
}
