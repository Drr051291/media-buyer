import type { EntityMetrics } from "@/lib/engine/metrics";
import { fatigueThresholdFor } from "./thresholds";
import type { EntityRef, Signal } from "./types";

/**
 * CREATIVE_FATIGUE — PROJECT.md 6.3: frequência 7d acima do saudável para o
 * modelo de negócio, CTR 7d caindo >25% vs 14d anteriores e CPA subindo.
 */
export function detectCreativeFatigue(
  entity: EntityRef,
  metrics: EntityMetrics,
  businessModel: string | null,
): Signal | null {
  const { d7, previous14d } = metrics;

  if (
    d7.frequency == null ||
    d7.ctr == null ||
    previous14d.ctr == null ||
    d7.cpa == null ||
    previous14d.cpa == null
  ) {
    return null;
  }

  const threshold = fatigueThresholdFor(businessModel);
  const ctrDropPct = ((previous14d.ctr - d7.ctr) / previous14d.ctr) * 100;

  const isFatigued = d7.frequency > threshold && ctrDropPct > 25 && d7.cpa > previous14d.cpa;
  if (!isFatigued) return null;

  return {
    signal: "CREATIVE_FATIGUE",
    entity,
    severity: "warning",
    evidence: [
      `Frequência 7d: ${d7.frequency.toFixed(2)} (limite saudável: ${threshold})`,
      `CTR caiu ${ctrDropPct.toFixed(1)}% (7d: ${d7.ctr.toFixed(2)}% vs 14d anteriores: ${previous14d.ctr.toFixed(2)}%)`,
      `CPA subiu de ${previous14d.cpa.toFixed(2)} (14d anteriores) para ${d7.cpa.toFixed(2)} (7d)`,
    ],
  };
}
