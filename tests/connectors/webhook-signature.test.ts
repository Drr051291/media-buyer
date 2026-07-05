import { describe, expect, it } from "vitest";
import { computeWebhookSignature, verifyWebhookSignature } from "@/lib/connectors/webhook-signature";

describe("computeWebhookSignature / verifyWebhookSignature", () => {
  it("verifica uma assinatura válida", () => {
    const secret = "segredo-do-webhook";
    const body = JSON.stringify({ external_id: "1", event_type: "order_paid" });
    const signature = computeWebhookSignature(secret, body);

    expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(verifyWebhookSignature(secret, body, signature)).toBe(true);
  });

  it("rejeita assinatura de outro segredo", () => {
    const body = JSON.stringify({ external_id: "1" });
    const signature = computeWebhookSignature("segredo-a", body);
    expect(verifyWebhookSignature("segredo-b", body, signature)).toBe(false);
  });

  it("rejeita quando o corpo muda (adulteração)", () => {
    const secret = "segredo-do-webhook";
    const signature = computeWebhookSignature(secret, JSON.stringify({ external_id: "1" }));
    expect(verifyWebhookSignature(secret, JSON.stringify({ external_id: "2" }), signature)).toBe(false);
  });

  it("rejeita quando a assinatura está ausente", () => {
    expect(verifyWebhookSignature("segredo", "{}", null)).toBe(false);
  });

  it("rejeita assinatura de tamanho diferente sem lançar exceção", () => {
    expect(verifyWebhookSignature("segredo", "{}", "sha256=curta")).toBe(false);
  });
});
