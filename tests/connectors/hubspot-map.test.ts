import { describe, expect, it } from "vitest";
import { createHash, createHmac } from "node:crypto";
import {
  buildDealStageIndex,
  contactAttributionHints,
  hashIdentity,
  mapContact,
  mapDeal,
  mapMeeting,
  parseFirstUrlHints,
} from "@/lib/connectors/hubspot/map";
import {
  classifyWebhookEvent,
  computeHubspotV3Signature,
  verifyHubspotV3Signature,
} from "@/lib/connectors/hubspot/webhook";

const PORTAL = "424242";

describe("hashIdentity", () => {
  it("normaliza (trim + lowercase) antes do sha256", () => {
    const expected = createHash("sha256").update("ana@loja.com.br").digest("hex");
    expect(hashIdentity("  Ana@Loja.com.BR ")).toBe(expected);
  });

  it("retorna undefined para vazio/null", () => {
    expect(hashIdentity("")).toBeUndefined();
    expect(hashIdentity("   ")).toBeUndefined();
    expect(hashIdentity(null)).toBeUndefined();
  });
});

describe("parseFirstUrlHints", () => {
  it("extrai fbclid, UTMs e landing_page da primeira URL vista", () => {
    const hints = parseFirstUrlHints(
      "https://loja.com.br/promo?fbclid=abc123&utm_source=facebook&utm_medium=cpc&utm_campaign=120210&utm_content=120211&x=1",
    );
    expect(hints.fbclid).toBe("abc123");
    expect(hints.utm_source).toBe("facebook");
    expect(hints.utm_campaign).toBe("120210");
    expect(hints.utm_content).toBe("120211");
    expect(hints.landing_page).toBe("https://loja.com.br/promo");
    expect(hints.gclid).toBeUndefined();
  });

  it("URL inválida ou ausente vira objeto vazio", () => {
    expect(parseFirstUrlHints("nao-e-url")).toEqual({});
    expect(parseFirstUrlHints(null)).toEqual({});
  });
});

describe("contactAttributionHints", () => {
  it("propriedade explícita (snippet) tem prioridade sobre o parse da URL", () => {
    const hints = contactAttributionHints({
      hs_analytics_first_url: "https://loja.com.br/?fbclid=da_url&utm_source=da_url",
      fbclid: "do_snippet",
      utm_source: "facebook",
    });
    expect(hints.fbclid).toBe("do_snippet");
    expect(hints.utm_source).toBe("facebook");
    expect(hints.landing_page).toBe("https://loja.com.br/");
  });
});

describe("mapContact", () => {
  const base = {
    id: "301",
    properties: {
      createdate: "2026-07-01T12:00:00Z",
      lastmodifieddate: "2026-07-10T09:00:00Z",
      email: "Ana@Loja.com.br",
      lifecyclestage: "lead",
      hs_analytics_first_url: "https://loja.com.br/?fbclid=xyz",
    },
  };

  it("emite lead_created com hash de email e hints — nunca PII bruta", () => {
    const events = mapContact(PORTAL, base);
    expect(events).toHaveLength(1);
    const [created] = events;
    expect(created.eventType).toBe("lead_created");
    expect(created.externalId).toBe(`hs:${PORTAL}:contact:301:created`);
    expect(created.occurredAt).toBe("2026-07-01T12:00:00Z");
    expect(created.contactRef?.email_hash).toBe(hashIdentity("ana@loja.com.br"));
    expect(created.contactRef?.external_contact_id).toBe("hubspot:301");
    expect(created.attributionHints?.fbclid).toBe("xyz");
    expect(JSON.stringify(created.raw)).not.toContain("Ana@Loja.com.br");
  });

  it("lifecycle stage qualificado emite também lead_qualified", () => {
    const events = mapContact(PORTAL, {
      ...base,
      properties: { ...base.properties, lifecyclestage: "salesqualifiedlead" },
    });
    expect(events.map((e) => e.eventType)).toEqual(["lead_created", "lead_qualified"]);
    expect(events[1].externalId).toBe(`hs:${PORTAL}:contact:301:qualified`);
    expect(events[1].occurredAt).toBe("2026-07-10T09:00:00Z");
  });

  it("sem createdate não emite nada (payload malformado)", () => {
    expect(mapContact(PORTAL, { id: "1", properties: {} })).toEqual([]);
  });
});

