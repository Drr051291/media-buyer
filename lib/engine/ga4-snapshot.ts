import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { shiftIsoDate } from "./metrics";

/**
 * Seção GA4 do Account Snapshot (bridge da Onda 2.1 para o Intelligence
 * Engine). O objetivo do produto é CRUZAR dados de comportamento (GA4) com o
 * gasto de mídia (Meta) para embasar a compra de mídia. O motor continua
 * determinístico: aqui só agregamos ga4_metrics_daily e derivamos observações
 * factuais (share de sessão vs share de conversão por device/origem). O LLM
 * recebe isso pronto e nunca recalcula.
 *
 * Regra de ouro mantida: o LLM não calcula números — este código monta o JSON.
 */

const GA4_WINDOW_DAYS = 30;
const MIN_SESSIONS_FOR_SIGNAL = 50; // evita conclusão sobre volume irrelevante

export interface Ga4BreakdownEntry {
  key: string;
  sessions: number;
  conversions: number;
  revenue: number;
  conv_rate: number | null; // conversions / sessions
  session_share: number | null;
  conversion_share: number | null;
}

export interface Ga4SnapshotSection {
  window_days: number;
  property_id: string;
  linked: boolean; // true = conexão vinculada a esta ad_account; false = GA4 da org sem vínculo direto
  totals: {
    sessions: number;
    conversions: number;
    revenue: number;
    engagement_rate: number | null;
  };
  best_converting_device: string | null;
  by_device: Ga4BreakdownEntry[];
  by_source_medium: Ga4BreakdownEntry[];
  top_landing_pages: Ga4BreakdownEntry[];
  observations: string[];
}

interface Ga4Row {
  device_category: string;
  landing_page: string;
  session_source: string;
  session_medium: string;
  sessions: number | string;
  engaged_sessions: number | string;
  conversions: number | string;
  purchase_revenue: number | string;
}

function round2(n: number | null): number | null {
  return n == null ? null : Math.round(n * 100) / 100;
}

function accumulate(map: Map<string, { sessions: number; conversions: number; revenue: number }>, key: string, row: Ga4Row) {
  const e = map.get(key) ?? { sessions: 0, conversions: 0, revenue: 0 };
  e.sessions += Number(row.sessions);
  e.conversions += Number(row.conversions);
  e.revenue += Number(row.purchase_revenue);
  map.set(key, e);
}

