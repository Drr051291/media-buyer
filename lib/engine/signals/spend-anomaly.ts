import { isSpendAnomaly, shiftIsoDate, type AdDailyRow } from "@/lib/engine/metrics";
import type { EntityRef, Signal } from "./types";

/**
 * SPEND_ANOMALY — PROJECT.md 6.3: spend do dia > 2 desvios-padrão da média
 * 30d, ou zero gasto numa entidade ativa que historicamente gastava.
 * Dias sem linha em metrics_daily contam como spend=0 (o sync já filtra
 * spend>0 na origem, então ausência = sem gasto naquele dia).
 */
export function detectSpendAnomaly(
  entity: EntityRef,
  dailyRows: AdDailyRow[],
  asOfIso: string,
  entityStatus: string | null,
): Signal | null {
  // Entidade pausada/arquivada com spend zero é o esperado, não uma anomalia.
  if (entityStatus != null && entityStatus !== "ACTIVE") return null;

  const rowByDate = new Map(dailyRows.map((r) => [r.date, r]));

  const history: number[] = [];
  for (let i = 1; i <= 30; i++) {
    history.push(rowByDate.get(shiftIsoDate(asOfIso, -i))?.spend ?? 0);
  }
  const todaySpend = rowByDate.get(asOfIso)?.spend ?? 0;

  const hadHistoricalSpend = history.some((s) => s > 0);
  const isZeroSpendActive = entityStatus === "ACTIVE" && todaySpend === 0 && hadHistoricalSpend;
  const isStatisticalAnomaly = isSpendAnomaly(history, todaySpend);

  if (!isZeroSpendActive && !isStatisticalAnomaly) return null;

  const mean = history.reduce((a, b) => a + b, 0) / history.length;

  return {
    signal: "SPEND_ANOMALY",
    entity,
    severity: isZeroSpendActive ? "critical" : "warning",
    evidence: isZeroSpendActive
      ? [`Entidade ativa com spend zero hoje, média histórica de ${mean.toFixed(2)}/dia`]
      : [`Spend hoje: ${todaySpend.toFixed(2)}, média 30d: ${mean.toFixed(2)}`],
  };
}
