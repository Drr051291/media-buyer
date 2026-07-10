/**
 * GAQL (Google Ads Query Language) + normalização (ETAPA3GOOGLEADS BLOCO 3).
 *
 * Funções PURAS e testáveis (tests/providers/google-ads-gaql.test.ts). A
 * normalização de `micros` é a regra anti-bug nº1 do Google Ads:
 *   cost_micros = 45_230_000  →  spend = 45.23  (dividir por 1.000.000)
 * Errar isso infla o spend em 1 milhão de vezes — catastrófico e silencioso.
 *
 * NÃO importa nada de server-only — é só string + transformação, roda em teste.
 */

import type { CanonicalLevel, ProviderEntity, ProviderInsightRow } from "@/lib/providers/ads-provider";

export const MICROS = 1_000_000;

/** Converte um valor em micros (number | string | Long-like) para a unidade da moeda. */
export function microsToUnit(micros: unknown): number {
  const n = typeof micros === "number" ? micros : Number(micros ?? 0);
  if (!Number.isFinite(n)) return 0;
  return n / MICROS;
}

/** Converte um valor da unidade da moeda para micros (para a ESCRITA de budget, BLOCO 6). */
export function unitToMicros(value: number): number {
  return Math.round(value * MICROS);
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

// ---------------------------------------------------------------------------
// Queries de entidades (estrutura). Google Ads → canônico:
// campaign → campaign, ad_group → adset, ad_group_ad → ad.
// ---------------------------------------------------------------------------
export const ENTITY_QUERIES: Record<CanonicalLevel, string> = {
  campaign: `
    SELECT campaign.id, campaign.name, campaign.status,
           campaign.advertising_channel_type, campaign_budget.amount_micros
    FROM campaign
    WHERE campaign.status != 'REMOVED'`,
  adset: `
    SELECT ad_group.id, ad_group.name, ad_group.status, campaign.id
    FROM ad_group
    WHERE ad_group.status != 'REMOVED'`,
  ad: `
    SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.status, ad_group.id
    FROM ad_group_ad
    WHERE ad_group_ad.status != 'REMOVED'`,
};

/** Query de insights nível ad, por dia, para uma janela [start, end] (YYYY-MM-DD). */
export function insightsQuery(start: string, end: string): string {
  return `
    SELECT ad_group_ad.ad.id, segments.date,
           metrics.cost_micros, metrics.impressions, metrics.clicks,
           metrics.conversions, metrics.conversions_value
    FROM ad_group_ad
    WHERE segments.date BETWEEN '${start}' AND '${end}'`;
}

// ---------------------------------------------------------------------------
// Normalização (row parseada da lib → tipos canônicos)
// ---------------------------------------------------------------------------
interface GaqlRow {
  campaign?: { id?: unknown; name?: unknown; status?: unknown; advertising_channel_type?: unknown };
  campaign_budget?: { amount_micros?: unknown };
  ad_group?: { id?: unknown; name?: unknown; status?: unknown };
  ad_group_ad?: { ad?: { id?: unknown; name?: unknown }; status?: unknown };
  segments?: { date?: unknown };
  metrics?: {
    cost_micros?: unknown;
    impressions?: unknown;
    clicks?: unknown;
    conversions?: unknown;
    conversions_value?: unknown;
  };
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

/**
 * Normaliza o status para o vocabulário CANÔNICO (o mesmo do Meta), para que
 * guardrails, executor e dashboards funcionem uniformes entre providers:
 *   Google 'ENABLED' → 'ACTIVE'; 'PAUSED'/'REMOVED' inalterados.
 * As mutações (BLOCO 6) traduzem de volta ACTIVE → ENABLED ao chamar a API.
 */
export function mapCanonicalStatus(raw: unknown): string | null {
  const s = str(raw).toUpperCase();
  if (!s) return null;
  return s === "ENABLED" ? "ACTIVE" : s;
}

export function normalizeEntityRow(level: CanonicalLevel, row: GaqlRow): ProviderEntity | null {
  if (level === "campaign") {
    const id = str(row.campaign?.id);
    if (!id) return null;
    return {
      level,
      externalId: id,
      parentExternalId: null,
      name: str(row.campaign?.name) || id,
      status: mapCanonicalStatus(row.campaign?.status),
      objective: row.campaign?.advertising_channel_type != null
        ? str(row.campaign.advertising_channel_type)
        : null,
      // budget em micros → unidade da moeda. Nunca gravar micros cru.
      dailyBudget: row.campaign_budget?.amount_micros != null
        ? microsToUnit(row.campaign_budget.amount_micros)
        : null,
    };
  }
  if (level === "adset") {
    const id = str(row.ad_group?.id);
    if (!id) return null;
    return {
      level,
      externalId: id,
      parentExternalId: str(row.campaign?.id) || null,
      name: str(row.ad_group?.name) || id,
      status: mapCanonicalStatus(row.ad_group?.status),
      objective: null,
      dailyBudget: null, // budget do Google fica no campaign_budget (nível campanha)
    };
  }
  // level === "ad"
  const id = str(row.ad_group_ad?.ad?.id);
  if (!id) return null;
  return {
    level,
    externalId: id,
    parentExternalId: str(row.ad_group?.id) || null,
    name: str(row.ad_group_ad?.ad?.name) || id,
    status: mapCanonicalStatus(row.ad_group_ad?.status),
    objective: null,
    dailyBudget: null,
  };
}

/**
 * Normaliza uma linha de insight (nível ad, por dia). CPA/ROAS NÃO são
 * derivados aqui — o motor recalcula sobre o evento do business_context
 * (PROJECT.md §6.1). conversions_value já vem na unidade da moeda (NÃO micros).
 */
export function normalizeInsightRow(row: GaqlRow): ProviderInsightRow | null {
  const adId = str(row.ad_group_ad?.ad?.id);
  const date = str(row.segments?.date);
  if (!adId || !date) return null;
  const m = row.metrics ?? {};
  return {
    level: "ad",
    externalId: adId,
    date,
    spend: microsToUnit(m.cost_micros), // ÷ 1e6 — regra anti-bug
    impressions: num(m.impressions),
    clicks: num(m.clicks),
    conversions: num(m.conversions), // pode ser fracionado (atribuição do Google)
    conversionValue: num(m.conversions_value),
    raw: {
      cost_micros: m.cost_micros ?? null,
      impressions: m.impressions ?? null,
      clicks: m.clicks ?? null,
      conversions: m.conversions ?? null,
      conversions_value: m.conversions_value ?? null,
    },
  };
}
