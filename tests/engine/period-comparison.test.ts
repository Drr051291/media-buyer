import { describe, expect, it } from "vitest";
import {
  comparePeriods,
  deltaPct,
  deriveMetrics,
  splitByPeriod,
  sumMetrics,
  type MetricRow,
} from "@/lib/engine/period-comparison";

function row(date: string, overrides: Partial<MetricRow> = {}): MetricRow {
  return {
    date,
    spend: 100,
    impressions: 1000,
    clicks: 20,
    linkClicks: 15,
    conversions: 2,
    conversionValue: 400,
    ...overrides,
  };
}

describe("sumMetrics / deriveMetrics", () => {
  it("soma os totais e deriva CTR/CPM/CPC/CPA/ROAS", () => {
    const totals = sumMetrics([row("2026-07-01"), row("2026-07-02")]);
    expect(totals.spend).toBe(200);
    expect(totals.impressions).toBe(2000);

    const derived = deriveMetrics(totals);
    expect(derived.ctr).toBeCloseTo((40 / 2000) * 100);
    expect(derived.cpm).toBeCloseTo((200 / 2000) * 1000);
    expect(derived.cpc).toBeCloseTo(200 / 40);
    expect(derived.cpa).toBeCloseTo(200 / 4);
    expect(derived.roas).toBeCloseTo(800 / 200);
  });

  it("retorna métricas derivadas null quando não há base (divisão por zero)", () => {
    const derived = deriveMetrics(sumMetrics([]));
    expect(derived.ctr).toBeNull();
    expect(derived.cpm).toBeNull();
    expect(derived.cpc).toBeNull();
    expect(derived.cpa).toBeNull();
    expect(derived.roas).toBeNull();
  });
});

describe("deltaPct", () => {
  it("calcula variação percentual", () => {
    expect(deltaPct(120, 100)).toBeCloseTo(20);
    expect(deltaPct(80, 100)).toBeCloseTo(-20);
  });

  it("retorna null sem base de comparação válida", () => {
    expect(deltaPct(100, null)).toBeNull();
    expect(deltaPct(null, 100)).toBeNull();
    expect(deltaPct(100, 0)).toBeNull();
  });
});

describe("splitByPeriod", () => {
  it("separa linhas em atual (últimos N dias) e anterior (N dias antes disso)", () => {
    const rows = [
      row("2026-06-25"), // atual (today - 6, início da janela de 7 dias)
      row("2026-06-29"), // atual
      row("2026-07-01"), // hoje
      row("2026-06-24"), // anterior (um dia antes do início da janela atual)
    ];

    const { currentRows, previousRows } = splitByPeriod(rows, "2026-07-01", 7);

    expect(currentRows.map((r) => r.date).sort()).toEqual(["2026-06-25", "2026-06-29", "2026-07-01"]);
    expect(previousRows.map((r) => r.date).sort()).toEqual(["2026-06-24"]);
  });
});

describe("comparePeriods", () => {
  it("compara current vs previous e calcula deltaPct por métrica", () => {
    const current = [row("2026-07-01", { spend: 200, conversions: 4, conversionValue: 800 })];
    const previous = [row("2026-06-24", { spend: 100, conversions: 2, conversionValue: 400 })];

    const result = comparePeriods(current, previous);

    expect(result.current.spend).toBe(200);
    expect(result.previous.spend).toBe(100);
    expect(result.deltaPct.spend).toBeCloseTo(100);
    expect(result.deltaPct.cpa).toBeCloseTo(0); // CPA igual nos dois períodos (100/2 vs 200/4)
  });

  it("lida com período anterior vazio (sem base) retornando delta null", () => {
    const result = comparePeriods([row("2026-07-01")], []);
    expect(result.deltaPct.spend).toBeNull();
  });
});
