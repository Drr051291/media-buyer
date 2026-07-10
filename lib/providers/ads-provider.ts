/**
 * Abstração de provedor de anúncios (PROJECT.md §3.1). O motor de inteligência
 * (PROJECT.md §6) não conhece "Meta" nem "Google Ads" — só os níveis canônicos
 * (campaign/adset/ad) e as métricas normalizadas em metrics_daily.
 *
 * V1: MetaProvider (lib/meta/*, funcional) + GoogleAdsProvider (esta ETAPA 3,
 * lib/providers/google-ads/*, classe). Futuro: TikTokProvider.
 *
 * Mapeamento Google Ads → canônico (ETAPA3 §1.1):
 *   campaign → campaign, ad_group → adset, ad_group_ad → ad.
 */

export type CanonicalLevel = "campaign" | "adset" | "ad";

export interface TokenHealth {
  isValid: boolean;
  message: string;
  scopes?: string[];
}

export interface ProviderAdAccount {
  /** id nativo do provider (Google: customer_id sem hífens). */
  externalId: string;
  name: string;
  currency: string;
  timezone: string;
  /** conta gestora (MCC) — não é uma conta operável na V1. */
  isManager?: boolean;
  status?: string;
}

export interface ProviderEntity {
  level: CanonicalLevel;
  externalId: string;
  parentExternalId: string | null;
  name: string;
  status: string | null;
  objective: string | null;
  /** budget diário na unidade normal da moeda (ex: reais), já fora de micros. */
  dailyBudget: number | null;
}

/** Linha de insight normalizada (mesma forma que alimenta metrics_daily). */
export interface ProviderInsightRow {
  level: CanonicalLevel;
  externalId: string;
  date: string; // YYYY-MM-DD
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValue: number;
  raw: Record<string, unknown>;
}
