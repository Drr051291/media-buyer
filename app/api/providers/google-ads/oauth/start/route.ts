import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { requireOrgAdmin, UnauthorizedError } from "@/lib/auth/require-org";
import { consentUrl } from "@/lib/providers/google-ads/oauth";

export const STATE_COOKIE = "gads_oauth_state";

/**
 * Inicia o OAuth do Google Ads (ETAPA3GOOGLEADS BLOCO 1). Gera um `state`
 * aleatório, guarda em cookie httpOnly (CSRF) e redireciona para a tela de
 * consentimento do Google. O consentimento não abre em fetch/iframe — precisa
 * ser um redirect top-level (o wizard usa window.location.href).
 */
export async function GET(request: Request) {
  try {
    await requireOrgAdmin();

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

    return NextResponse.redirect(consentUrl(state));
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[/api/providers/google-ads/oauth/start]", error);
    return NextResponse.json({ error: "Erro ao iniciar OAuth do Google Ads" }, { status: 500 });
  }
}
