import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
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
    const secure = process.env.NODE_ENV === "production";
    const cookieOpts = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure,
      path: "/",
      maxAge: 600, // 10 min: janela do fluxo de consentimento
    };

    // Setar os cookies NO objeto de resposta do redirect — e não via cookies()
    // do next/headers. No App Router, mutações naquele store nem sempre
    // acompanham um NextResponse.redirect() criado à mão; o state se perderia e
    // o callback rejeitaria como "state_invalido". Setar na resposta é garantido.
    const response = NextResponse.redirect(consentUrl(state));
    response.cookies.set(STATE_COOKIE, state, cookieOpts);
    if (adAccountId) {
      response.cookies.set(LINK_COOKIE, adAccountId, cookieOpts);
    } else {
      // Limpa um vínculo de tentativa anterior (expira imediatamente).
      response.cookies.set(LINK_COOKIE, "", { ...cookieOpts, maxAge: 0 });
    }
    return response;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[/api/connectors/ga4/oauth/start]", error);
    return NextResponse.json({ error: "Erro ao iniciar OAuth do Google" }, { status: 500 });
  }
}
