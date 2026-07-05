import type { AttributionHints, ContactRef } from "@/lib/connectors/data-connector";
import type { EntityLevel } from "@/lib/engine/signals/types";

/**
 * Cascata de atribuição (ETAPA2.md 3.1), níveis 1-3: click id, UTM, identidade+janela.
 * Código determinístico e testável — "o LLM nunca faz matching" (regra de ouro
 * herdada da Etapa 1). Níveis 4 (GA4) e 5 (probabilístico) ficam para ondas futuras.
 *
 * Função pura: quem monta `knownEntities`/`priorTouches` a partir do Postgres é o
 * futuro `attribution_worker` (fora do escopo desta onda, que entrega só a cascata
 * + testes).
 */

export type AttributionMethod = "click_id" | "utm" | "identity_window";
export type AttributionConfidence = "exact" | "high";

const DEFAULT_IDENTITY_WINDOW_DAYS = 180; // cobre o horizonte de backfill (ETAPA2.md 2.4)

export interface KnownEntity {
  level: EntityLevel;
  metaId: string;
  /** metaId do pai direto (ad -> adset -> campaign), para validar consistência do UTM. */
  parentMetaId?: string | null;
}

/** Um touch (clique/visita) já resolvido a uma entidade — insumo dos níveis 1 e 3. */
export interface ResolvedTouch {
  contactRef?: ContactRef;
  fbclid?: string;
  entityLevel: EntityLevel;
  entityMetaId: string;
  occurredAt: string;
}

export interface AttributionCandidate {
  attributionHints?: AttributionHints;
  contactRef?: ContactRef;
  occurredAt: string;
}

export interface AttributionMatch {
  entityLevel: EntityLevel;
  entityMetaId: string;
  method: AttributionMethod;
  confidence: AttributionConfidence;
  touchOccurredAt: string | null;
  lagDays: number | null;
}

export interface AttributionContext {
  knownEntities: KnownEntity[];
  priorTouches: ResolvedTouch[];
  /** Janela máxima (em dias) para o nível 3 (identidade). Default 180. */
  identityWindowDays?: number;
}

function lagDaysBetween(touchOccurredAt: string, eventOccurredAt: string): number {
  const touchMs = new Date(touchOccurredAt).getTime();
  const eventMs = new Date(eventOccurredAt).getTime();
  return (eventMs - touchMs) / (24 * 60 * 60 * 1000);
}

function findEntity(entities: KnownEntity[], level: EntityLevel, metaId: string): KnownEntity | undefined {
  return entities.find((entity) => entity.level === level && entity.metaId === metaId);
}

/** Nível 1 — Click ID direto (`exact`): reutiliza a entidade de um touch anterior com o mesmo fbclid. */
function matchClickId(event: AttributionCandidate, context: AttributionContext): AttributionMatch | null {
  const fbclid = event.attributionHints?.fbclid;
  if (!fbclid) return null;

  const eventMs = new Date(event.occurredAt).getTime();
  const candidates = context.priorTouches.filter(
    (touch) => touch.fbclid === fbclid && new Date(touch.occurredAt).getTime() <= eventMs,
  );
  if (candidates.length === 0) return null;

  const closest = candidates.reduce((best, current) =>
    new Date(current.occurredAt).getTime() > new Date(best.occurredAt).getTime() ? current : best,
  );

  return {
    entityLevel: closest.entityLevel,
    entityMetaId: closest.entityMetaId,
    method: "click_id",
    confidence: "exact",
    touchOccurredAt: closest.occurredAt,
    lagDays: lagDaysBetween(closest.occurredAt, event.occurredAt),
  };
}

/**
 * Nível 2 — Convenção de UTM (`high`): `utm_content` = ad_id, `utm_campaign` = campaign_id
 * (ETAPA2.md 3.3). Campos `meta_ad_id`/`meta_adset_id`/`meta_campaign_id` explícitos têm
 * prioridade quando o conector já resolveu a entidade (ex: GA4 via dimensão customizada).
 */
