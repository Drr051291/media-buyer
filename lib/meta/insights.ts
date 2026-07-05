import { MetaClient, spendGreaterThanZeroFilter } from "./client";

export const INSIGHTS_FIELDS = [
  "ad_id",
  "adset_id",
  "campaign_id",
  "date_start",
  "spend",
  "impressions",
  "reach",
  "frequency",
  "clicks",
  "inline_link_clicks",
  "ctr",
  "cpm",
  "cpc",
  "actions",
  "action_values",
  "cost_per_action_type",
  "purchase_roas",
  "video_thruplay_watched_actions",
  "quality_ranking",
  "engagement_rate_ranking",
  "conversion_rate_ranking",
].join(",");

/** Tipos de ação aceitos como proxy genérico de "conversão" antes do Business
 * Context (Fase 2) definir o evento real da conta. Ordem = prioridade. */
const GENERIC_CONVERSION_ACTION_TYPES = ["purchase", "omni_purchase", "lead", "complete_registration"];

interface MetaAction {
  action_type: string;
  value: string;
}

export interface RawAdInsight {
  ad_id: string;
  adset_id?: string;
  campaign_id?: string;
  date_start: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  frequency?: string;
  clicks?: string;
  inline_link_clicks?: string;
  ctr?: string;
  cpm?: string;
  cpc?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
  purchase_roas?: { value: string }[];
  [key: string]: unknown;
}

export interface InsightsResponse {
  data: RawAdInsight[];
  paging?: { cursors?: { after?: string }; next?: string };
}

export interface AdInsightRow {
  adMetaId: string;
  adsetMetaId: string | null;
  campaignMetaId: string | null;
  date: string;
  spend: number;
  impressions: number;
  reach: number;
  frequency: number | null;
  clicks: number;
  linkClicks: number;
  ctr: number | null;
  cpm: number | null;
  cpc: number | null;
  /** Melhor esforço genérico — recalculado pelo Metric Engine (Fase 2) com o
   * evento real do Business Context. */
  conversions: number;
  conversionValue: number;
  cpa: number | null;
  roas: number | null;
  raw: RawAdInsight;
}

function pickGenericConversions(insight: RawAdInsight): { conversions: number; conversionValue: number } {
  const actions = insight.actions ?? [];
  const actionValues = insight.action_values ?? [];

  for (const type of GENERIC_CONVERSION_ACTION_TYPES) {
    const action = actions.find((a) => a.action_type === type);
    if (action) {
      const value = actionValues.find((a) => a.action_type === type);
      return { conversions: Number(action.value), conversionValue: value ? Number(value.value) : 0 };
    }
  }
  return { conversions: 0, conversionValue: 0 };
}

export function toAdInsightRow(raw: RawAdInsight): AdInsightRow {
  const spend = Number(raw.spend ?? 0);
  const { conversions, conversionValue } = pickGenericConversions(raw);

  return {
    adMetaId: raw.ad_id,
    adsetMetaId: raw.adset_id ?? null,
    campaignMetaId: raw.campaign_id ?? null,
    date: raw.date_start,
    spend,
    impressions: Number(raw.impressions ?? 0),
    reach: Number(raw.reach ?? 0),
    frequency: raw.frequency ? Number(raw.frequency) : null,
    clicks: Number(raw.clicks ?? 0),
    linkClicks: Number(raw.inline_link_clicks ?? 0),
    ctr: raw.ctr ? Number(raw.ctr) : null,
    cpm: raw.cpm ? Number(raw.cpm) : null,
    cpc: raw.cpc ? Number(raw.cpc) : null,
    conversions,
    conversionValue,
    cpa: conversions > 0 ? spend / conversions : null,
    roas: spend > 0 && conversionValue > 0 ? conversionValue / spend : null,
    raw,
  };
}

/**
 * Insights nível ad, time_increment=1, para a janela [since, until]. Pagina
 * internamente até esgotar — a chunking por conta (1 invocação = 1 conta) é
 * feita pelo job de cron, não aqui (PROJECT.md 3.2, 6.1).
 */
export async function fetchDailyAdInsights(
  client: MetaClient,
  metaAccountId: string,
  since: string,
  until: string,
): Promise<AdInsightRow[]> {
  const rows: AdInsightRow[] = [];
  let after: string | undefined;

  do {
    const response = await client.get<InsightsResponse>(`act_${metaAccountId}/insights`, {
      level: "ad",
      time_increment: 1,
      time_range: JSON.stringify({ since, until }),
      fields: INSIGHTS_FIELDS,
      filtering: spendGreaterThanZeroFilter(),
      limit: 500,
      after,
    });

    rows.push(...response.data.map(toAdInsightRow));
    after = response.paging?.next ? response.paging.cursors?.after : undefined;
  } while (after);

  return rows;
}
