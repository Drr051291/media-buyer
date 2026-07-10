import "server-only";
import { OAuth2Client } from "google-auth-library";

/**
 * OAuth2 do Google para o AdsProvider do Google Ads (ETAPA3GOOGLEADS BLOCO 1).
 *
 * Molde: lib/connectors/ga4/oauth.ts (mesma casa Google, já validado). A ÚNICA
 * diferença é o escopo (`adwords` em vez de `analytics.readonly`) e o redirect
 * URI próprio do Google Ads.
 *
 * Decisões fechadas (ETAPA3 §0, BLOCO 1):
 * - Escopo único `https://www.googleapis.com/auth/adwords`. Escopos a mais
 *   disparam verificação do Google.
 * - `access_type=offline` + `prompt=consent` são OBRIGATÓRIOS juntos: sem os
 *   dois o Google não devolve `refresh_token` na 2ª autorização do mesmo
 *   usuário (bug clássico e silencioso).
 * - Só o `refresh_token` persiste (no Vault). O `access_token` (~1h) é
 *   derivado sob demanda e nunca vai a texto plano nem a log.
 *
 * Nunca importar este módulo de código que roda no browser.
 */

const SCOPES = ["https://www.googleapis.com/auth/adwords"];

export function oauthClient(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  // Redirect URI PRÓPRIO do Google Ads (byte a byte igual ao do console).
  const redirectUri = process.env.GOOGLE_ADS_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "OAuth do Google Ads não configurado (GOOGLE_CLIENT_ID/SECRET/GOOGLE_ADS_OAUTH_REDIRECT_URI)",
    );
  }
  return new OAuth2Client(clientId, clientSecret, redirectUri);
}

/** URL de consentimento. `state` = token CSRF gerado e guardado em cookie httpOnly. */
export function consentUrl(state: string): string {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
    include_granted_scopes: true,
  });
}

/** Troca o `code` do callback por tokens. tokens.refresh_token -> Vault. */
export async function exchangeCode(code: string) {
  const { tokens } = await oauthClient().getToken(code);
  return tokens;
}

/**
 * Deriva um access_token fresco a partir do refresh_token guardado no Vault.
 * A lib google-ads-api renova sozinha, mas expomos explicitamente para os
 * pontos que precisam de um token válido fora dela.
 */
export async function freshAccessToken(refreshToken: string): Promise<string> {
  const c = oauthClient();
  c.setCredentials({ refresh_token: refreshToken });
  const { token } = await c.getAccessToken();
  if (!token) throw new Error("Falha ao renovar access_token do Google Ads");
  return token;
}
