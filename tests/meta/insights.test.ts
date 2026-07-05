import { describe, expect, it, vi } from "vitest";
import { MetaClient } from "@/lib/meta/client";
import { fetchDailyAdInsights, toAdInsightRow } from "@/lib/meta/insights";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("toAdInsightRow", () => {
  it("deriva conversions/conversionValue/cpa/roas a partir de actions/action_values (proxy genérico)", () => {
    const row = toAdInsightRow({
      ad_id: "ad1",
      adset_id: "as1",
      campaign_id: "c1",
      date_start: "2026-07-01",
      spend: "100",
      impressions: "1000",
      clicks: "20",
      actions: [{ action_type: "purchase", value: "2" }],
      action_values: [{ action_type: "purchase", value: "400" }],
    });

    expect(row.conversions).toBe(2);
    expect(row.conversionValue).toBe(400);
    expect(row.cpa).toBeCloseTo(50);
    expect(row.roas).toBeCloseTo(4);
  });

  it("prioriza purchase sobre lead quando ambos existem", () => {
    const row = toAdInsightRow({
      ad_id: "ad1",
      date_start: "2026-07-01",
      spend: "100",
      actions: [
        { action_type: "lead", value: "5" },
        { action_type: "purchase", value: "1" },
      ],
      action_values: [{ action_type: "purchase", value: "300" }],
    });

    expect(row.conversions).toBe(1);
    expect(row.conversionValue).toBe(300);
  });

  it("retorna conversions=0 e cpa/roas=null quando nenhum action_type reconhecido existe", () => {
    const row = toAdInsightRow({
      ad_id: "ad1",
      date_start: "2026-07-01",
      spend: "100",
      actions: [{ action_type: "video_view", value: "50" }],
    });

    expect(row.conversions).toBe(0);
    expect(row.cpa).toBeNull();
    expect(row.roas).toBeNull();
  });
});

describe("fetchDailyAdInsights", () => {
  it("pagina internamente até esgotar os cursores", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          data: [{ ad_id: "ad1", date_start: "2026-07-01", spend: "10" }],
          paging: { cursors: { after: "C2" }, next: "https://graph.facebook.com/next" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ data: [{ ad_id: "ad2", date_start: "2026-07-01", spend: "20" }] }),
      );

    const client = new MetaClient({ accessToken: "token", fetchImpl });
    const rows = await fetchDailyAdInsights(client, "123", "2026-06-24", "2026-07-01");

    expect(rows).toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
