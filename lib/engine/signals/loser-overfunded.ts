import { shiftIsoDate, type AdDailyRow } from "@/lib/engine/metrics";
import type { EntityRef, Signal } from "./types";

const MIN_CONSECUTIVE_DAYS_OVER_MAX = 5;

/**
 * LOSER_OVERFUNDED — PROJECT.md 6.3: adset com CPA > cpa_maximo por 5+ dias
 * CONSECUTIVOS consumindo > 20% do spend. Um dia sem dado (sem spend/sem
 * conversão) quebra a sequência — não dá para confirmar o critério nesse dia.
 */
export function detectLoserOverfunded(
  entity: EntityRef,
  dailyRows: AdDailyRow[],
  asOfIso: string,
  cpaMaximo: number | null,
  shareOfCampaignSpend7d: number | null,
): Signal | null {
  if (cpaMaximo == null || shareOfCampaignSpend7d == null) return null;
  if (shareOfCampaignSpend7d <= 0.2) return null;

  const rowByDate = new Map(dailyRows.map((r) => [r.date, r]));
  const dailyCpas: number[] = [];

  for (let i = 0; i < MIN_CONSECUTIVE_DAYS_OVER_MAX; i++) {
    const date = shiftIsoDate(asOfIso, -i);
    const row = rowByDate.get(date);
    if (!row || row.conversions <= 0) return null;

    const cpa = row.spend / row.conversions;
    if (cpa <= cpaMaximo) return null;

    dailyCpas.push(cpa);
  }

  return {
    signal: "LOSER_OVERFUNDED",
    entity,
    severity: "critical",
    evidence: [
      `CPA acima de ${cpaMaximo.toFixed(2)} nos últimos ${MIN_CONSECUTIVE_DAYS_OVER_MAX} dias (${dailyCpas.map((c) => c.toFixed(2)).join(", ")})`,
      `Consome ${(shareOfCampaignSpend7d * 100).toFixed(1)}% do spend da campanha`,
    ],
  };
}
