import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { requireOrgAdmin, UnauthorizedError } from "@/lib/auth/require-org";
import { exchangeCode, tokenInfo } from "@/lib/connectors/hubspot/oauth";
import { serializeCredentials } from "@/lib/connectors/hubspot/credentials";
import { createSecret, deleteSecret } from "@/lib/vault";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { STATE_COOKIE, LINK_COOKIE } from "../start/route";

const WIZARD_PATH = "/app/integrations/hubspot";

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
 * Callback do OAuth do HubSpot (ETAPA-HUBSPOT.md seção 3). Valida o `state`
 * (CSRF), troca o `code` por tokens, descobre o portal (hub_id), grava
 * SOMENTE o refresh_token no Vault (JSON {mode:'oauth'}) e faz upsert da
 * connection (org+connector). Nunca loga tokens.
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
    // Usuário negou permissão ou a autorização falhou.
    return redirectToWizard(request, { error: oauthError });
  }
  if (!code || !state || !cookieState || !safeEqual(state, cookieState)) {
    return redirectToWizard(request, { error: "state_invalido" });
  }

  try {
    const { user, orgId } = await requireOrgAdmin();

    const tokens = await exchangeCode(code);
    if (!tokens.refresh_token) {
      return redirectToWizard(request, { error: "sem_refresh_token" });
    }
    const { hubId } = await tokenInfo(tokens.access_token);

    const supabase = createServiceRoleClient();

    // Um portal HubSpot pertence a UM tenant: impede que outra org conecte o
    // mesmo portal (o webhook resolve o tenant pelo portalId).
    const { data: portalTaken } = await supabase
      .from("connections")
      .select("id, org_id")
      .eq("connector_id", "hubspot")
      .eq("hubspot_portal_id", hubId)
      .neq("org_id", orgId)
      .maybeSingle();
    if (portalTaken) {
      return redirectToWizard(request, { error: "portal_em_uso" });
    }

    // Upsert por (org, connector): reautorizar não duplica a conexão.
    const { data: existing } = await supabase
      .from("connections")
      .select("id, credentials_vault_id")
      .eq("org_id", orgId)
      .eq("connector_id", "hubspot")
      .maybeSingle();

    const vaultSecretId = await createSecret(
      serializeCredentials({ mode: "oauth", refresh_token: tokens.refresh_token }),
      `hubspot_oauth:${orgId}`,
    );

    let connectionId: string;
    if (existing) {
      const { error: updateError } = await supabase
        .from("connections")
        .update({
          credentials_vault_id: vaultSecretId,
          hubspot_portal_id: hubId,
          auth_mode: "oauth2",
          status: "active",
          ad_account_id: linkAdAccountId ?? undefined,
          last_sync_at: null,
        })
        .eq("id", existing.id);
      if (updateError) throw updateError;
      connectionId = existing.id;
      // Revoga o segredo antigo do Vault (evita órfãos).
      if (existing.credentials_vault_id) {
        await deleteSecret(existing.credentials_vault_id).catch(() => {});
      }
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("connections")
        .insert({
          org_id: orgId,
          ad_account_id: linkAdAccountId,
          connector_id: "hubspot",
          category: "crm",
          label: "HubSpot",
          auth_mode: "oauth2",
          credentials_vault_id: vaultSecretId,
          hubspot_portal_id: hubId,
          status: "active",
          capabilities: ["leads", "deals", "meetings"],
        })
        .select("id")
        .single();
      if (insertError || !inserted) throw insertError ?? new Error("Falha ao criar conexao");
      connectionId = inserted.id;
    }

    await supabase.from("audit_log").insert({
      org_id: orgId,
      actor: user.id,
      event: "hubspot_connected",
      payload: {
        connection_id: connectionId,
        portal_id: hubId,
        mode: "oauth",
        linked_ad_account_id: linkAdAccountId,
      },
    });

    // Prossegue para o passo de validação do wizard.
    return redirectToWizard(request, { connectionId, step: "validate" });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return redirectToWizard(request, { error: "nao_autorizado" });
    }
    console.error("[/api/connectors/hubspot/oauth/callback]", error);
    return redirectToWizard(request, { error: "falha_conexao" });
  }
}
