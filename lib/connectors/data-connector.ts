/**
 * Camada de Integrações (ETAPA2.md secao 2.1): cada plataforma externa
 * (CRM/e-commerce/ERP/analytics) implementa `DataConnector`. Tudo que entra
 * é normalizado para o modelo canônico de eventos de negócio
 * (`CanonicalEvent` -> tabela `business_events`) antes de tocar o motor de
 * inteligência — o motor nunca conhece "Pipedrive" ou "Shopify", só
 * lead/deal/meeting/order/refund/inventory. Mesma filosofia do
 * `AdsProvider` da Etapa 1 (lib/providers).
 *
 * Onda 2.0 só define a interface e o modelo canônico; conectores concretos
 * (GA4, Pipedrive, Shopify...) chegam na Onda 2.1.
 */

export type ConnectorCategory = "crm" | "ecommerce" | "erp" | "analytics" | "payments" | "custom";
export type ConnectorAuthMode = "api_key" | "oauth2" | "webhook_only";

/** O que o conector declara saber fazer — o motor se adapta ao que existe. */
export type Capability =
  | "leads"
  | "deals"
  | "meetings"
  | "orders"
  | "refunds"
  | "inventory"
  | "products"
  | "sessions"
  | "ltv";

export type BusinessEventType =
  | "lead_created"
  | "lead_qualified"
  | "lead_disqualified"
  | "meeting_scheduled"
  | "meeting_held"
  | "deal_created"
  | "deal_stage_changed"
  | "deal_won"
  | "deal_lost"
  | "order_created"
  | "order_paid"
  | "order_refunded"
  | "subscription_started"
  | "subscription_churned";

/** Hints de atribuição (ETAPA2.md 2.2/3.1) — o que a cascata de matching consome. */
export interface AttributionHints {
  fbclid?: string;
  gclid?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  landing_page?: string;
  referrer?: string;
  /** Preenchidos quando o UTM segue a convenção gerada pelo sistema (3.3). */
  meta_ad_id?: string;
  meta_adset_id?: string;
  meta_campaign_id?: string;
  ga4_session_id?: string;
}

/** Identidade do contato — só hashes, nunca PII bruta (LGPD, ETAPA2.md 8). */
export interface ContactRef {
  email_hash?: string;
  phone_hash?: string;
  external_contact_id?: string;
}

export interface CanonicalEventItem {
  sku: string;
  qty: number;
  price: number;
}

/** Formato canônico que todo conector produz, independente da origem. */
export interface CanonicalEvent {
  externalId: string;
  eventType: BusinessEventType;
  occurredAt: string;
  monetaryValue?: number | null;
  costValue?: number | null;
  currency?: string | null;
  contactRef?: ContactRef;
  attributionHints?: AttributionHints;
  items?: CanonicalEventItem[];
  raw?: unknown;
}

export type Credentials = Record<string, string | undefined>;

export interface ConnectorHealth {
  isValid: boolean;
  message?: string;
  scopes?: string[];
}

/** Cursor de paginação/incremental — formato livre por conector, gravado em connections.sync_cursor. */
export type SyncCursor = Record<string, unknown>;

export interface PullResult {
  events: CanonicalEvent[];
  /** null = não há mais páginas nesta janela. */
  nextCursor: SyncCursor | null;
}

export interface DataConnector {
  /** 'pipedrive', 'shopify', 'ga4', 'generic_webhook'... */
  id: string;
  category: ConnectorCategory;
  authMode: ConnectorAuthMode;
  capabilities: Capability[];
  validate(credentials: Credentials): Promise<ConnectorHealth>;
  /** Polling incremental (fallback para quem não tem webhook, ou backfill). */
  pull?(credentials: Credentials, cursor: SyncCursor): Promise<PullResult>;
  /** Ingestão via webhook — verificação de assinatura é responsabilidade do endpoint, não do conector. */
  handleWebhook?(payload: unknown): CanonicalEvent[];
}

export interface BusinessEventRow {
  org_id: string;
  ad_account_id: string | null;
  connector_id: string;
  external_id: string;
  event_type: BusinessEventType;
  occurred_at: string;
  monetary_value: number | null;
  cost_value: number | null;
  currency: string | null;
  contact_ref: ContactRef;
  attribution_hints: AttributionHints;
  items: CanonicalEventItem[] | null;
  raw: unknown;
}

/** Converte um CanonicalEvent (produzido por qualquer conector) na linha insertável em `business_events`. */
export function toBusinessEventRow(
  orgId: string,
  adAccountId: string | null,
  connectorId: string,
  event: CanonicalEvent,
): BusinessEventRow {
  return {
    org_id: orgId,
    ad_account_id: adAccountId,
    connector_id: connectorId,
    external_id: event.externalId,
    event_type: event.eventType,
    occurred_at: event.occurredAt,
    monetary_value: event.monetaryValue ?? null,
    cost_value: event.costValue ?? null,
    currency: event.currency ?? null,
    contact_ref: event.contactRef ?? {},
    attribution_hints: event.attributionHints ?? {},
    items: event.items ?? null,
    raw: event.raw ?? null,
  };
}