function matchUtmConvention(event: AttributionCandidate, context: AttributionContext): AttributionMatch | null {
  const hints = event.attributionHints;
  if (!hints) return null;

  const adId = hints.meta_ad_id ?? hints.utm_content;
  const campaignId = hints.meta_campaign_id ?? hints.utm_campaign;
  const adsetId = hints.meta_adset_id;

  if (adId) {
    const ad = findEntity(context.knownEntities, "ad", adId);
    if (ad) {
      const campaignMismatch =
        campaignId && ad.parentMetaId != null && resolveCampaignAncestor(context.knownEntities, ad) !== campaignId;
      if (!campaignMismatch) {
        return { entityLevel: "ad", entityMetaId: ad.metaId, method: "utm", confidence: "high", touchOccurredAt: null, lagDays: null };
      }
    }
  }

  if (adsetId) {
    const adset = findEntity(context.knownEntities, "adset", adsetId);
    if (adset) {
      return { entityLevel: "adset", entityMetaId: adset.metaId, method: "utm", confidence: "high", touchOccurredAt: null, lagDays: null };
    }
  }

  if (campaignId) {
    const campaign = findEntity(context.knownEntities, "campaign", campaignId);
    if (campaign) {
      return { entityLevel: "campaign", entityMetaId: campaign.metaId, method: "utm", confidence: "high", touchOccurredAt: null, lagDays: null };
    }
  }

  return null;
}

/** Sobe a cadeia ad -> adset -> campaign para achar o campaign_id ancestral de um ad. */
function resolveCampaignAncestor(entities: KnownEntity[], ad: KnownEntity): string | null {
  if (!ad.parentMetaId) return null;
  const adset = findEntity(entities, "adset", ad.parentMetaId);
  if (!adset?.parentMetaId) return null;
  const campaign = findEntity(entities, "campaign", adset.parentMetaId);
  return campaign?.metaId ?? null;
}

function contactRefsMatch(a: ContactRef | undefined, b: ContactRef | undefined): boolean {
  if (!a || !b) return false;
  return Boolean(
    (a.email_hash && a.email_hash === b.email_hash) ||
      (a.phone_hash && a.phone_hash === b.phone_hash) ||
      (a.external_contact_id && a.external_contact_id === b.external_contact_id),
  );
}

/**
 * Nível 3 — Identidade + janela (`high`): liga o evento a um touch anterior do MESMO
 * contato (email/phone hash) dentro da janela de lookback, escolhendo o mais recente
 * (modelo last-click).
 */
function matchIdentityWindow(event: AttributionCandidate, context: AttributionContext): AttributionMatch | null {
  if (!event.contactRef) return null;

  const windowDays = context.identityWindowDays ?? DEFAULT_IDENTITY_WINDOW_DAYS;
  const eventMs = new Date(event.occurredAt).getTime();
  const windowStartMs = eventMs - windowDays * 24 * 60 * 60 * 1000;

  const candidates = context.priorTouches.filter((touch) => {
    const touchMs = new Date(touch.occurredAt).getTime();
    return touchMs <= eventMs && touchMs >= windowStartMs && contactRefsMatch(event.contactRef, touch.contactRef);
  });
  if (candidates.length === 0) return null;

  const closest = candidates.reduce((best, current) =>
    new Date(current.occurredAt).getTime() > new Date(best.occurredAt).getTime() ? current : best,
  );

  return {
    entityLevel: closest.entityLevel,
    entityMetaId: closest.entityMetaId,
    method: "identity_window",
    confidence: "high",
    touchOccurredAt: closest.occurredAt,
    lagDays: lagDaysBetween(closest.occurredAt, event.occurredAt),
  };
}

/** Roda a cascata em ordem de confiança decrescente; retorna o primeiro nível que casar. */
export function resolveAttribution(event: AttributionCandidate, context: AttributionContext): AttributionMatch | null {
  return matchClickId(event, context) ?? matchUtmConvention(event, context) ?? matchIdentityWindow(event, context);
}
