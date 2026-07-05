import { describe, expect, it } from "vitest";
import type { AdDailyRow, EntityMetrics, EntityWindowSummary } from "@/lib/engine/metrics";
import {
  detectCreativeFatigue,
  detectCpaSpike,
  detectWinnerUnderfunded,
  detectLoserOverfunded,
  detectSpendAnomaly,
  detectNoSignificance,
} from "@/lib/engine/signals";
import type { EntityRef } from "@/lib/engine/signals/types";

const entity: EntityRef = { level: "adset", metaId: "as1", name: "Adset 1" };

function window(overrides: Partial<EntityWindowSummary> = {}): EntityWindowSummary {
  return {
    spend: 100,
    impressions: 1000,
    clicks: 20,
    linkClicks: 15,
    conversions: 15,
    conversionValue: 400,
    ctr: 2,
    cpm: 100,
    cpc: 5,
    cpa: 20,
    roas: 4,
    reach: 500,
    frequency: 2,
    daysWithData: 7,
    ...overrides,
  };
}

function metrics(overrides: Partial<EntityMetrics> = {}): EntityMetrics {
  return {
    d3: window(),
    d7: window(),
    d14: window(),
    d30: window(),
    previous14d: window(),
    deltaPct7d: {
      spend: 0, impressions: 0, clicks: 0, linkClicks: 0, conversions: 0, conversionValue: 0,
      ctr: 0, cpm: 0, cpc: 0, cpa: 0, roas: 0,
    },
    frequencyDeltaPct7d: 0,
    ...overrides,
  };
}

describe("detectCreativeFatigue", () => {
  it("dispara quando frequência alta + CTR caiu >25% + CPA subiu", () => {
    const m = metrics({
      d7: window({ frequency: 5, ctr: 1, cpa: 30 }),
      previous14d: window({ ctr: 2, cpa: 20 }),
    });
    const signal = detectCreativeFatigue(entity, m, "ecommerce");
    expect(signal?.signal).toBe("CREATIVE_FATIGUE");
  });

  it("não dispara se a frequência está dentro do saudável", () => {
    const m = metrics({ d7: window({ frequency: 2, ctr: 1, cpa: 30 }), previous14d: window({ ctr: 2, cpa: 20 }) });
    expect(detectCreativeFatigue(entity, m, "ecommerce")).toBeNull();
  });

  it("não dispara se o CPA não subiu", () => {
    const m = metrics({ d7: window({ frequency: 5, ctr: 1, cpa: 15 }), previous14d: window({ ctr: 2, cpa: 20 }) });
    expect(detectCreativeFatigue(entity, m, "ecommerce")).toBeNull();
  });
});

describe("detectCpaSpike", () => {
  it("dispara quando CPA 3d > 1.3x CPA 14d com volume mínimo nas duas janelas", () => {
    const m = metrics({
      d3: window({ cpa: 30, conversions: 12 }),
      d14: window({ cpa: 20, conversions: 20 }),
    });
    expect(detectCpaSpike(entity, m)?.signal).toBe("CPA_SPIKE");
  });

  it("não dispara sem volume mínimo de conversões", () => {
    const m = metrics({ d3: window({ cpa: 30, conversions: 5 }), d14: window({ cpa: 20, conversions: 20 }) });
    expect(detectCpaSpike(entity, m)).toBeNull();
  });

  it("não dispara quando o aumento é menor que 30%", () => {
    const m = metrics({ d3: window({ cpa: 22, conversions: 12 }), d14: window({ cpa: 20, conversions: 20 }) });
    expect(detectCpaSpike(entity, m)).toBeNull();
  });
});

