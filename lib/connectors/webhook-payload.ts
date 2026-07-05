import { z } from "zod";
import type { CanonicalEvent } from "./data-connector";

/**
 * Schema do webhook genérico de entrada (ETAPA2.md 2.3/2.4): o payload já
 * chega em formato aproximadamente canônico — o chamador (blueprint
 * Make/n8n, ou um sistema que já fala esse formato) monta os campos. O
 * wizard de mapeamento visual (Onda 2.3) é quem traduz de um formato
 * arbitrário para este; aqui só validamos o formato final.
 */

const EVENT_TYPES = [
  "lead_created",
  "lead_qualified",
  "lead_disqualified",
  "meeting_scheduled",
  "meeting_held",
  "deal_created",
  "deal_stage_changed",
  "deal_won",
  "deal_lost",
  "order_created",
  "order_paid",
  "order_refunded",
  "subscription_started",
  "subscription_churned",
] as const;

const AttributionHintsSchema = z
  .object({
    fbclid: z.string().optional(),
    gclid: z.string().optional(),
    utm_source: z.string().optional(),
    utm_medium: z.string().optional(),
    utm_campaign: z.string().optional(),
    utm_content: z.string().optional(),
    utm_term: z.string().optional(),
    landing_page: z.string().optional(),
    referrer: z.string().optional(),
    meta_ad_id: z.string().optional(),
    meta_adset_id: z.string().optional(),
    meta_campaign_id: z.string().optional(),
    ga4_session_id: z.string().optional(),
  })
  .default({});

const ContactRefSchema = z
  .object({
    email_hash: z.string().optional(),
    phone_hash: z.string().optional(),
    external_contact_id: z.string().optional(),
  })
  .default({});

const CanonicalEventItemSchema = z.object({
  sku: z.string(),
  qty: z.number(),
  price: z.number(),
});

/** occurred_at aceita ISO string ou epoch ms — normalizado em toCanonicalEvent. */
const OccurredAtSchema = z.union([z.string().min(1), z.number()]);

export const WebhookEventSchema = z.object({
  external_id: z.string().min(1),
  event_type: z.enum(EVENT_TYPES),
  occurred_at: OccurredAtSchema,
  monetary_value: z.number().nullable().optional(),
  cost_value: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  contact_ref: ContactRefSchema,
  attribution_hints: AttributionHintsSchema,
  items: z.array(CanonicalEventItemSchema).optional(),
  raw: z.unknown().optional(),
});

export const WebhookPayloadSchema = z.union([WebhookEventSchema, z.array(WebhookEventSchema)]);

export type WebhookEventInput = z.infer<typeof WebhookEventSchema>;

/** Converte um evento já validado pelo zod para CanonicalEvent, normalizando occurred_at para ISO. */
export function toCanonicalEvent(input: WebhookEventInput): CanonicalEvent {
  const occurredAtDate = new Date(input.occurred_at);
  if (Number.isNaN(occurredAtDate.getTime())) {
    throw new Error(`occurred_at inválido: ${String(input.occurred_at)}`);
  }

  return {
    externalId: input.external_id,
    eventType: input.event_type,
    occurredAt: occurredAtDate.toISOString(),
    monetaryValue: input.monetary_value ?? null,
    costValue: input.cost_value ?? null,
    currency: input.currency ?? null,
    contactRef: input.contact_ref,
    attributionHints: input.attribution_hints,
    items: input.items,
    raw: input.raw ?? input,
  };
}
