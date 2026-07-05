import type { AdDailyRow, EntityMetrics } from "@/lib/engine/metrics";
import { detectCreativeFatigue } from "./creative-fatigue";
import { detectCpaSpike } from "./cpa-spike";
import { detectWinnerUnderfunded } from "./winner-underfunded";
import { detectLoserOverfunded } from "./loser-overfunded";
import { detectSpendAnomaly } from "./spend-anomaly";
import { detectNoSignificance } from "./no-significance";
import type { EntityRef, Signal } from "./types";

export * from "./types";
export * from "./thresholds";
export { detectCreativeFatigue } from "./creative-fatigue";
export { detectCpaSpike } from "./cpa-spike";
export { detectWinnerUnderfunded } from "./winner-underfunded";
export { detectLoserOverfunded } from "./loser-overfunded";
export { detectSpendAnomaly } from "./spend-anomaly";
export { detectNoSignificance } from "./no-significance";

export interface SignalScanInput {
  entity: EntityRef;
  metrics: EntityMetrics;
  dailyRows: AdDailyRow[];
  asOfIso: string;
  entityStatus: string | null;
  businessModel: string | null;
  cpaAlvo: number | null;
  cpaMaximo: number | null;
  /** null para campanhas (não têm "pai" cujo spend comparar). */
  shareOfParentSpend7d: number | null;
}

/** Roda os 6 detectores da Fase 2 para uma entidade e devolve os sinais disparados. */
export function runSignalScan(input: SignalScanInput): Signal[] {
  const signals = [
    detectCreativeFatigue(input.entity, input.metrics, input.businessModel),
    detectCpaSpike(input.entity, input.metrics),
    detectWinnerUnderfunded(input.entity, input.metrics, input.cpaAlvo, input.shareOfParentSpend7d),
    detectLoserOverfunded(input.entity, input.dailyRows, input.asOfIso, input.cpaMaximo, input.shareOfParentSpend7d),
    detectSpendAnomaly(input.entity, input.dailyRows, input.asOfIso, input.entityStatus),
    detectNoSignificance(input.entity, input.metrics),
  ];

  return signals.filter((s): s is Signal => s !== null);
}
