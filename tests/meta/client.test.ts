import { describe, expect, it, vi } from "vitest";
import { MetaClient, MetaApiError } from "@/lib/meta/client";

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

describe("MetaClient", () => {
  it("retorna dados em uma chamada GET bem-sucedida", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: [{ id: "act_1" }] }));
    const client = new MetaClient({ accessToken: "token", fetchImpl });

    const result = await client.get<{ data: unknown[] }>("me/adaccounts");

    expect(result.data).toHaveLength(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("faz retry com backoff em erro retryable (code=4) e depois sucede", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ error: { code: 4, message: "Too many calls" } }, { status: 400 }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: [] }));

    const sleepImpl = vi.fn().mockResolvedValue(undefined);
    const client = new MetaClient({ accessToken: "token", fetchImpl, sleepImpl, maxRetries: 3 });

    const result = await client.get<{ data: unknown[] }>("me/adaccounts");

    expect(result.data).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleepImpl).toHaveBeenCalledTimes(1);
  });

  it("lança MetaApiError quando o erro não é retryable", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: { code: 190, message: "Invalid token" } }, { status: 401 }));
    const client = new MetaClient({ accessToken: "token", fetchImpl });

    await expect(client.get("me/adaccounts")).rejects.toBeInstanceOf(MetaApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("desiste após maxRetries e propaga o erro", async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementation(async () =>
        jsonResponse({ error: { code: 17, message: "Rate limit" } }, { status: 400 }),
      );
    const sleepImpl = vi.fn().mockResolvedValue(undefined);
    const client = new MetaClient({ accessToken: "token", fetchImpl, sleepImpl, maxRetries: 2 });

    await expect(client.get("me/adaccounts")).rejects.toBeInstanceOf(MetaApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(3); // tentativa inicial + 2 retries
  });

  it("expõe isPaused quando a utilização de rate limit passa de 80%", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(
        { data: [] },
        { headers: { "x-fb-ads-insights-throttle": JSON.stringify({ acc_id_util_pct: 95 }) } },
      ),
    );
    const client = new MetaClient({ accessToken: "token", fetchImpl });

    await client.get("me/adaccounts");

    expect(client.isPaused).toBe(true);
  });

  it("respeita o limite de 50 chamadas na batch API", async () => {
    const fetchImpl = vi.fn();
    const client = new MetaClient({ accessToken: "token", fetchImpl });
    const calls = Array.from({ length: 51 }, (_, i) => ({ relativeUrl: `act_${i}` }));

    await expect(client.batch(calls)).rejects.toThrow(/máximo 50/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("notifica onUsageUpdate a cada resposta", async () => {
    const onUsageUpdate = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(
        { data: [] },
        { headers: { "x-fb-ads-insights-throttle": JSON.stringify({ acc_id_util_pct: 10 }) } },
      ),
    );
    const client = new MetaClient({ accessToken: "token", fetchImpl, onUsageUpdate });

    await client.get("me/adaccounts");

    expect(onUsageUpdate).toHaveBeenCalledTimes(1);
    expect(onUsageUpdate.mock.calls[0][0].accountUsagePct).toBe(10);
  });
});
