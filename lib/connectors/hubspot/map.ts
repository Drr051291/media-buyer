import { createHash } from "node:crypto";
import type {
  AttributionHints,
  CanonicalEvent,
  ContactRef,
} from "@/lib/connectors/data-connector";

/**
 * Mapeamento HubSpot -> modelo canônico (ETAPA-HUBSPOT.md). Funções puras e
 * testáveis, sem I/O — quem busca os objetos na API é o client/sync. O motor
 * nunca conhece "HubSpot": só lead/meeting/deal (ETAPA2.md 2.1).
 *
 * Idempotência: cada evento canônico tem external_id determinístico
 * `hs:{portalId}:{objeto}:{id}:{fase}` — reprocessar a mesma página do poll
 * (ou um retry de webhook) nunca duplica (UNIQUE(connector_id, external_id)).
 */

/** Propriedades pedidas à API por tipo de objeto (só o necessário — disciplina de payload). */
export const CONTACT_PROPERTIES = [
  "createdate",
  "lastmodifieddate",
  "email",
  "phone",
  "lifecyclestage",
  "hs_analytics_first_url",
  "hs_analytics_first_referrer",
  "hs_analytics_source",
  // Propriedades customizadas gravadas pelo nosso snippet de captura
  // (docs/tracking-snippet.md) via campos ocultos de formulário. Se não
  // existirem no portal, o HubSpot simplesmente as omite da resposta.
  "fbclid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

export const DEAL_PROPERTIES = [
  "createdate",
  "hs_lastmodifieddate",
  "dealname",
  "amount",
  "deal_currency_code",
  "dealstage",
  "pipeline",
  "closedate",
] as const;

export const MEETING_PROPERTIES = [
  "hs_createdate",
  "hs_lastmodifieddate",
  "hs_meeting_title",
  "hs_meeting_start_time",
  "hs_meeting_end_time",
  "hs_meeting_outcome",
] as const;

/** Objeto CRM cru como vem da API v3 (search/get). */
export interface HubspotObject {
  id: string;
  properties: Record<string, string | null | undefined>;
}

/** Índice dealstage -> won/lost, montado a partir de GET /crm/v3/pipelines/deals. */
export type DealStageIndex = Record<string, { won: boolean; lost: boolean; label: string }>;

interface PipelineStageLike {
  id?: string;
  label?: string;
  metadata?: { isClosed?: string | boolean; probability?: string | number };
}
interface PipelineLike {
  stages?: PipelineStageLike[];
}

/**
 * Constrói o índice de estágios a partir do payload de pipelines. Convenção
 * HubSpot: estágio fechado-ganho tem isClosed=true e probability=1.0;
 * fechado-perdido tem isClosed=true e probability=0.0.
 */
export function buildDealStageIndex(pipelines: PipelineLike[]): DealStageIndex {
  const index: DealStageIndex = {};
  for (const pipeline of pipelines) {
    for (const stage of pipeline.stages ?? []) {
      if (!stage.id) continue;
      const closed = String(stage.metadata?.isClosed ?? "false") === "true";
      const probability = Number(stage.metadata?.probability ?? NaN);
      index[stage.id] = {
        won: closed && probability === 1,
        lost: closed && probability === 0,
        label: stage.label ?? stage.id,
      };
    }
  }
  return index;
}

/** SHA-256 minúsculo/trim — identidade por hash, nunca PII bruta (LGPD, ETAPA2.md 8). */
export function hashIdentity(value: string | null | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  return createHash("sha256").update(normalized).digest("hex");
}

/** Extrai fbclid/gclid/UTMs da primeira URL vista (hs_analytics_first_url). */
export function parseFirstUrlHints(url: string | null | undefined): AttributionHints {
  if (!url) return {};
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return {};
  }
  const q = parsed.searchParams;
  const pick = (key: string) => q.get(key) ?? undefined;
  const hints: AttributionHints = {
    fbclid: pick("fbclid"),
    gclid: pick("gclid"),
    utm_source: pick("utm_source"),
    utm_medium: pick("utm_medium"),
    utm_campaign: pick("utm_campaign"),
    utm_content: pick("utm_content"),
    utm_term: pick("utm_term"),
    landing_page: `${parsed.origin}${parsed.pathname}`,
  };
  return dropUndefined(hints);
}

function dropUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

/**
 * Hints de atribuição de um contato: propriedades explícitas (snippet de
 * captura) têm prioridade; o parse da primeira URL preenche o resto.
 */
export function contactAttributionHints(props: HubspotObject["properties"]): AttributionHints {
  const fromUrl = parseFirstUrlHints(props.hs_analytics_first_url);
  const explicit: AttributionHints = dropUndefined({
    fbclid: props.fbclid ?? undefined,
    utm_source: props.utm_source ?? undefined,
    utm_medium: props.utm_medium ?? undefined,
    utm_campaign: props.utm_campaign ?? undefined,
    utm_content: props.utm_content ?? undefined,
    utm_term: props.utm_term ?? undefined,
    referrer: props.hs_analytics_first_referrer ?? undefined,
  });
  return { ...fromUrl, ...explicit };
}

