import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { requireOrgAdmin, UnauthorizedError } from "@/lib/auth/require-org";
import { exchangeCode } from "@/lib/connectors/ga4/oauth";
import { createSecret, deleteSecret } from "@/lib/vault";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { STATE_COOKIE, LINK_COOKIE } from "../start/route";

const WIZARD_PATH = "/app/integrations/ga4";

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
 * Callback do OAuth do GA4 (ETAPA2-GA4 BLOCO 2). Valida o `state` (CSRF),
 * troca o `code` por tokens, grava SOMENTE o refresh_token no Vault e faz
 * upsert da connection (org+connector). Nunca loga tokens.
 */
export async function GET(request: Request) {
  const cookieStore = await cookies();
  const cookieState = cookieStore.get(STATE_COOKIE)?.value;
  const linkAdAccountId = cookieStore.get(LINK_COOKIE)?.value ?? null;
  cookieStore.delete(STATE_COOKIE);
  cookieStore.delete(LINK_COOKIE);

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    // Usuario negou permissao ou o consentimento falhou.
    return redirectToWizard(request, { error: oauthError });
  }
  if (!code || !state || !cookieState || !safeEqual(state, cookieState)) {
    return redirectToWizard(request, { error: "state_invalido" });
  }

  // Rastreia em qual etapa uma exceção ocorreu, para transformar o
  // "falha_conexao" genérico numa causa acionável (troca de token / Vault /
  // banco). O erro completo continua indo pro log do servidor; ao cliente vai
  // só a categoria + uma mensagem curta e não sensível (nunca o token).
  let stage: "troca_token" | "cofre" | "banco" = "troca_token";
  try {
    const { user, orgId } = await requireOrgAdmin();

    stage = "troca_token";
    const tokens = await exchangeCode(code);
    const refreshToken = tokens.refresh_token;
    if (!refreshToken) {
      // Sem refresh_token: o Google so devolve na 1a autorizacao ou com
      // prompt=consent. Manda o usuario reconsentir.
      return redirectToWizard(request, { error: "sem_refresh_token" });
    }

    const supabase = createServiceRoleClient();

    // Upsert por (org, connector): reautorizar nao duplica a conexao.
    stage = "banco";
    const { data: existing, error: existingError } = await supabase
      .from("connections")
      .select("id, credentials_vault_id")
      .eq("org_id", orgId)
      .eq("connector_id", "ga4")
      .maybeSingle();
    if (existingError) throw existingError;

    stage = "cofre";
    const vaultSecretId = await createSecret(refreshToken, `ga4_refresh:${orgId}`);
    stage = "banco";

    let connectionId: string;
    if (existing) {
      const { error: updateError } = await supabase
        .from("connections")
        .update({
          credentials_vault_id: vaultSecretId,
          status: "active",
          ad_account_id: linkAdAccountId ?? undefined,
          last_sync_at: null,
        })
        .eq("id", existing.id);
      if (updateError) throw updateError;
      connectionId = existing.id;
      // Revoga o segredo antigo do Vault (evita orfaos).
      if (existing.credentials_vault_id) {
        await deleteSecret(existing.credentials_vault_id).catch(() => {});
      }
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("connections")
        .insert({
          org_id: orgId,
          ad_account_id: linkAdAccountId,
          connector_id: "ga4",
          category: "analytics",
          label: "Google Analytics 4",
          auth_mode: "oauth2",
          credentials_vault_id: vaultSecretId,
          status: "active",
          capabilities: ["sessions", "conversions", "ltv"],
        })
        .select("id")
        .single();
      if (insertError || !inserted) throw insertError ?? new Error("Falha ao criar conexao");
      connectionId = inserted.id;
    }

    await supabase.from("audit_log").insert({
      org_id: orgId,
      actor: user.id,
      event: "ga4_connected",
      payload: { connection_id: connectionId, linked_ad_account_id: linkAdAccountId },
    });

    // Prossegue para o passo 2 do wizard (escolher propriedade).
    return redirectToWizard(request, { connectionId, step: "property" });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return redirectToWizard(request, { error: "nao_autorizado" });
    }
    console.error(`[/api/connectors/ga4/oauth/callback] stage=${stage}`, error);
    const detail = error instanceof Error ? error.message.slice(0, 160) : "";
    return redirectToWizard(request, detail ? { error: stage, detail } : { error: stage });
  }
}
