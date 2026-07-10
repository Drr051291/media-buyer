import { describe, it, expect } from "vitest";
import {
  MICROS,
  microsToUnit,
  unitToMicros,
  normalizeEntityRow,
  normalizeInsightRow,
} from "@/lib/providers/google-ads/gaql";

/**
 * Teste obrigatório (ETAPA3GOOGLEADS BLOCO 3 / regra global 5): a normalização
 * de `micros` é o bug nº1 do Google Ads. Errar o ÷1e6 infla o spend em 1 milhão
 * de vezes — catastrófico e silencioso.
 */
describe("google-ads micros normalization", () => {
  it("converte cost_micros para a unidade da moeda (÷ 1.000.000)", () => {
    expect(microsToUnit(45_230_000)).toBeCloseTo(45.23, 6);
    expect(microsToUnit("100000000")).toBe(100); // R$ 100/dia
    expect(microsToUnit(0)).toBe(0);
  });

  it("é robusto a valores ausentes/inválidos", () => {
    expect(microsToUnit(null)).toBe(0);
    expect(microsToUnit(undefined)).toBe(0);
    expect(microsToUnit("abc")).toBe(0);
  });

  it("unitToMicros é o inverso para a escrita de budget (BLOCO 6)", () => {
    expect(unitToMicros(100)).toBe(100 * MICROS);
    expect(unitToMicros(45.23)).toBe(45_230_000);
    // round-trip sem drift de ponto flutuante
    expect(microsToUnit(unitToMicros(123.45))).toBeCloseTo(123.45, 6);
  });
});

describe("normalizeEntityRow", () => {
  it("campaign: mapeia budget de micros e não guarda o valor cru", () => {
    const e = normalizeEntityRow("campaign", {
      campaign: { id: "111", name: "Search BR", status: "ENABLED", advertising_channel_type: "SEARCH" },
      campaign_budget: { amount_micros: 50_000_000 },
    });
    expect(e).toMatchObject({
      level: "campaign",
      externalId: "111",
      parentExternalId: null,
      name: "Search BR",
      dailyBudget: 50,
    });
  });

  it("ad_group vira adset com parent = campaign.id", () => {
    const e = normalizeEntityRow("adset", {
      ad_group: { id: "222", name: "Grupo A", status: "ENABLED" },
      campaign: { id: "111" },
    });
    expect(e).toMatchObject({ level: "adset", externalId: "222", parentExternalId: "111" });
  });

  it("ad_group_ad vira ad com parent = ad_group.id", () => {
    const e = normalizeEntityRow("ad", {
      ad_group_ad: { ad: { id: "333", name: "" }, status: "ENABLED" },
      ad_group: { id: "222" },
    });
    expect(e).toMatchObject({ level: "ad", externalId: "333", parentExternalId: "222", name: "333" });
  });

  it("descarta linha sem id", () => {
    expect(normalizeEntityRow("campaign", { campaign: {} })).toBeNull();
  });
});

describe("normalizeInsightRow", () => {
  it("normaliza spend de micros; conversions pode ser fracionado; value não é micros", () => {
    const r = normalizeInsightRow({
      ad_group_ad: { ad: { id: "333" } },
      segments: { date: "2026-07-01" },
      metrics: {
        cost_micros: 12_500_000,
        impressions: "1000",
        clicks: "50",
        conversions: 1.5,
        conversions_value: 320.5,
      },
    });
    expect(r).toMatchObject({
      level: "ad",
      externalId: "333",
      date: "2026-07-01",
      spend: 12.5,
      impressions: 1000,
      clicks: 50,
      conversions: 1.5,
      conversionValue: 320.5,
    });
  });

  it("descarta linha sem ad id ou sem data", () => {
    expect(normalizeInsightRow({ segments: { date: "2026-07-01" } })).toBeNull();
    expect(normalizeInsightRow({ ad_group_ad: { ad: { id: "1" } } })).toBeNull();
  });
});