export function contactRefFor(contactId: string, props?: HubspotObject["properties"]): ContactRef {
  return dropUndefined({
    external_contact_id: `hubspot:${contactId}`,
    email_hash: hashIdentity(props?.email),
    phone_hash: hashIdentity(props?.phone),
  });
}

/** Lifecycle stages do HubSpot que contam como lead qualificado. */
const QUALIFIED_LIFECYCLE_STAGES = new Set([
  "marketingqualifiedlead",
  "salesqualifiedlead",
  "opportunity",
  "customer",
]);

function externalId(portalId: string, object: string, id: string, phase: string): string {
  return `hs:${portalId}:${object}:${id}:${phase}`;
}

/** Payload original compactado para auditoria (raw jsonb) — sem PII bruta. */
function rawFor(object: HubspotObject, kind: string): Record<string, unknown> {
  const { email: _email, phone: _phone, ...safe } = object.properties;
  return { hubspot_object: kind, id: object.id, properties: safe };
}

/**
 * Contato -> lead_created (sempre) + lead_qualified (se o lifecycle stage
 * atual indica qualificação). O poll vê só o estado atual, não a transição —
 * o external_id por fase garante que cada marco é emitido uma única vez.
 */
export function mapContact(portalId: string, contact: HubspotObject): CanonicalEvent[] {
  const props = contact.properties;
  const createdAt = props.createdate;
  if (!createdAt) return [];

  const contactRef = contactRefFor(contact.id, props);
  const attributionHints = contactAttributionHints(props);
  const raw = rawFor(contact, "contact");

  const events: CanonicalEvent[] = [
    {
      externalId: externalId(portalId, "contact", contact.id, "created"),
      eventType: "lead_created",
      occurredAt: createdAt,
      contactRef,
      attributionHints,
      raw,
    },
  ];

  const stage = props.lifecyclestage?.toLowerCase();
  if (stage && QUALIFIED_LIFECYCLE_STAGES.has(stage)) {
    events.push({
      externalId: externalId(portalId, "contact", contact.id, "qualified"),
      eventType: "lead_qualified",
      occurredAt: props.lastmodifieddate ?? createdAt,
      contactRef,
      attributionHints,
      raw,
    });
  }
  return events;
}

/**
 * Negócio -> deal_created + deal_won/deal_lost conforme o estágio atual.
 * `monetary_value` = amount; contato associado liga o deal à identidade
 * (nível 3 da cascata de atribuição — o lead_created do contato carrega os
 * hints; o deal herda a identidade via external_contact_id/email_hash).
 */
export function mapDeal(
  portalId: string,
  deal: HubspotObject,
  stageIndex: DealStageIndex,
  associatedContactIds: string[] = [],
): CanonicalEvent[] {
  const props = deal.properties;
  const createdAt = props.createdate;
  if (!createdAt) return [];

  const amount = props.amount != null && props.amount !== "" ? Number(props.amount) : null;
  const currency = props.deal_currency_code ?? null;
  const contactRef: ContactRef | undefined = associatedContactIds[0]
    ? { external_contact_id: `hubspot:${associatedContactIds[0]}` }
    : undefined;
  const raw = rawFor(deal, "deal");

  const base = {
    monetaryValue: Number.isFinite(amount as number) ? amount : null,
    currency,
    contactRef,
    raw,
  };

  const events: CanonicalEvent[] = [
    {
      externalId: externalId(portalId, "deal", deal.id, "created"),
      eventType: "deal_created",
      occurredAt: createdAt,
      ...base,
    },
  ];

  const stage = props.dealstage ? stageIndex[props.dealstage] : undefined;
  const closedAt = props.closedate ?? props.hs_lastmodifieddate ?? createdAt;
  if (stage?.won) {
    events.push({
      externalId: externalId(portalId, "deal", deal.id, "won"),
      eventType: "deal_won",
      occurredAt: closedAt,
      ...base,
    });
  } else if (stage?.lost) {
    events.push({
      externalId: externalId(portalId, "deal", deal.id, "lost"),
      eventType: "deal_lost",
      occurredAt: closedAt,
      ...base,
    });
  }
  return events;
}

/**
 * Reunião -> meeting_scheduled (sempre) + meeting_held (outcome COMPLETED).
 */
export function mapMeeting(
  portalId: string,
  meeting: HubspotObject,
  associatedContactIds: string[] = [],
): CanonicalEvent[] {
  const props = meeting.properties;
  const createdAt = props.hs_createdate;
  if (!createdAt) return [];

  const contactRef: ContactRef | undefined = associatedContactIds[0]
    ? { external_contact_id: `hubspot:${associatedContactIds[0]}` }
    : undefined;
  const raw = rawFor(meeting, "meeting");

  const events: CanonicalEvent[] = [
    {
      externalId: externalId(portalId, "meeting", meeting.id, "scheduled"),
      eventType: "meeting_scheduled",
      occurredAt: props.hs_meeting_start_time ?? createdAt,
      contactRef,
      raw,
    },
  ];

  if (props.hs_meeting_outcome?.toUpperCase() === "COMPLETED") {
    events.push({
      externalId: externalId(portalId, "meeting", meeting.id, "held"),
      eventType: "meeting_held",
      occurredAt: props.hs_meeting_end_time ?? props.hs_meeting_start_time ?? createdAt,
      contactRef,
      raw,
    });
  }
  return events;
}
