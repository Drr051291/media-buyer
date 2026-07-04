import { afterEach, describe, expect, it, vi } from "vitest";
import { hasMinimumScope, hasWriteScope, validateToken } from "@/lib/meta/debug-token";

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

describe("hasMinimumScope / hasWriteScope", () => {
  it("aceita ads_read como escopo mínimo", () => {
    expect(hasMinimumScope(["ads_read"])).toBe(true);
    expect(hasMinimumScope(["business_management"])).toBe(false);
  });

  it("detecta escopo de escrita", () => {
    expect(hasWriteScope(["ads_read", "ads_management"])).toBe(true);
    expect(hasWriteScope(["ads_read"])).toBe(false);
  });
});

describe("validateToken", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mapeia a resposta do /debug_token para TokenHealth", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: {
            is_valid: true,
            scopes: ["ads_read", "ads_management"],
            expires_at: 0,
            issued_at: 1700000000,
            app_id: "123",
            user_id: "456",
          },
        }),
      ),
    );

    const health = await validateToken("fake-token");

    expect(health.isValid).toBe(true);
    expect(health.scopes).toEqual(["ads_read", "ads_management"]);
    expect(health.expiresAt).toBeNull(); // expires_at=0 => nunca expira
    expect(health.issuedAt).toBeInstanceOf(Date);
  });

  it("retorna isValid=false quando data está ausente", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));

    const health = await validateToken("fake-token");

    expect(health.isValid).toBe(false);
    expect(health.scopes).toEqual([]);
  });
});
