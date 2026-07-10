import "server-only";
import { GoogleAdsApi, type Customer } from "google-ads-api";

/**
 * Wrapper do client google-ads-api (ETAPA3GOOGLEADS BLOCO 2).
 *
 * Credencial da plataforma: o `developer_token` (seu, uma vez) é obrigatório em
 * TODA chamada. O client OAuth (client_id/secret) pode ser o MESMO projeto do
 * GA4. O refresh_token do cliente vem do Vault.
 *
 * V1 = conta individual: NÃO setar `login_customer_id` (só é necessário via
 * gestora/MCC; setar errado dá erro de permissão — ETAPA3 §1.2 armadilha 4).
 */

export function googleAdsClient(): GoogleAdsApi {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  if (!clientId || !clientSecret || !developerToken) {
    throw new Error(
      "Google Ads não configurado (GOOGLE_CLIENT_ID/SECRET/GOOGLE_ADS_DEVELOPER_TOKEN)",
    );
  }
  return new GoogleAdsApi({
    client_id: clientId,
    client_secret: clientSecret,
    developer_token: developerToken,
  });
}

/**
 * Remove o prefixo 'customers/' e QUALQUER hífen. A UI do Google mostra
 * `123-456-7890`; a API exige `1234567890` (ETAPA3 §1.2 armadilha 3). Sempre
 * normalizar ao persistir e ao chamar.
 */
export function normalizeCustomerId(raw: string): string {
  return raw.replace(/^customers\//, "").replace(/-/g, "");
}

/** Customer autenticado para queries/mutações de UMA conta (customer_id sem hífens). */
export function customerFor(refreshToken: string, customerId: string): Customer {
  return googleAdsClient().Customer({
    customer_id: normalizeCustomerId(customerId),
    refresh_token: refreshToken,
  });
}

/**
 * `listAccessibleCustomers` — customer_ids que a conta OAuth acessa
 * diretamente. Retorna já normalizados (sem 'customers/' nem hífens).
 */
export async function listAccessibleCustomerIds(refreshToken: string): Promise<string[]> {
  const res = await googleAdsClient().listAccessibleCustomers(refreshToken);
  const names = (res.resource_names ?? []) as string[];
  return names.map(normalizeCustomerId);
}
