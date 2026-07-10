import { describe, expect, it } from "vitest";
import {
  buildRunReportRequest,
  normalizeGa4Date,
  normalizeReport,
  GA4_DIMENSIONS,
  GA4_METRICS,
  type RunReportResponseLike,
} from "@/lib/connectors/ga4/report";

describe("buildRunReportRequest", () => {
  it("monta dimensoes, metricas e janela de datas", () => {
    const req = buildRunReportRequest({
      propertyId: "properties/123",
      startDate: "2026-07-01",
      endDate: "2026-07-08",
      offset: 100,
    });
    expect(req.property).toBe("properties/123");
    expect(req.dateRanges).toEqual([{ startDate: "2026-07-01", endDate: "2026-07-08" }]);
    expect(req.dimensions.map((d) => d.name)).toEqual([...GA4_DIMENSIONS]);
    expect(req.metrics.map((m) => m.name)).toEqual([...GA4_METRICS]);
    expect(req.offset).toBe(100);
  });
});

describe("normalizeGa4Date", () => {
  it("converte YYYYMMDD do GA4 para YYYY-MM-DD", () => {
    expect(normalizeGa4Date("20260708")).toBe("2026-07-08");
  });
  it("mantem uma data ja formatada", () => {
    expect(normalizeGa4Date("2026-07-08")).toBe("2026-07-08");
  });
});

// Resposta ordenada como as headers do request; normalizeReport mapeia por nome,
// nao por posicao, entao aqui embaralhamos de proposito para provar robustez.
const response: RunReportResponseLike = {
  dimensionHeaders: [
    { name: "deviceCategory" },
    { name: "date" },
    { name: "sessionSource" },
    { name: "sessionMedium" },
    { name: "sessionCampaignName" },
    { name: "landingPage" },
  ],
  metricHeaders: [
    { name: "sessions" },
    { name: "engagedSessions" },
    { name: "engagementRate" },
    { name: "conversions" },
    { name: "eventCount" },
    { name: "purchaseRevenue" },
    { name: "transactions" },
  ],
  rows: [
    {
      dimensionValues: [
        { value: "mobile" },
        { value: "20260708" },
        { value: "facebook" },
        { value: "cpc" },
        { value: "campanha_x" },
        { value: "/lp" },
      ],
      metricValues: [
        { value: "340" },
        { value: "300" },
        { value: "0.88" },
        { value: "12" },
        { value: "980" },
        { value: "4200.5" },
        { value: "12" },
      ],
    },
    {
      // dimensao vazia deve virar '(not set)', nunca NULL/'' (senao o UNIQUE quebra)
      dimensionValues: [
        { value: "desktop" },
        { value: "20260708" },
        { value: "" },
        { value: null },
        { value: undefined },
        { value: "/" },
      ],
      metricValues: [
        { value: "10" },
        { value: "5" },
        { value: "" },
        { value: "0" },
        { value: "20" },
        { value: "0" },
        { value: "0" },
      ],
    },
  ],
  rowCount: 2,
};

describe("normalizeReport", () => {
  const rows = normalizeReport(response);

  it("mapeia metricas e dimensoes por nome mesmo desordenadas", () => {
    expect(rows[0]).toEqual({
      date: "2026-07-08",
      session_source: "facebook",
      session_medium: "cpc",
      session_campaign: "campanha_x",
      landing_page: "/lp",
      device_category: "mobile",
      sessions: 340,
      engaged_sessions: 300,
      engagement_rate: 0.88,
      conversions: 12,
      event_count: 980,
      purchase_revenue: 4200.5,
      transactions: 12,
    });
  });

  it("normaliza dimensao vazia/null/undefined para (not set)", () => {
    expect(rows[1].session_source).toBe("(not set)");
    expect(rows[1].session_medium).toBe("(not set)");
    expect(rows[1].session_campaign).toBe("(not set)");
  });

  it("engagement_rate vazio vira null; metricas numericas viram 0", () => {
    expect(rows[1].engagement_rate).toBeNull();
    expect(rows[1].conversions).toBe(0);
    expect(rows[1].purchase_revenue).toBe(0);
  });

  it("lida com resposta sem linhas", () => {
    expect(normalizeReport({ rows: [] })).toEqual([]);
    expect(normalizeReport({})).toEqual([]);
  });
});