describe("buildDealStageIndex + mapDeal", () => {
  const stageIndex = buildDealStageIndex([
    {
      stages: [
        { id: "appointment", label: "Reunião", metadata: { isClosed: "false", probability: "0.2" } },
        { id: "closedwon", label: "Ganho", metadata: { isClosed: "true", probability: "1.0" } },
        { id: "closedlost", label: "Perdido", metadata: { isClosed: "true", probability: "0.0" } },
      ],
    },
  ]);

  const baseDeal = {
    id: "9001",
    properties: {
      createdate: "2026-06-20T10:00:00Z",
      hs_lastmodifieddate: "2026-07-05T10:00:00Z",
      dealname: "Contrato Anual",
      amount: "1500.50",
      deal_currency_code: "BRL",
      dealstage: "appointment",
      pipeline: "default",
      closedate: "2026-07-05T10:00:00Z",
    },
  };

  it("classifica won/lost pela convenção isClosed+probability", () => {
    expect(stageIndex.closedwon).toMatchObject({ won: true, lost: false });
    expect(stageIndex.closedlost).toMatchObject({ won: false, lost: true });
    expect(stageIndex.appointment).toMatchObject({ won: false, lost: false });
  });

  it("estágio aberto emite só deal_created com valor e contato associado", () => {
    const events = mapDeal(PORTAL, baseDeal, stageIndex, ["301"]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "deal_created",
      externalId: `hs:${PORTAL}:deal:9001:created`,
      monetaryValue: 1500.5,
      currency: "BRL",
    });
    expect(events[0].contactRef?.external_contact_id).toBe("hubspot:301");
  });

  it("estágio closed-won emite deal_won no closedate", () => {
    const events = mapDeal(
      PORTAL,
      { ...baseDeal, properties: { ...baseDeal.properties, dealstage: "closedwon" } },
      stageIndex,
    );
    expect(events.map((e) => e.eventType)).toEqual(["deal_created", "deal_won"]);
    expect(events[1].externalId).toBe(`hs:${PORTAL}:deal:9001:won`);
    expect(events[1].occurredAt).toBe("2026-07-05T10:00:00Z");
  });

  it("estágio closed-lost emite deal_lost", () => {
    const events = mapDeal(
      PORTAL,
      { ...baseDeal, properties: { ...baseDeal.properties, dealstage: "closedlost" } },
      stageIndex,
    );
    expect(events.map((e) => e.eventType)).toEqual(["deal_created", "deal_lost"]);
  });

  it("amount ausente vira monetary_value null", () => {
    const events = mapDeal(
      PORTAL,
      { ...baseDeal, properties: { ...baseDeal.properties, amount: "" } },
      stageIndex,
    );
    expect(events[0].monetaryValue).toBeNull();
  });
});

describe("mapMeeting", () => {
  const meeting = {
    id: "555",
    properties: {
      hs_createdate: "2026-07-01T08:00:00Z",
      hs_lastmodifieddate: "2026-07-02T08:00:00Z",
      hs_meeting_start_time: "2026-07-03T14:00:00Z",
      hs_meeting_end_time: "2026-07-03T15:00:00Z",
      hs_meeting_outcome: "SCHEDULED",
    },
  };

  it("emite meeting_scheduled no horário da reunião", () => {
    const events = mapMeeting(PORTAL, meeting, ["301"]);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      eventType: "meeting_scheduled",
      externalId: `hs:${PORTAL}:meeting:555:scheduled`,
      occurredAt: "2026-07-03T14:00:00Z",
    });
  });

  it("outcome COMPLETED adiciona meeting_held", () => {
    const events = mapMeeting(PORTAL, {
      ...meeting,
      properties: { ...meeting.properties, hs_meeting_outcome: "COMPLETED" },
    });
    expect(events.map((e) => e.eventType)).toEqual(["meeting_scheduled", "meeting_held"]);
    expect(events[1].occurredAt).toBe("2026-07-03T15:00:00Z");
  });
});

describe("assinatura v3 do webhook", () => {
  const secret = "app-client-secret";
  const uri = "https://copiloto.app/api/hooks/hubspot";
  const body = JSON.stringify([{ portalId: 424242, subscriptionType: "deal.creation", objectId: 1 }]);

  function sign(timestamp: string): string {
    return createHmac("sha256", secret).update(`POST${uri}${body}${timestamp}`, "utf8").digest("base64");
  }

  it("aceita assinatura correta dentro da janela de 5 min", () => {
    const timestamp = String(Date.now());
    expect(computeHubspotV3Signature(secret, "POST", uri, body, timestamp)).toBe(sign(timestamp));
    expect(
      verifyHubspotV3Signature({
        clientSecret: secret,
        method: "POST",
        uri,
        rawBody: body,
        timestamp,
        signature: sign(timestamp),
      }),
    ).toBe(true);
  });

  it("rejeita assinatura errada, timestamp velho e headers ausentes", () => {
    const timestamp = String(Date.now());
    const base = { clientSecret: secret, method: "POST", uri, rawBody: body };
    expect(verifyHubspotV3Signature({ ...base, timestamp, signature: "invalida" })).toBe(false);
    const stale = String(Date.now() - 6 * 60 * 1000);
    expect(verifyHubspotV3Signature({ ...base, timestamp: stale, signature: sign(stale) })).toBe(false);
    expect(verifyHubspotV3Signature({ ...base, timestamp: null, signature: sign(timestamp) })).toBe(false);
    expect(verifyHubspotV3Signature({ ...base, timestamp, signature: null })).toBe(false);
  });
});

describe("classifyWebhookEvent", () => {
  it("cobre os formatos legado e novo, filtrando propriedades irrelevantes", () => {
    expect(classifyWebhookEvent({ subscriptionType: "contact.creation", objectId: 1 })).toBe("contact");
    expect(classifyWebhookEvent({ subscriptionType: "deal.creation", objectId: 1 })).toBe("deal");
    expect(
      classifyWebhookEvent({ subscriptionType: "deal.propertyChange", objectId: 1, propertyName: "dealstage" }),
    ).toBe("deal");
    expect(
      classifyWebhookEvent({ subscriptionType: "deal.propertyChange", objectId: 1, propertyName: "amount" }),
    ).toBeNull();
    expect(
      classifyWebhookEvent({
        subscriptionType: "contact.propertyChange",
        objectId: 1,
        propertyName: "lifecyclestage",
      }),
    ).toBe("contact");
    expect(
      classifyWebhookEvent({ subscriptionType: "object.creation", objectId: 1, objectTypeId: "0-3" }),
    ).toBe("deal");
    expect(
      classifyWebhookEvent({
        subscriptionType: "object.propertyChange",
        objectId: 1,
        objectTypeId: "0-1",
        propertyName: "lifecyclestage",
      }),
    ).toBe("contact");
    expect(classifyWebhookEvent({ subscriptionType: "contact.deletion", objectId: 1 })).toBeNull();
    expect(classifyWebhookEvent({ subscriptionType: "deal.creation" })).toBeNull();
  });
});
