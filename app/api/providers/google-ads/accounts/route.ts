import { NextResponse } from "next/server";
import { requireOrgAdmin, UnauthorizedError } from "@/lib/auth/require-org";
import { googleAdsProvider } from "@/lib/providers/google-ads/provider";
import { readGoogleRefreshToken } from "@/lib/providers/google-ads/credentials";
import { createServiceRoleClient } from "@/lib/supabase/server";

/**
 * Contas Google Ads acessíveis pela credencial (ETAPA3GOOGLEADS BLOCO 2).
 * Alimenta o passo 2 do wizard. Test Access já resolve aqui (contas de teste).
 */
export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgAdmin();
    const tokenId = new URL(request.url).searchParams.get("tokenId");
    if (!tokenId) {
      return NextResponse.json({ error: "tokenId ausente" }, { status: 400 });
    }

    // Garante que o token pertence à org do usuário (RLS não cobre service_role).
    const supabase = createServiceRoleClient();
    const { data: token } = await supabase
      .from("meta_tokens")
      .select("id, org_id, provider")
      .eq("id", tokenId)
      .maybeSingle();
    if (!token || token.org_id !== orgId || token.provider !== "google") {
      return NextResponse.json({ error: "Credencial não encontrada" }, { status: 404 });
    }

    const refreshToken = await readGoogleRefreshToken(tokenId);
    const accounts = await googleAdsProvider.listAdAccounts(refreshToken);
    return NextResponse.json({ accounts });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[/api/providers/google-ads/accounts]", error);
    return NextResponse.json({ error: "Erro ao listar contas Google Ads" }, { status: 500 });
  }
}
