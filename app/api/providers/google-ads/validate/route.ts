import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgAdmin, UnauthorizedError } from "@/lib/auth/require-org";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { googleAdsProvider } from "@/lib/providers/google-ads/provider";
import { readGoogleRefreshToken } from "@/lib/providers/google-ads/credentials";

const bodySchema = z.object({ tokenId: z.string().uuid(), customerId: z.string().min(1) });

/**
 * Prova de vida do passo 3 do wizard (ETAPA3GOOGLEADS BLOCO 4): roda um GAQL de
 * teste (últimos 7d) e devolve nº de campanhas ativas + investimento — a prova
 * do ÷1e6 (spend confere com a UI do Google Ads).
 */
export async function POST(request: Request) {
  try {
    const { orgId } = await requireOrgAdmin();
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }
    const { tokenId, customerId } = parsed.data;

    const supabase = createServiceRoleClient();
    const { data: token } = await supabase
      .from("meta_tokens")
      .select("org_id, provider")
      .eq("id", tokenId)
      .maybeSingle();
    if (!token || token.org_id !== orgId || token.provider !== "google") {
      return NextResponse.json({ error: "Credencial não encontrada" }, { status: 404 });
    }

    const refreshToken = await readGoogleRefreshToken(tokenId);
    const end = new Date().toISOString().slice(0, 10);
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    const start = startDate.toISOString().slice(0, 10);

    const [campaigns, insights] = await Promise.all([
      googleAdsProvider.fetchEntities(refreshToken, customerId, "campaign"),
      googleAdsProvider.fetchInsights(refreshToken, customerId, start, end),
    ]);

    const activeCampaigns = campaigns.filter((c) => c.status === "ENABLED").length;
    const spend = insights.reduce((sum, r) => sum + r.spend, 0);
    const conversions = insights.reduce((sum, r) => sum + r.conversions, 0);

    return NextResponse.json({ windowDays: 7, activeCampaigns, spend, conversions });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[/api/providers/google-ads/validate]", error);
    return NextResponse.json({ error: "Falha ao validar a conta Google Ads" }, { status: 500 });
  }
}
