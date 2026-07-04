import { MetaClient } from "./client";

export interface TokenHealth {
  isValid: boolean;
  scopes: string[];
  /** null = nunca expira (a Meta retorna expires_at=0 nesse caso). */
  expiresAt: Date | null;
  appId?: string;
  userId?: string;
  issuedAt: Date | null;
}

interface DebugTokenResponse {
  data?: {
    app_id?: string;
    expires_at?: number;
    is_valid?: boolean;
    issued_at?: number;
    scopes?: string[];
    user_id?: string;
  };
}

/** GET /debug_token — ver PROJECT.md secao 5.3. */
export async function validateToken(
  token: string,
  opts?: { apiVersion?: string },
): Promise<TokenHealth> {
  const client = new MetaClient({ accessToken: token, apiVersion: opts?.apiVersion });
  const response = await client.get<DebugTokenResponse>("debug_token", { input_token: token });
  const data = response.data;

  if (!data) {
    return { isValid: false, scopes: [], expiresAt: null, issuedAt: null };
  }

  return {
    isValid: !!data.is_valid,
    scopes: data.scopes ?? [],
    expiresAt: data.expires_at ? new Date(data.expires_at * 1000) : null,
    issuedAt: data.issued_at ? new Date(data.issued_at * 1000) : null,
    appId: data.app_id,
    userId: data.user_id,
  };
}

export const READ_SCOPE = "ads_read";
export const WRITE_SCOPE = "ads_management";

export function hasMinimumScope(scopes: string[]): boolean {
  return scopes.includes(READ_SCOPE) || scopes.includes(WRITE_SCOPE);
}

export function hasWriteScope(scopes: string[]): boolean {
  return scopes.includes(WRITE_SCOPE);
}
