import { describe, expect, it } from "vitest";
import { resolveAttribution, type AttributionContext, type KnownEntity, type ResolvedTouch } from "@/lib/attribution/cascade";

const CAMPAIGN: KnownEntity = { level: "campaign", metaId: "c1" };
const ADSET: KnownEntity = { level: "adset", metaId: "as1", parentMetaId: "c1" };
const AD: KnownEntity = { level: "ad", metaId: "ad1", parentMetaId: "as1" };
const KNOWN_ENTITIES = [CAMPAIGN, ADSET, AD];

function context(overrides: Partial<AttributionContext> = {}): AttributionContext {
  return { knownEntities: KNOWN_ENTITIES, priorTouches: [], ...overrides };
}

describe("resolveAttribution — nível 1 (click_id)", () => {
  it("resolve via fbclid reaproveitando touch anterior já atribuído", () => {
    const priorTouches: ResolvedTouch[] = [
      { fbclid: "fb123", entityLevel: "ad", entityMetaId: "ad1", occurredAt: "2026-01-01T10:00:00Z" },
    ];
    const match = resolveAttribution(
      { attributionHints: { fbclid: "fb123" }, occurredAt: "2026-01-05T10:00:00Z" },
      context({ priorTouches }),
    );
    expect(match).toEqual({
      entityLevel: "ad",
      entityMetaId: "ad1",
      method: "click_id",
      confidence: "exact",
      touchOccurredAt: "2026-01-01T10:00:00Z",
      lagDays: 4,
    });
  });

  it("ignora touch com fbclid igual mas ocorrido DEPOIS do evento", () => {
    const priorTouches: ResolvedTouch[] = [
      { fbclid: "fb123", entityLevel: "ad", entityMetaId: "ad1", occurredAt: "2026-01-10T10:00:00Z" },
    ];
    const match = resolveAttribution(
      { attributionHints: { fbclid: "fb123" }, occurredAt: "2026-01-05T10:00:00Z" },
      context({ priorTouches }),
    );
    expect(match).toBeNull();
  });

  it("escolhe o touch mais recente quando há múltiplos com o mesmo fbclid", () => {
    const priorTouches: ResolvedTouch[] = [
      { fbclid: "fb123", entityLevel: "ad", entityMetaId: "ad1", occurredAt: "2026-01-01T10:00:00Z" },
      { fbclid: "fb123", entityLevel: "ad", entityMetaId: "ad1", occurredAt: "2026-01-03T10:00:00Z" },
    ];
    const match = resolveAttribution(
      { attributionHints: { fbclid: "fb123" }, occurredAt: "2026-01-05T10:00:00Z" },
      context({ priorTouches }),
    );
    expect(match?.touchOccurredAt).toBe("2026-01-03T10:00:00Z");
  });
});

describe("resolveAttribution — nível 2 (utm)", () => {
  it("resolve ao nível de ad via utm_content = ad_id (convenção 3.3)", () => {
    const match = resolveAttribution(
      { attributionHints: { utm_campaign: "c1", utm_content: "ad1" }, occurredAt: "2026-01-05T10:00:00Z" },
      context(),
    );
    expect(match).toEqual({
      entityLevel: "ad",
      entityMetaId: "ad1",
      method: "utm",
      confidence: "high",
      touchOccurredAt: null,
      lagDays: null,
    });
  });

  it("prioriza meta_ad_id explícito sobre utm_content quando ambos presentes", () => {
    const otherAd: KnownEntity = { level: "ad", metaId: "ad2", parentMetaId: "as1" };
    const match = resolveAttribution(
      { attributionHints: { meta_ad_id: "ad2", utm_content: "ad1" }, occurredAt: "2026-01-05T10:00:00Z" },
      context({ knownEntities: [...KNOWN_ENTITIES, otherAd] }),
    );
    expect(match?.entityMetaId).toBe("ad2");
  });

  it("rejeita ad cujo utm_campaign contradiz a campanha ancestral real", () => {
    const match = resolveAttribution(
      { attributionHints: { utm_campaign: "campanha-errada", utm_content: "ad1" }, occurredAt: "2026-01-05T10:00:00Z" },
      context(),
    );
    expect(match).toBeNull();
  });

  it("resolve ao nível de campanha quando só utm_campaign está presente", () => {
    const match = resolveAttribution(
      { attributionHints: { utm_campaign: "c1" }, occurredAt: "2026-01-05T10:00:00Z" },
      context(),
    );
    expect(match).toEqual({
      entityLevel: "campaign",
      entityMetaId: "c1",
      method: "utm",
      confidence: "high",
      touchOccurredAt: null,
      lagDays: null,
    });
  });

  it("retorna null quando o utm não bate com nenhuma entidade conhecida", () => {
    const match = resolveAttribution(
      { attributionHints: { utm_campaign: "inexistente" }, occurredAt: "2026-01-05T10:00:00Z" },
      context(),
    );
    expect(match).toBeNull();
  });
});

