import "server-only";
import type {
  CanonicalLevel,
  ProviderAdAccount,
  ProviderEntity,
  ProviderInsightRow,
  TokenHealth,
} from "@/lib/providers/ads-provider";
import { customerFor, listAccessibleCustomerIds } from "./client";
import {
  ENTITY_QUERIES,
  insightsQuery,
  normalizeEntityRow,
  normalizeInsightRow,
} from "./gaql";

/**
 * GoogleAdsProvider (ETAPA3GOOGLEADS BLOCOS 2-3). Implementa a interface
 * AdsProvider (PROJECT.md §3.1) para o Google Ads via OAuth por conta
 * individual + Google Ads API. Alimenta metrics_daily/entities no MESMO formato
 * do Meta (provider='google') — o motor de inteligência não muda.
 *
 * A lib google-ads-api pagina sozinha no `.query()` (ETAPA3 §BLOCO3 regra 4).
 */

interface CustomerRow {
  customer?: {
    id?: unknown;
    descriptive_name?: unknown;
    currency_code?: unknown;
    time_zone?: unknown;
    manager?: unknown;
    status?: unknown;
  };
}

export class GoogleAdsProvider {
  /**
   * Prova o acesso: lista os customers acessíveis pela credencial OAuth. Se
   * listar ao menos um, a credencial está saudável. Test Access já resolve aqui
   * (contas de teste); Basic Access é necessário só do BLOCO 3 em diante.
   */
  async validateToken(refreshToken: string): Promise<TokenHealth> {
    try {
      const ids = await listAccessibleCustomerIds(refreshToken);
      if (ids.length === 0) {
        return { isValid: false, message: "Nenhuma conta Google Ads acessível por esta credencial" };
      }
      return { isValid: true, message: `${ids.length} conta(s) acessível(is)`, scopes: ["adwords"] };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao validar acesso ao Google Ads";
      return { isValid: false, message };
    }
  }

  /**
   * Lista as contas acessíveis com nome legível. Para cada customer_id do
   * `listAccessibleCustomers`, busca customer.descriptive_name via GAQL. Contas
   * gestoras (MCC) são marcadas isManager — não são operáveis na V1.
   */
  async listAdAccounts(refreshToken: string): Promise<ProviderAdAccount[]> {
    const ids = await listAccessibleCustomerIds(refreshToken);
    const accounts: ProviderAdAccount[] = [];
    for (const customerId of ids) {
      try {
        const customer = customerFor(refreshToken, customerId);
        const rows = (await customer.query(
          `SELECT customer.id, customer.descriptive_name, customer.currency_code,
                  customer.time_zone, customer.manager, customer.status
           FROM customer`,
        )) as CustomerRow[];
        const c = rows[0]?.customer;
        accounts.push({
          externalId: customerId,
          name: c?.descriptive_name != null && String(c.descriptive_name).length > 0
            ? String(c.descriptive_name)
            : customerId,
          currency: c?.currency_code != null ? String(c.currency_code) : "BRL",
          timezone: c?.time_zone != null ? String(c.time_zone) : "America/Sao_Paulo",
          isManager: Boolean(c?.manager),
          status: c?.status != null ? String(c.status) : undefined,
        });
      } catch {
        // Conta acessível mas não consultável (cancelada, sem permissão de
        // leitura, etc.) — expõe só o id para não travar o wizard.
        accounts.push({
          externalId: customerId,
          name: customerId,
          currency: "BRL",
          timezone: "America/Sao_Paulo",
        });
      }
    }
    return accounts;
  }

  /** Estrutura de UM nível (campaign/adset/ad) para um customer. */
  async fetchEntities(
    refreshToken: string,
    customerId: string,
    level: CanonicalLevel,
  ): Promise<ProviderEntity[]> {
    const customer = customerFor(refreshToken, customerId);
    const rows = (await customer.query(ENTITY_QUERIES[level])) as Parameters<
      typeof normalizeEntityRow
    >[1][];
    const out: ProviderEntity[] = [];
    for (const row of rows) {
      const e = normalizeEntityRow(level, row);
      if (e) out.push(e);
    }
    return out;
  }

  /** Insights nível ad, por dia, janela [start, end]. Normaliza micros → moeda. */
  async fetchInsights(
    refreshToken: string,
    customerId: string,
    start: string,
    end: string,
  ): Promise<ProviderInsightRow[]> {
    const customer = customerFor(refreshToken, customerId);
    const rows = (await customer.query(insightsQuery(start, end))) as Parameters<
      typeof normalizeInsightRow
    >[0][];
    const out: ProviderInsightRow[] = [];
    for (const row of rows) {
      const r = normalizeInsightRow(row);
      if (r) out.push(r);
    }
    return out;
  }
}

export const googleAdsProvider = new GoogleAdsProvider();