describe("detectWinnerUnderfunded", () => {
  it("dispara com CPA <=80% do alvo, volume ok e <15% do spend da campanha", () => {
    const m = metrics({ d7: window({ cpa: 15, conversions: 12 }) });
    expect(detectWinnerUnderfunded(entity, m, 20, 0.1)?.signal).toBe("WINNER_UNDERFUNDED");
  });

  it("não dispara se recebe >=15% do spend", () => {
    const m = metrics({ d7: window({ cpa: 15, conversions: 12 }) });
    expect(detectWinnerUnderfunded(entity, m, 20, 0.2)).toBeNull();
  });

  it("não dispara sem cpaAlvo definido", () => {
    const m = metrics({ d7: window({ cpa: 15, conversions: 12 }) });
    expect(detectWinnerUnderfunded(entity, m, null, 0.1)).toBeNull();
  });
});

function rowsWithConstantCpa(asOfIso: string, days: number, spend: number, conversions: number): AdDailyRow[] {
  const rows: AdDailyRow[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(`${asOfIso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    rows.push({
      date: d.toISOString().slice(0, 10),
      spend,
      impressions: 1000,
      reach: 500,
      clicks: 20,
      linkClicks: 15,
      conversions,
      conversionValue: 0,
    });
  }
  return rows;
}

describe("detectLoserOverfunded", () => {
  it("dispara com CPA acima do máximo por 5 dias consecutivos e >20% do spend", () => {
    const rows = rowsWithConstantCpa("2026-07-01", 5, 100, 1); // cpa=100/dia
    expect(detectLoserOverfunded(entity, rows, "2026-07-01", 50, 0.25)?.signal).toBe("LOSER_OVERFUNDED");
  });

  it("não dispara se falta um dia na sequência de 5", () => {
    const rows = rowsWithConstantCpa("2026-07-01", 4, 100, 1); // só 4 dias
    expect(detectLoserOverfunded(entity, rows, "2026-07-01", 50, 0.25)).toBeNull();
  });

  it("não dispara com share de spend <=20%", () => {
    const rows = rowsWithConstantCpa("2026-07-01", 5, 100, 1);
    expect(detectLoserOverfunded(entity, rows, "2026-07-01", 50, 0.1)).toBeNull();
  });
});

describe("detectSpendAnomaly", () => {
  it("dispara quando spend hoje > 2 desvios-padrao da media 30d", () => {
    const rows = rowsWithConstantCpa("2026-06-30", 30, 100, 5); // 30 dias anteriores gastando 100
    const todayRow: AdDailyRow = { date: "2026-07-01", spend: 800, impressions: 1000, reach: 500, clicks: 20, linkClicks: 15, conversions: 5, conversionValue: 0 };
    expect(detectSpendAnomaly(entity, [...rows, todayRow], "2026-07-01", "ACTIVE")?.signal).toBe("SPEND_ANOMALY");
  });

  it("dispara com spend zero numa entidade ativa que gastava historicamente", () => {
    const rows = rowsWithConstantCpa("2026-06-30", 30, 100, 5);
    expect(detectSpendAnomaly(entity, rows, "2026-07-01", "ACTIVE")?.signal).toBe("SPEND_ANOMALY");
  });

  it("não dispara para entidade pausada com spend zero", () => {
    const rows = rowsWithConstantCpa("2026-06-30", 30, 100, 5);
    expect(detectSpendAnomaly(entity, rows, "2026-07-01", "PAUSED")).toBeNull();
  });
});

describe("detectNoSignificance", () => {
  it("dispara com spend > 0 e conversões abaixo do mínimo", () => {
    const m = metrics({ d7: window({ spend: 50, conversions: 3 }) });
    expect(detectNoSignificance(entity, m)?.signal).toBe("NO_SIGNIFICANCE");
  });

  it("não dispara sem spend", () => {
    const m = metrics({ d7: window({ spend: 0, conversions: 0 }) });
    expect(detectNoSignificance(entity, m)).toBeNull();
  });

  it("não dispara com conversões suficientes", () => {
    const m = metrics({ d7: window({ spend: 50, conversions: 15 }) });
    expect(detectNoSignificance(entity, m)).toBeNull();
  });
});
