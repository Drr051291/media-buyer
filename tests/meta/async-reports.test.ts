import { describe, expect, it, vi } from "vitest";
import { MetaClient } from "@/lib/meta/client";
import {
  submitAsyncInsightsJob,
  pollAsyncInsightsJob,
  fetchAsyncInsightsPage,
} from "@/lib/meta/async-reports";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("submitAsyncInsightsJob", () => {
  it("envia async=true e devolve o report_run_id", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ report_run_id: "run_123" }));
    const client = new MetaClient({ accessToken: "token", fetchImpl });

    const result = await submitAsyncInsightsJob(client, "123", "2026-04-01", "2026-07-01");

    expect(result.reportRunId).toBe("run_123");
    const [, init] = fetchImpl.mock.calls[0];
    expect(String(init.body)).toContain("async=true");
  });
});

describe("pollAsyncInsightsJob", () => {
  it("mapeia 'Job Completed' para status completed", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ async_status: "Job Completed", async_percent_completion: 100 }),
    );
    const client = new MetaClient({ accessToken: "token", fetchImpl });

    const progress = await pollAsyncInsightsJob(client, "run_123");
    expect(progress.status).toBe("completed");
    expect(progress.percentCompletion).toBe(100);
  });

  it("mapeia status intermediário para running", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({ async_status: "Job Running", async_percent_completion: 42 }),
    );
    const client = new MetaClient({ accessToken: "token", fetchImpl });

    const progress = await pollAsyncInsightsJob(client, "run_123");
    expect(progress.status).toBe("running");
  });

  it("mapeia 'Job Failed' para failed", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ async_status: "Job Failed" }));
    const client = new MetaClient({ accessToken: "token", fetchImpl });

    const progress = await pollAsyncInsightsJob(client, "run_123");
    expect(progress.status).toBe("failed");
  });
});

describe("fetchAsyncInsightsPage", () => {
  it("devolve UMA página e o cursor da próxima, sem paginar internamente", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [{ ad_id: "ad1", date_start: "2026-07-01", spend: "10" }],
        paging: { cursors: { after: "C2" }, next: "https://graph.facebook.com/next" },
      }),
    );
    const client = new MetaClient({ accessToken: "token", fetchImpl });

    const page = await fetchAsyncInsightsPage(client, "run_123");

    expect(page.rows).toHaveLength(1);
    expect(page.nextAfter).toBe("C2");
    expect(fetchImpl).toHaveBeenCalledTimes(1); // não pagina sozinho
  });

  it("nextAfter é null quando não há mais páginas", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: [] }));
    const client = new MetaClient({ accessToken: "token", fetchImpl });

    const page = await fetchAsyncInsightsPage(client, "run_123");
    expect(page.nextAfter).toBeNull();
  });
});
