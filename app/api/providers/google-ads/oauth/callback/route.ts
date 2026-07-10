import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { requireOrgAdmin, UnauthorizedError } from "@/lib/auth/require-org";
import { exchangeCode } from "@/lib/providers/google-ads/oauth";
import { cleanupDanglingGoogleTokens } from "@/lib/providers/google-ads/credentials";
import { createSecret } from "@/lib/vault";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { STATE_COOKIE } from "../start/route";

const WIZARD_PATH = "/app/integrations/google-ads";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function redirectToWizard(request: Request, params: Record<string, string>): NextResponse {
  const url = new URL(WIZARD_PATH, new URL(request.url).origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url);
}

/**
 * Callback do OAuth do Google Ads (ETAPA3GOOGLEADS BLOCO 1). Valida o `state`
 * (CSRF), troca o `code` por tokens, grava SOMENTE o refresh_token no Vault e
 * cria uma linha meta_tokens (provider='google') com o vault_secret_id. A
 * seleção de conta (customer_id) acontece no passo 2 do wizard (BLOCO 2),
 * então aqui ainda não criamos ad_accounts. Nunca loga tokens.
 */
export async function GET(request: Request) {
  const cookieStore = await cookies();
  const cookieState = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return redirectToWizard(request, { error: oauthError });
  }
  if (!code || !state || !cookieState || !safeEqual(state, cookieState)) {
    return redirectToWizard(request, { error: "state_invalido" });
  }

  try {
    const { user, orgId } = await requireOrgAdmin();

    const tokens = await exchangeCode(code);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken) {
      // Sem refresh_token: o Google só devolve com prompt=consent na 1ª
      // autorização. Manda o usuário reconsentir.
      return redirectToWizard(request, { error: "sem_refresh_token" });
    }

    const supabase = createServiceRoleClient();
    const vaultSecretId = await createSecret(refreshToken, `google_ads_refresh:${orgId}`);

    const { data: metaToken, error: tokenError } = await supabase
      .from("meta_tokens")
      .insert({
        org_id: orgId,
        provider: "google",
        label: "Google Ads",
        vault_secret_id: vaultSecretId,
        scopes: ["adwords"],
        token_health: "valid",
        last_validated_at: new Date().toISOString(),
        created_by: user.id,
      })
      .select("id")
      .single();

    if (tokenError || !metaToken) {
      throw tokenError ?? new Error("Falha ao salvar credencial");
    }

    // Limpa credenciais órfãs (wizard abandonado/reconexão): mantém a recém-criada.
    await cleanupDanglingGoogleTokens(orgId, metaToken.id).catch(() => {});

    await supabase.from("audit_log").insert({
      org_id: orgId,
      actor: user.id,
      event: "google_ads_oauth_connected",
      payload: { meta_token_id: metaToken.id },
    });

    // Passo 2 do wizard: escolher a conta (customer_id).
    return redirectToWizard(request, { tokenId: metaToken.id, step: "account" });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return redirectToWizard(request, { error: "nao_autorizado" });
    }
    console.error("[/api/providers/google-ads/oauth/callback]", error);
    return redirectToWizard(request, { error: "falha_conexao" });
  }
}