function toEntries(
  map: Map<string, { sessions: number; conversions: number; revenue: number }>,
  totalSessions: number,
  totalConversions: number,
  limit: number,
): Ga4BreakdownEntry[] {
  return Array.from(map.entries())
    .map(([key, v]) => ({
      key,
      sessions: v.sessions,
      conversions: round2(v.conversions) ?? 0,
      revenue: round2(v.revenue) ?? 0,
      conv_rate: v.sessions > 0 ? round2(v.conversions / v.sessions) : null,
      session_share: totalSessions > 0 ? round2(v.sessions / totalSessions) : null,
      conversion_share: totalConversions > 0 ? round2(v.conversions / totalConversions) : null,
    }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, limit);
}

/**
 * Resolve qual conexão GA4 alimenta o snapshot desta ad_account:
 * 1) conexão vinculada diretamente (ad_account_id === adAccountId); senão
 * 2) a única conexão GA4 da org (mapeamento inequívoco). Caso contrário, null.
 */
async function resolveGa4Connection(adAccountId: string, orgId: string) {
  const supabase = createServiceRoleClient();
  const { data: linked } = await supabase
    .from("connections")
    .select("id, ga4_property_id")
    .eq("connector_id", "ga4")
    .eq("status", "active")
    .eq("ad_account_id", adAccountId)
    .not("ga4_property_id", "is", null)
    .maybeSingle();
  if (linked) return { id: linked.id as string, propertyId: linked.ga4_property_id as string, linked: true };

  const { data: orgConns } = await supabase
    .from("connections")
    .select("id, ga4_property_id")
    .eq("connector_id", "ga4")
    .eq("status", "active")
    .eq("org_id", orgId)
    .not("ga4_property_id", "is", null);
  if (orgConns && orgConns.length === 1) {
    return { id: orgConns[0].id as string, propertyId: orgConns[0].ga4_property_id as string, linked: false };
  }
  return null;
}

export async function buildGa4SnapshotSection(
  adAccountId: string,
  orgId: string,
  asOfIso: string,
): Promise<Ga4SnapshotSection | null> {
  const conn = await resolveGa4Connection(adAccountId, orgId);
  if (!conn) return null;

  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("ga4_metrics_daily")
    .select(
      "device_category, landing_page, session_source, session_medium, sessions, engaged_sessions, conversions, purchase_revenue",
    )
    .eq("connection_id", conn.id)
    .gte("date", shiftIsoDate(asOfIso, -GA4_WINDOW_DAYS))
    .lte("date", asOfIso);

  const rows = (data ?? []) as Ga4Row[];
  if (rows.length === 0) return null;

  let sessions = 0;
  let engaged = 0;
  let conversions = 0;
  let revenue = 0;
  const device = new Map<string, { sessions: number; conversions: number; revenue: number }>();
  const sourceMedium = new Map<string, { sessions: number; conversions: number; revenue: number }>();
  const landing = new Map<string, { sessions: number; conversions: number; revenue: number }>();

  for (const row of rows) {
    sessions += Number(row.sessions);
    engaged += Number(row.engaged_sessions);
    conversions += Number(row.conversions);
    revenue += Number(row.purchase_revenue);
    accumulate(device, row.device_category, row);
    accumulate(sourceMedium, `${row.session_source} / ${row.session_medium}`, row);
    accumulate(landing, row.landing_page, row);
  }

  const byDevice = toEntries(device, sessions, conversions, 6);
  const bySourceMedium = toEntries(sourceMedium, sessions, conversions, 6);
  const topLanding = toEntries(landing, sessions, conversions, 6);

  const bestConverting = Array.from(device.entries())
    .filter(([, v]) => v.sessions >= MIN_SESSIONS_FOR_SIGNAL)
    .sort((a, b) => b[1].conversions / Math.max(1, b[1].sessions) - a[1].conversions / Math.max(1, a[1].sessions))[0];

  // Observações determinísticas: onde o comportamento (GA4) diverge do volume
  // — sinal direto para realocar mídia. Ex: mobile traz 70% das sessões mas só
  // 40% das conversões => atrito no mobile; desktop o contrário => oportunidade.
  const observations: string[] = [];
  for (const d of byDevice) {
    if (d.sessions < MIN_SESSIONS_FOR_SIGNAL || d.session_share == null || d.conversion_share == null) continue;
    if (d.conversion_share >= d.session_share * 1.3) {
      observations.push(
        `Device "${d.key}" converte acima do share de tráfego (${Math.round(d.conversion_share * 100)}% das conversões vs ${Math.round(d.session_share * 100)}% das sessões) — candidato a receber mais budget.`,
      );
    } else if (d.conversion_share <= d.session_share * 0.6) {
      observations.push(
        `Device "${d.key}" recebe ${Math.round(d.session_share * 100)}% das sessões mas só ${Math.round(d.conversion_share * 100)}% das conversões — provável atrito (LP/checkout) nesse device.`,
      );
    }
  }

  return {
    window_days: GA4_WINDOW_DAYS,
    property_id: conn.propertyId,
    linked: conn.linked,
    totals: {
      sessions,
      conversions: round2(conversions) ?? 0,
      revenue: round2(revenue) ?? 0,
      engagement_rate: sessions > 0 ? round2(engaged / sessions) : null,
    },
    best_converting_device: bestConverting?.[0] ?? null,
    by_device: byDevice,
    by_source_medium: bySourceMedium,
    top_landing_pages: topLanding,
    observations,
  };
}
