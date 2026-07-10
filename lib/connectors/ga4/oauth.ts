import "server-only";
import { OAuth2Client } from "google-auth-library";

/**
 * OAuth2 do Google para o conector GA4 (ETAPA2-GA4 BLOCO 2).
 *
 * Decisoes fechadas:
 * - Escopo unico `analytics.readonly` (somente leitura; alinhado ao principio
 *   "comece read-only"). Escopos a mais disparam verificacao do Google.
 * - `access_type=offline` + `prompt=consent` sao OBRIGATORIOS juntos: sem os
 *   dois o Google nao devolve `refresh_token` na 2a autorizacao do mesmo
 *   usuario (bug classico e silencioso).
 * - So o `refresh_token` persiste (no Vault). O `access_token` (~1h) e
 *   derivado sob demanda via `freshAccessToken` e nunca vai a texto plano.
 *
 * Nunca importar este modulo de codigo que roda no browser.
 */

const SCOPES = ["https://www.googleapis.com/auth/analytics.readonly"];

export function oauthClient(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error("OAuth do Google nao configurado (GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI)");
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
 * Usado por validate()/pull() antes de cada chamada a GA4 (o SDK renova
 * automaticamente, mas expomos explicitamente para os workers de cron).
 */
export async function freshAccessToken(refreshToken: string): Promise<string> {
  const c = oauthClient();
  c.setCredentials({ refresh_token: refreshToken });
  const { token } = await c.getAccessToken();
  if (!token) throw new Error("Falha ao renovar access_token do Google");
  return token;
}

/** Client ja autenticado com o refresh_token — passado aos SDKs Admin/Data. */
export function authedClient(refreshToken: string): OAuth2Client {
  const c = oauthClient();
  c.setCredentials({ refresh_token: refreshToken });
  return c;
}

/**
 * Os SDKs @google-analytics/* trazem uma copia propria de google-auth-library
 * (google-gax > google-auth-library), com faixa de versao diferente da nossa —
 * npm nao consegue deduplicar. O OAuth2Client e compativel em runtime, mas o
 * type skew entre as duas copias faz o `authClient` das opcoes de client nao
 * bater. Este cast contido resolve isso num unico ponto.
 */
export function gaxAuthClient(refreshToken: string): unknown {
  return authedClient(refreshToken);
}
