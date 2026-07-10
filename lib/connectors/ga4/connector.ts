import "server-only";
import { AnalyticsAdminServiceClient } from "@google-analytics/admin";
import { BetaAnalyticsDataClient } from "@google-analytics/data";
import type {
  DataConnector,
  ConnectorHealth,
  Credentials,
  ConnectorCategory,
  ConnectorAuthMode,
  Capability,
} from "@/lib/connectors/data-connector";
import { gaxAuthClient } from "./oauth";
import {
  buildRunReportRequest,
  normalizeReport,
  GA4_PAGE_SIZE,
  type Ga4NormalizedRow,
  type RunReportResponseLike,
} from "./report";

type AdminClientOptions = ConstructorParameters<typeof AnalyticsAdminServiceClient>[0];
type DataClientOptions = ConstructorParameters<typeof BetaAnalyticsDataClient>[0];
type AuthClientOption = NonNullable<AdminClientOptions>["authClient"];

export interface Ga4Property {
  propertyId: string; // 'properties/123456'
  displayName: string;
  account: string; // display name da conta GA4 dona da propriedade
}

/**
 * Lista todas as propriedades GA4 que o usuario autorizado enxerga
 * (Admin API `accountSummaries.list`). Alimenta o dropdown do wizard (BLOCO 3/4).
 */
export async function listProperties(refreshToken: string): Promise<Ga4Property[]> {
  const client = new AnalyticsAdminServiceClient({
    authClient: gaxAuthClient(refreshToken) as AuthClientOption,
  });
  try {
    const [summaries] = await client.listAccountSummaries();
    const properties: Ga4Property[] = [];
    for (const account of summaries) {
      for (const prop of account.propertySummaries ?? []) {
        if (!prop.property) continue;
        properties.push({
          propertyId: prop.property, // 'properties/123456'
          displayName: prop.displayName ?? prop.property,
          account: account.displayName ?? account.account ?? "",
        });
      }
    }
    return properties;
  } finally {
    await client.close().catch(() => {});
  }
}

/**
 * Conector GA4 (ETAPA2-GA4 secao 1.2). Implementa `DataConnector`, mas grava
 * em `ga4_metrics_daily` (agregada) em vez de `business_events` (event-level) —
 * ver secao 1.1. Sem `handleWebhook` (GA4 nao oferece webhook).
 */
export class GA4Connector implements DataConnector {
  id = "ga4";
  category: ConnectorCategory = "analytics";
  authMode: ConnectorAuthMode = "oauth2";
  capabilities: Capability[] = ["sessions", "conversions", "ltv"];

  /**
   * `validate` prova o acesso: renova o token e lista propriedades via Admin
   * API. Se listar ao menos uma propriedade, a credencial esta saudavel.
   */
  async validate(credentials: Credentials): Promise<ConnectorHealth> {
    const refreshToken = credentials.refresh_token;
    if (!refreshToken) {
      return { isValid: false, message: "refresh_token ausente" };
    }
    try {
      const properties = await listProperties(refreshToken);
      if (properties.length === 0) {
        return {
          isValid: false,
          message: "Nenhuma propriedade GA4 acessivel por esta conta Google",
        };
      }
      return {
        isValid: true,
        message: `${properties.length} propriedade(s) acessivel(is)`,
        scopes: ["analytics.readonly"],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao validar acesso ao GA4";
      return { isValid: false, message };
    }
  }

  // GA4 e AGREGADA (ver secao 1.1): nao produz CanonicalEvent, entao nao
  // implementa o `pull` canonico (opcional na interface). A ingestao usa
  // `fetchWindow` abaixo, que grava em ga4_metrics_daily via lib/connectors/ga4/sync.

  /**
   * Roda o `runReport` para uma janela [startDate, endDate], paginando ate
   * esgotar as linhas (uma conta com muitas campanhas estoura o default de
   * 10k). Retorna linhas ja normalizadas ('(not set)' no lugar de NULL).
   */
  async fetchWindow(
    refreshToken: string,
    propertyId: string,
    startDate: string,
    endDate: string,
  ): Promise<Ga4NormalizedRow[]> {
    const client = new BetaAnalyticsDataClient({
      authClient: gaxAuthClient(refreshToken) as NonNullable<DataClientOptions>["authClient"],
    });
    try {
      const all: Ga4NormalizedRow[] = [];
      let offset = 0;
      // Loop de paginacao: para quando a pagina volta vazia ou ja cobrimos o
      // rowCount total informado pela API.
      for (;;) {
        const request = buildRunReportRequest({ propertyId, startDate, endDate, offset });
        const [response] = await client.runReport(request);
        const resp = response as RunReportResponseLike;
        const normalized = normalizeReport(resp);
        all.push(...normalized);

        const pageLen = resp.rows?.length ?? 0;
        const total = Number(resp.rowCount ?? 0);
        offset += pageLen;
        if (pageLen < GA4_PAGE_SIZE) break; // ultima pagina
        if (total > 0 && offset >= total) break;
        if (pageLen === 0) break;
      }
      return all;
    } finally {
      await client.close().catch(() => {});
    }
  }
}

export const ga4Connector = new GA4Connector();
