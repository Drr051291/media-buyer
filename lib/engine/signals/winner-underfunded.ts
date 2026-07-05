import type { EntityMetrics } from "@/lib/engine/metrics";
import { MIN_CONVERSIONS_FOR_SIGNIFICANCE } from "./thresholds";
import type { EntityRef, Signal } from "./types";

/**
 * WINNER_UNDERFUNDED — PROJECT.md 6.3: adset com CPA ≤ 80% do alvo e volume
 * estável (mínimo de conversões p/ não ser ruído) recebendo < 15% do spend
 * da campanha.
 */
export function detectWinnerUnderfunded(
  entity: EntityRef,
  metrics: EntityMetrics,
  cpaAlvo: number | null,
  shareOfCampaignSpend7d: number | null,
): Signal | null {
  const { d7 } = metrics;

  if (cpaAlvo == null || d7.cpa == null || shareOfCampaignSpend7d == null) return null;
  if (d7.conversions < MIN_CONVERSIONS_FOR_SIGNIFICANCE) return null;

  const isWinner = d7.cpa <= cpaAlvo * 0.8;
  const isUnderfunded = shareOfCampaignSpend7d < 0.15;
  if (!isWinner || !isUnderfunded) return null;

  return {
    signal: "WINNER_UNDERFUNDED",
    entity,
    severity: "warning",
    evidence: [
      `CPA 7d: ${d7.cpa.toFixed(2)} (≤ 80% do alvo de ${cpaAlvo.toFixed(2)})`,
      `Recebe apenas ${(shareOfCampaignSpend7d * 100).toFixed(1)}% do spend da campanha`,
      `${d7.conversions} conversões em 7d`,
    ],
  };
}
