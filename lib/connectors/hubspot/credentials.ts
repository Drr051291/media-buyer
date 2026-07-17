import "server-only";
import { readSecret } from "@/lib/vault";
import { freshAccessToken } from "./oauth";

/**
 * Credenciais do conector HubSpot no Vault (ETAPA-HUBSPOT.md seção 3).
 * Dois modos atrás da mesma interface (mesma filosofia BYOT da Meta):
 *
 * - `oauth`: app público — guardamos SÓ o refresh_token; access tokens
 *   (~30 min) são derivados sob demanda e nunca persistem.
 * - `private_app`: o cliente cola o token do Private App do próprio portal
 *   (não expira; rotacionável no HubSpot). Fallback para quem não pode
 *   autorizar OAuth no portal.
 *
 * O segredo no Vault é um JSON serializado deste tipo — nunca token em
 * coluna de tabela, nunca em log.
 */

export type HubspotCredentials =
  | { mode: "oauth"; refresh_token: string }
  | { mode: "private_app"; token: string };

export function serializeCredentials(credentials: HubspotCredentials): string {
  return JSON.stringify(credentials);
}

export function parseCredentials(raw: string): HubspotCredentials {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Compat: segredo antigo gravado como token puro = private app.
    return { mode: "private_app", token: raw };
  }
  const obj = parsed as Partial<HubspotCredentials> & Record<string, unknown>;
  if (obj?.mode === "oauth" && typeof obj.refresh_token === "string") {
    return { mode: "oauth", refresh_token: obj.refresh_token };
  }
  if (obj?.mode === "private_app" && typeof obj.token === "string") {
    return { mode: "private_app", token: obj.token };
  }
  throw new Error("Credencial do HubSpot no Vault em formato desconhecido");
}

/** Access token pronto para `Authorization: Bearer` — renova se for OAuth. */
export async function accessTokenFor(credentials: HubspotCredentials): Promise<string> {
  if (credentials.mode === "private_app") return credentials.token;
  return freshAccessToken(credentials.refresh_token);
}

/** Lê e desserializa a credencial de uma connection. Lança se ausente. */
export async function readCredentials(credentialsVaultId: string | null): Promise<HubspotCredentials> {
  if (!credentialsVaultId) throw new Error("Conexao HubSpot sem credencial no Vault");
  const raw = await readSecret(credentialsVaultId);
  if (!raw) throw new Error("Credencial do HubSpot indisponivel no Vault");
  return parseCredentials(raw);
}
