import { describe, expect, it } from "vitest";
import { WebhookPayloadSchema, toCanonicalEvent, type WebhookEventInput } from "@/lib/connectors/webhook-payload";

describe("WebhookPayloadSchema", () => {
  it("aceita um único evento válido", () => {
    const result = WebhookPayloadSchema.safeParse({
      external_id: "deal-123",
      event_type: "deal_won",
      occurred_at: "2026-01-01T10:00:00Z",
      monetary_value: 1000,
    });
    expect(result.success).toBe(true);
  });

  it("aceita um array de eventos", () => {
    const result = WebhookPayloadSchema.safeParse([
      { external_id: "1", event_type: "lead_created", occurred_at: "2026-01-01T10:00:00Z" },
      { external_id: "2", event_type: "order_paid", occurred_at: 1735725600000 },
    ]);
    expect(result.success).toBe(true);
  });

  it("rejeita event_type desconhecido", () => {
    const result = WebhookPayloadSchema.safeParse({
      external_id: "1",
      event_type: "something_else",
      occurred_at: "2026-01-01T10:00:00Z",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita evento sem external_id", () => {
    const result = WebhookPayloadSchema.safeParse({
      event_type: "lead_created",
      occurred_at: "2026-01-01T10:00:00Z",
    });
    expect(result.success).toBe(false);
  });
});

describe("toCanonicalEvent", () => {
  it("normaliza occurred_at (epoch ms) para ISO", () => {
    const parsed = WebhookPayloadSchema.parse({
      external_id: "1",
      event_type: "order_paid",
      occurred_at: 1735725600000,
    });
    const canonical = toCanonicalEvent(parsed as WebhookEventInput);
    expect(canonical.occurredAt).toBe(new Date(1735725600000).toISOString());
  });

  it("lança erro para occurred_at inválido", () => {
    const parsed = WebhookPayloadSchema.parse({
      external_id: "1",
      event_type: "order_paid",
      occurred_at: "não é uma data",
    });
    expect(() => toCanonicalEvent(parsed as WebhookEventInput)).toThrow();
  });

  it("preserva attribution_hints e contact_ref", () => {
    const parsed = WebhookPayloadSchema.parse({
      external_id: "1",
      event_type: "lead_created",
      occurred_at: "2026-01-01T10:00:00Z",
      contact_ref: { email_hash: "abc123" },
      attribution_hints: { utm_campaign: "120001", utm_content: "120002" },
    });
    const canonical = toCanonicalEvent(parsed as WebhookEventInput);
    expect(canonical.contactRef).toEqual({ email_hash: "abc123" });
    expect(canonical.attributionHints).toEqual({ utm_campaign: "120001", utm_content: "120002" });
  });
});
