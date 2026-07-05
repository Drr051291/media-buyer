import { describe, expect, it, vi } from "vitest";
import { MetaClient } from "@/lib/meta/client";
import { fetchEntitiesPage } from "@/lib/meta/entities";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchEntitiesPage", () => {
  it("mapeia campanhas para MetaEntity sem parentMetaId", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [{ id: "c1", name: "Campanha 1", status: "ACTIVE", objective: "SALES", daily_budget: "10000" }],
      }),
    );
    const client = new MetaClient({ accessToken: "token", fetchImpl });

    const page = await fetchEntitiesPage(client, "123", "campaign");

    expect(page.entities).toEqual([
      {
        level: "campaign",
        metaId: "c1",
        parentMetaId: null,
        name: "Campanha 1",
        status: "ACTIVE",
        objective: "SALES",
        dailyBudget: 100, // centavos -> unidade
        targetingSummary: {},
        creativeId: null,
      },
    ]);
    expect(page.nextAfter).toBeNull();
  });

  it("mapeia adsets com parentMetaId = campaign_id e resume o targeting", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          {
            id: "as1",
            name: "Adset 1",
            status: "ACTIVE",
            campaign_id: "c1",
            daily_budget: "5000",
            targeting: {
              age_min: 18,
              age_max: 45,
              genders: [1, 2],
              geo_locations: { countries: ["BR"] },
              interests: [{ id: "1" }, { id: "2" }],
            },
          },
        ],
      }),
    );
    const client = new MetaClient({ accessToken: "token", fetchImpl });

    const page = await fetchEntitiesPage(client, "123", "adset");

    expect(page.entities[0].parentMetaId).toBe("c1");
    expect(page.entities[0].targetingSummary).toEqual({
      age_min: 18,
      age_max: 45,
      genders: [1, 2],
      countries: ["BR"],
      interests_count: 2,
      custom_audiences_count: 0,
    });
  });

  it("mapeia ads com parentMetaId = adset_id e creativeId", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [{ id: "ad1", name: "Ad 1", adset_id: "as1", creative: { id: "cr1" } }],
      }),
    );
    const client = new MetaClient({ accessToken: "token", fetchImpl });

    const page = await fetchEntitiesPage(client, "123", "ad");

    expect(page.entities[0].parentMetaId).toBe("as1");
    expect(page.entities[0].creativeId).toBe("cr1");
  });

  it("expõe nextAfter quando há paginação", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [],
        paging: { cursors: { after: "CURSOR2" }, next: "https://graph.facebook.com/next" },
      }),
    );
    const client = new MetaClient({ accessToken: "token", fetchImpl });

    const page = await fetchEntitiesPage(client, "123", "campaign");
    expect(page.nextAfter).toBe("CURSOR2");
  });
});
