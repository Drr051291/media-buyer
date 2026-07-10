import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { requireOrgAdmin, UnauthorizedError } from "@/lib/auth/require-org";
import { consentUrl } from "@/lib/connectors/ga4/oauth";

export const STATE_COOKIE = "ga4_oauth_state";
export const LINK_COOKIE = "ga4_oauth_link";

/**
 * Inicia o OAuth do GA4 (ETAPA2-GA4 BLOCO 2). Gera um `state` aleatorio,
 * guarda em cookie httpOnly (CSRF) e redireciona para a tela de consentimento
 * do Google. Um `?adAccountId=` opcional e carregado em cookie para vincular a
 * conexao a uma ad_account (atribuicao cruzada, BLOCO 4 passo 2).
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
      maxAge: 600, // 10 min: janela do fluxo de consentimento
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
    console.error("[/api/connectors/ga4/oauth/start]", error);
    return NextResponse.json({ error: "Erro ao iniciar OAuth do Google" }, { status: 500 });
  }
}
