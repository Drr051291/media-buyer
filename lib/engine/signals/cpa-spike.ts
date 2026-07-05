import type { EntityMetrics } from "@/lib/engine/metrics";
import { MIN_CONVERSIONS_FOR_SIGNIFICANCE } from "./thresholds";
import type { EntityRef, Signal } from "./types";

/** CPA_SPIKE — PROJECT.md 6.3: CPA 3d > 1.3x CPA 14d, com volume mínimo nas duas janelas. */
export function detectCpaSpike(entity: EntityRef, metrics: EntityMetrics): Signal | null {
  const { d3, d14 } = metrics;

  if (d3.cpa == null || d14.cpa == null) return null;
  if (d3.conversions < MIN_CONVERSIONS_FOR_SIGNIFICANCE || d14.conversions < MIN_CONVERSIONS_FOR_SIGNIFICANCE) {
    return null;
  }

  if (d3.cpa <= d14.cpa * 1.3) return null;

  const increasePct = ((d3.cpa - d14.cpa) / d14.cpa) * 100;

  return {
    signal: "CPA_SPIKE",
    entity,
    severity: "critical",
    evidence: [
      `CPA 3d: ${d3.cpa.toFixed(2)} (${d3.conversions} conversões)`,
      `CPA 14d: ${d14.cpa.toFixed(2)} (${d14.conversions} conversões)`,
      `Aumento de ${increasePct.toFixed(1)}%`,
    ],
  };
}
