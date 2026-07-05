import { describe, expect, it } from "vitest";
import {
  computeEntityMetrics,
  extractEventMetrics,
  filterWindow,
  isSpendAnomaly,
  rollUpToAdsetAndCampaign,
  shareOfSpend,
  summarizeWindow,
  toEngineRow,
  type AdDailyRow,
} from "@/lib/engine/metrics";

describe("extractEventMetrics", () => {
  it("extrai conversions/conversionValue do action_type real da conta (não o proxy genérico)", () => {
    const raw = {
      actions: [
        { action_type: "lead", value: "10" },
        { action_type: "purchase", value: "2" },
      ],
      action_values: [{ action_type: "purchase", value: "500" }],
    };

    // Conta que define "lead" como evento principal (ex: leadgen B2B) — mesmo
    // havendo purchase no payload, o Metric Engine usa o evento configurado.
    expect(extractEventMetrics(raw, "lead")).toEqual({ conversions: 10, conversionValue: 0 });
    expect(extractEventMetrics(raw, "purchase")).toEqual({ conversions: 2, conversionValue: 500 });
  });

  it("retorna zero quando o evento configurado não aparece nas actions", () => {
    expect(extractEventMetrics({ actions: [{ action_type: "lead", value: "5" }] }, "purchase")).toEqual({
      conversions: 0,
      conversionValue: 0,
    });
  });
});

function row(date: string, overrides: Partial<AdDailyRow> = {}): AdDailyRow {
  return {
    date,
    spend: 100,
    impressions: 1000,
    reach: 500,
    clicks: 20,
    linkClicks: 15,
    conversions: 2,
    conversionValue: 400,
    ...overrides,
  };
}

describe("toEngineRow", () => {
  it("usa o evento real para popular conversions/conversionValue", () => {
    const engineRow = toEngineRow(
      {
        date: "2026-07-01",
        spend: 50,
        impressions: 500,
        reach: 300,
        clicks: 10,
        linkClicks: 8,
        raw: { actions: [{ action_type: "lead", value: "3" }], action_values: [] },
      },
      "lead",
    );

    expect(engineRow.conversions).toBe(3);
    expect(engineRow.reach).toBe(300);
  });
});

describe("summarizeWindow / filterWindow", () => {
  it("calcula frequência a partir de impressions/reach somados", () => {
    const rows = [row("2026-07-01", { impressions: 1000, reach: 500 }), row("2026-07-02", { impressions: 1000, reach: 500 })];
    const summary = summarizeWindow(rows);
    expect(summary.reach).toBe(1000);
    expect(summary.frequency).toBeCloseTo(2000 / 1000);
    expect(summary.daysWithData).toBe(2);
  });

  it("frequency é null quando reach é zero", () => {
    const summary = summarizeWindow([row("2026-07-01", { reach: 0 })]);
    expect(summary.frequency).toBeNull();
  });

  it("filterWindow seleciona apenas os últimos N dias terminando em asOf", () => {
    const rows = [row("2026-06-20"), row("2026-06-29"), row("2026-07-01")];
    const filtered = filterWindow(rows, "2026-07-01", 3);
    expect(filtered.map((r) => r.date)).toEqual(["2026-06-29", "2026-07-01"]);
  });
});

describe("computeEntityMetrics", () => {
  it("produz as 4 janelas e o delta 7d vs 7d anterior", () => {
    const rows: AdDailyRow[] = [];
    for (let i = 0; i < 30; i++) {
      const date = new Date("2026-07-01T00:00:00Z");
      date.setUTCDate(date.getUTCDate() - i);
      const spend = i < 7 ? 200 : 100; // últimos 7 dias gastando o dobro
      rows.push(row(date.toISOString().slice(0, 10), { spend, conversions: 2, conversionValue: 400 }));
    }

    const metrics = computeEntityMetrics(rows, "2026-07-01");

    expect(metrics.d7.spend).toBeCloseTo(1400); // 7 * 200
    expect(metrics.d30.spend).toBeCloseTo(7 * 200 + 23 * 100);
    expect(metrics.deltaPct7d.spend).toBeCloseTo(100); // dobrou vs período anterior
  });
});

describe("rollUpToAdsetAndCampaign", () => {
  it("agrega linhas de ads para o adset e depois para a campanha", () => {
    const adRows = new Map<string, AdDailyRow[]>([
      ["ad1", [row("2026-07-01", { spend: 50 })]],
      ["ad2", [row("2026-07-01", { spend: 30 })]],
    ]);
    const hierarchy = {
      adsetIdByAd: new Map([
        ["ad1", "adset1"],
        ["ad2", "adset1"],
      ]),
      campaignIdByAdset: new Map([["adset1", "campaign1"]]),
    };

    const { adsetRows, campaignRows } = rollUpToAdsetAndCampaign(adRows, hierarchy);

    expect(summarizeWindow(adsetRows.get("adset1")!).spend).toBeCloseTo(80);
    expect(summarizeWindow(campaignRows.get("campaign1")!).spend).toBeCloseTo(80);
  });
});

describe("shareOfSpend", () => {
  it("calcula a fração do spend do pai", () => {
    expect(shareOfSpend(30, 100)).toBeCloseTo(0.3);
  });

  it("retorna null quando o pai não tem spend", () => {
    expect(shareOfSpend(30, 0)).toBeNull();
  });
});

describe("isSpendAnomaly", () => {
  it("detecta spend > 2 desvios-padrão da média", () => {
    const history = Array.from({ length: 30 }, () => 100);
    expect(isSpendAnomaly(history, 100)).toBe(false);
    expect(isSpendAnomaly(history, 500)).toBe(true);
  });

  it("retorna false quando não há histórico ou desvio-padrão zero sem variação", () => {
    expect(isSpendAnomaly([], 100)).toBe(false);
    expect(isSpendAnomaly([100, 100, 100], 100)).toBe(false);
  });
});
