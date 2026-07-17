import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Assinatura v3 dos webhooks do HubSpot (ETAPA-HUBSPOT.md seção 5).
 * HubSpot envia X-HubSpot-Signature-v3 = base64(HMAC-SHA256(client_secret,
 * método + uri + corpo + timestamp)) e X-HubSpot-Request-Timestamp.
 * Funções puras (testáveis); o segredo é o HUBSPOT_CLIENT_SECRET do app.
 */

const MAX_TIMESTAMP_SKEW_MS = 5 * 60 * 1000; // regra do HubSpot: rejeitar > 5 min

export function computeHubspotV3Signature(
  clientSecret: string,
  method: string,
  uri: string,
  rawBody: string,
  timestamp: string,
): string {
  const source = `${method}${uri}${rawBody}${timestamp}`;
  return createHmac("sha256", clientSecret).update(source, "utf8").digest("base64");
}

export function verifyHubspotV3Signature(params: {
  clientSecret: string;
  method: string;
  uri: string;
  rawBody: string;
  timestamp: string | null;
  signature: string | null;
  nowMs?: number;
}): boolean {
  const { clientSecret, method, uri, rawBody, timestamp, signature } = params;
  if (!timestamp || !signature) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = params.nowMs ?? Date.now();
  if (Math.abs(now - ts) > MAX_TIMESTAMP_SKEW_MS) return false;

  const expected = computeHubspotV3Signature(clientSecret, method, uri, rawBody, timestamp);
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(signature);
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

/** Evento como chega no corpo do webhook (array de eventos por request). */
export interface HubspotWebhookEvent {
  eventId?: number;
  portalId?: number;
  subscriptionType?: string;
  objectId?: number;
  objectTypeId?: string;
  propertyName?: string;
  occurredAt?: number;
}

export type WebhookFetchKind = "contact" | "deal";

/**
 * Decide se um evento de webhook justifica buscar o objeto na API e
 * reprocessá-lo. Cobre os formatos legado (contact.creation, deal.creation,
 * deal.propertyChange) e novo (object.creation/propertyChange + objectTypeId
 * 0-1 contato / 0-3 deal). propertyChange só interessa para os campos que
 * mudam o estado canônico (dealstage / lifecyclestage).
 */
export function classifyWebhookEvent(event: HubspotWebhookEvent): WebhookFetchKind | null {
  const type = event.subscriptionType ?? "";
  if (!event.objectId) return null;

  if (type === "contact.creation") return "contact";
  if (type === "contact.propertyChange") {
    return event.propertyName === "lifecyclestage" ? "contact" : null;
  }
  if (type === "deal.creation") return "deal";
  if (type === "deal.propertyChange") {
    return event.propertyName === "dealstage" ? "deal" : null;
  }

  // Formato novo (generic webhook subscriptions): object.* + objectTypeId.
  if (type === "object.creation" || type === "object.propertyChange") {
    const isPropertyChange = type === "object.propertyChange";
    if (event.objectTypeId === "0-1") {
      return !isPropertyChange || event.propertyName === "lifecyclestage" ? "contact" : null;
    }
    if (event.objectTypeId === "0-3") {
      return !isPropertyChange || event.propertyName === "dealstage" ? "deal" : null;
    }
  }
  return null;
}
