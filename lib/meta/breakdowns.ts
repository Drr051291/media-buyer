import { MetaClient, spendGreaterThanZeroFilter } from "./client";
import { toAdInsightRow, type AdInsightRow, type InsightsResponse, type RawAdInsight } from "./insights";

/** PROJECT.md 6.1: breakdowns leves, sempre em chamadas separadas, nunca combinadas. */
export type BreakdownDimension = "publisher_platform" | "platform_position" | "age" | "gender";

const BREAKDOWN_FIELDS = [
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
].join(",");

export interface BreakdownInsightRow extends AdInsightRow {
  dimension: BreakdownDimension;
  dimensionValue: string;
}

/** Busca insights de ad com UM breakdown por vez, paginando até esgotar. */
export async function fetchDailyBreakdownInsights(
  client: MetaClient,
  metaAccountId: string,
  dimension: BreakdownDimension,
  since: string,
  until: string,
): Promise<BreakdownInsightRow[]> {
  const rows: BreakdownInsightRow[] = [];
  let after: string | undefined;

  do {
    const response = await client.get<InsightsResponse>(`act_${metaAccountId}/insights`, {
      level: "ad",
      time_increment: 1,
      time_range: JSON.stringify({ since, until }),
      fields: BREAKDOWN_FIELDS,
      breakdowns: dimension,
      filtering: spendGreaterThanZeroFilter(),
      limit: 500,
      after,
    });

    for (const raw of response.data) {
      const dimensionValue = String((raw as RawAdInsight & Record<string, unknown>)[dimension] ?? "unknown");
      rows.push({ ...toAdInsightRow(raw), dimension, dimensionValue });
    }

    after = response.paging?.next ? response.paging.cursors?.after : undefined;
  } while (after);

  return rows;
}

export function breakdownKey(dimension: BreakdownDimension, value: string): string {
  return `${dimension}:${value}`;
}
