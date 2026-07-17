import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { requireOrgAdmin, UnauthorizedError } from "@/lib/auth/require-org";
import { consentUrl } from "@/lib/connectors/hubspot/oauth";

export const STATE_COOKIE = "hubspot_oauth_state";
export const LINK_COOKIE = "hubspot_oauth_link";

/**
 * Inicia o OAuth do HubSpot (ETAPA-HUBSPOT.md seção 3). Gera um `state`
 * aleatório, guarda em cookie httpOnly (CSRF) e redireciona para a tela de
 * autorização do HubSpot. `?adAccountId=` opcional vincula a conexão a uma
 * ad_account (atribuição cruzada CRM ↔ Meta).
 */
export async function GET(request: Request) {
  try {
    await requireOrgAdmin();

    const url = new URL(request.url);
    const adAccountId = url.searchParams.get("adAccountId");

    const state = randomBytes(32).toString("hex");
    const cookieStore = await cookies();
    const secure = process.env.NODE_ENV === "production";

    cookieStore.set(STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure,
      path: "/",
      maxAge: 600, // 10 min: janela do fluxo de autorização
    });

    if (adAccountId) {
      cookieStore.set(LINK_COOKIE, adAccountId, {
        httpOnly: true,
        sameSite: "lax",
        secure,
        path: "/",
        maxAge: 600,
      });
    } else {
      cookieStore.delete(LINK_COOKIE);
    }

    return NextResponse.redirect(consentUrl(state));
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[/api/connectors/hubspot/oauth/start]", error);
    return NextResponse.json({ error: "Erro ao iniciar OAuth do HubSpot" }, { status: 500 });
  }
}
