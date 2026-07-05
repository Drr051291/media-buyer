import { describe, expect, it, vi } from "vitest";
import { MetaClient } from "@/lib/meta/client";
import { fetchDailyBreakdownInsights, breakdownKey } from "@/lib/meta/breakdowns";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchDailyBreakdownInsights", () => {
  it("anexa dimension/dimensionValue a partir do campo de breakdown retornado", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          { ad_id: "ad1", date_start: "2026-07-01", spend: "10", publisher_platform: "facebook" },
          { ad_id: "ad1", date_start: "2026-07-01", spend: "5", publisher_platform: "instagram" },
        ],
      }),
    );
    const client = new MetaClient({ accessToken: "token", fetchImpl });

    const rows = await fetchDailyBreakdownInsights(client, "123", "publisher_platform", "2026-06-24", "2026-07-01");

    expect(rows).toHaveLength(2);
    expect(rows[0].dimension).toBe("publisher_platform");
    expect(rows[0].dimensionValue).toBe("facebook");
    expect(rows[1].dimensionValue).toBe("instagram");
  });

  it("usa 'unknown' quando o valor da dimensão vem ausente", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ data: [{ ad_id: "ad1", date_start: "2026-07-01", spend: "10" }] }));
    const client = new MetaClient({ accessToken: "token", fetchImpl });

    const rows = await fetchDailyBreakdownInsights(client, "123", "age", "2026-06-24", "2026-07-01");
    expect(rows[0].dimensionValue).toBe("unknown");
  });
});

describe("breakdownKey", () => {
  it("monta a chave 'dimension:value'", () => {
    expect(breakdownKey("publisher_platform", "facebook")).toBe("publisher_platform:facebook");
  });
});
