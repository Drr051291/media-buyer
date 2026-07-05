import type { EntityMetrics } from "@/lib/engine/metrics";
import { MIN_CONVERSIONS_FOR_SIGNIFICANCE } from "./thresholds";
import type { EntityRef, Signal } from "./types";

/**
 * NO_SIGNIFICANCE — PROJECT.md 6.3: entidade com spend mas poucas conversões
 * na janela de 7d → proíbe o Reasoner de tirar conclusões de CPA/ROAS ali.
 */
export function detectNoSignificance(entity: EntityRef, metrics: EntityMetrics): Signal | null {
  const { d7 } = metrics;
  if (d7.spend <= 0) return null;
  if (d7.conversions >= MIN_CONVERSIONS_FOR_SIGNIFICANCE) return null;

  return {
    signal: "NO_SIGNIFICANCE",
    entity,
    severity: "info",
    evidence: [
      `Apenas ${d7.conversions} conversão(ões) em 7d com spend de ${d7.spend.toFixed(2)} — abaixo do mínimo de ${MIN_CONVERSIONS_FOR_SIGNIFICANCE} para conclusões estatísticas`,
    ],
  };
}
