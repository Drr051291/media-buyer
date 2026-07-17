import "server-only";

/**
 * OAuth2 do HubSpot (ETAPA-HUBSPOT.md seção 3 — caminho principal).
 *
 * Decisões fechadas:
 * - App público NÃO listado no marketplace: qualquer portal instala sem
 *   review do HubSpot (diferente da Meta, onde o App Review nos levou ao BYOT).
 * - Escopos read-only mínimos. Meetings/engagements são cobertos pelo escopo
 *   de contacts (não existe escopo próprio de meetings para leitura v3).
 * - O access token do HubSpot expira em ~30 min; só o REFRESH token persiste
 *   (no Vault, como o GA4). Access tokens são derivados sob demanda.
 *
 * Nunca importar este módulo de código que roda no browser.
 */

const AUTHORIZE_URL = "https://app.hubspot.com/oauth/authorize";
const TOKEN_URL = "https://api.hubapi.com/oauth/v1/token";

export const DEFAULT_SCOPES = [
  "oauth",
  "crm.objects.contacts.read",
  "crm.objects.deals.read",
  "crm.objects.companies.read",
  "crm.schemas.deals.read",
];

interface HubspotOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export function oauthConfig(): HubspotOAuthConfig {
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
  const redirectUri = process.env.HUBSPOT_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("OAuth do HubSpot nao configurado (HUBSPOT_CLIENT_ID/SECRET/OAUTH_REDIRECT_URI)");
  }
  const scopes = process.env.HUBSPOT_OAUTH_SCOPES?.split(/[\s,]+/).filter(Boolean) ?? DEFAULT_SCOPES;
  return { clientId, clientSecret, redirectUri, scopes };
}

/** URL de consentimento. `state` = token CSRF gerado e guardado em cookie httpOnly. */
export function consentUrl(state: string): string {
  const { clientId, redirectUri, scopes } = oauthConfig();
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  // HubSpot separa escopos por espaço; a lista DEVE bater com a configurada
  // no app (mismatch de escopo derruba a autorização — ver docs).
  url.searchParams.set("scope", scopes.join(" "));
  url.searchParams.set("state", state);
  return url.toString();
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  if (!res.ok) {
    // Nunca logar o corpo com tokens; o status + statusText bastam.
    throw new Error(`Token endpoint do HubSpot falhou: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as TokenResponse;
}

/** Troca o `code` do callback por tokens. refresh_token -> Vault. */
export async function exchangeCode(code: string): Promise<TokenResponse> {
  const { clientId, clientSecret, redirectUri } = oauthConfig();
  return tokenRequest({
    grant_type: "authorization_code",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  });
}

/** Deriva um access_token fresco (~30 min) a partir do refresh_token do Vault. */
export async function freshAccessToken(refreshToken: string): Promise<string> {
  const { clientId, clientSecret } = oauthConfig();
  const tokens = await tokenRequest({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
  return tokens.access_token;
}

/** Metadados de um access token OAuth — inclui o hub_id (portal) e escopos. */
export async function tokenInfo(accessToken: string): Promise<{ hubId: string; scopes: string[] }> {
  const res = await fetch(
    `https://api.hubapi.com/oauth/v1/access-tokens/${encodeURIComponent(accessToken)}`,
  );
  if (!res.ok) throw new Error(`Falha ao inspecionar access token: ${res.status}`);
  const data = (await res.json()) as { hub_id: number; scopes?: string[] };
  return { hubId: String(data.hub_id), scopes: data.scopes ?? [] };
}