describe("resolveAttribution — nível 3 (identity_window)", () => {
  it("liga evento sem hints a um touch anterior do mesmo contato (email_hash) dentro da janela", () => {
    const priorTouches: ResolvedTouch[] = [
      {
        contactRef: { email_hash: "abc123" },
        entityLevel: "adset",
        entityMetaId: "as1",
        occurredAt: "2026-01-01T10:00:00Z",
      },
    ];
    const match = resolveAttribution(
      { contactRef: { email_hash: "abc123" }, occurredAt: "2026-01-31T10:00:00Z" },
      context({ priorTouches }),
    );
    expect(match).toEqual({
      entityLevel: "adset",
      entityMetaId: "as1",
      method: "identity_window",
      confidence: "high",
      touchOccurredAt: "2026-01-01T10:00:00Z",
      lagDays: 30,
    });
  });

  it("não atribui fora da janela de lookback (default 180 dias)", () => {
    const priorTouches: ResolvedTouch[] = [
      {
        contactRef: { email_hash: "abc123" },
        entityLevel: "adset",
        entityMetaId: "as1",
        occurredAt: "2025-01-01T10:00:00Z",
      },
    ];
    const match = resolveAttribution(
      { contactRef: { email_hash: "abc123" }, occurredAt: "2026-01-05T10:00:00Z" },
      context({ priorTouches }),
    );
    expect(match).toBeNull();
  });

  it("respeita identityWindowDays customizado", () => {
    const priorTouches: ResolvedTouch[] = [
      {
        contactRef: { phone_hash: "xyz" },
        entityLevel: "campaign",
        entityMetaId: "c1",
        occurredAt: "2026-01-01T10:00:00Z",
      },
    ];
    const match = resolveAttribution(
      { contactRef: { phone_hash: "xyz" }, occurredAt: "2026-01-10T10:00:00Z" },
      context({ priorTouches, identityWindowDays: 5 }),
    );
    expect(match).toBeNull();
  });

  it("não atribui a contato diferente (hash não bate)", () => {
    const priorTouches: ResolvedTouch[] = [
      {
        contactRef: { email_hash: "outro-contato" },
        entityLevel: "adset",
        entityMetaId: "as1",
        occurredAt: "2026-01-01T10:00:00Z",
      },
    ];
    const match = resolveAttribution(
      { contactRef: { email_hash: "abc123" }, occurredAt: "2026-01-05T10:00:00Z" },
      context({ priorTouches }),
    );
    expect(match).toBeNull();
  });
});

describe("resolveAttribution — ordem da cascata e ausência de match", () => {
  it("prioriza click_id sobre utm quando ambos casariam", () => {
    const priorTouches: ResolvedTouch[] = [
      { fbclid: "fb123", entityLevel: "adset", entityMetaId: "as1", occurredAt: "2026-01-01T10:00:00Z" },
    ];
    const match = resolveAttribution(
      { attributionHints: { fbclid: "fb123", utm_content: "ad1" }, occurredAt: "2026-01-05T10:00:00Z" },
      context({ priorTouches }),
    );
    expect(match?.method).toBe("click_id");
    expect(match?.entityLevel).toBe("adset");
  });

  it("retorna null quando nenhum nível casa", () => {
    const match = resolveAttribution({ occurredAt: "2026-01-05T10:00:00Z" }, context());
    expect(match).toBeNull();
  });
});
