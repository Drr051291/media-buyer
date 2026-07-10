import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgAdmin, UnauthorizedError } from "@/lib/auth/require-org";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { normalizeCustomerId } from "@/lib/providers/google-ads/client";
import { enqueueGoogleBackfill, enqueueGoogleEntities } from "@/lib/providers/google-ads/sync";
import { cleanupDanglingGoogleTokens } from "@/lib/providers/google-ads/credentials";

const bodySchema = z.object({
  tokenId: z.string().uuid(),
  selectedAccounts: z
    .array(
      z.object({
        customerId: z.string().min(1),
        name: z.string().min(1),
        currency: z.string().default("BRL"),
        timezone: z.string().default("America/Sao_Paulo"),
      }),
    )
    .min(1, "Selecione pelo menos uma conta"),
});

/**
 * Persiste as contas Google Ads escolhidas (ETAPA3GOOGLEADS BLOCO 2/4 passo 3)
 * e dispara os jobs iniciais (estrutura + backfill 90d). Reusa a coluna
 * meta_account_id para o customer_id (sem hífens) + provider='google'.
 */
export async function POST(request: Request) {
  try {
    const { user, orgId } = await requireOrgAdmin();

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos" },
        { status: 400 },
      );
    }
    const { tokenId, selectedAccounts } = parsed.data;

    const supabase = createServiceRoleClient();

    // Garante que a credencial pertence à org do usuário.
    const { data: token } = await supabase
      .from("meta_tokens")
      .select("id, org_id, provider")
      .eq("id", tokenId)
      .maybeSingle();
    if (!token || token.org_id !== orgId || token.provider !== "google") {
      return NextResponse.json({ error: "Credencial não encontrada" }, { status: 404 });
    }

    // Modo Observador é o default seguro (PROJECT.md §6.5).
    const { data: adAccounts, error: accountsError } = await supabase
      .from("ad_accounts")
      .upsert(
        selectedAccounts.map((a) => ({
          org_id: orgId,
          meta_token_id: tokenId,
          meta_account_id: normalizeCustomerId(a.customerId), // customer_id sem hífens
          name: a.name,
          currency: a.currency,
          timezone: a.timezone,
          status: "active",
          autonomy_mode: "observador",
          provider: "google",
        })),
        { onConflict: "org_id,meta_account_id" },
      )
      .select("id, name");

    if (accountsError) throw accountsError;

    // Dispara estrutura + backfill 90d por conta (fatiados via cron).
    for (const account of adAccounts ?? []) {
      await enqueueGoogleEntities(account.id);
      await enqueueGoogleBackfill(account.id, 90);
    }

    // Reconexão pode ter deixado a credencial antiga sem contas — limpa órfãs.
    await cleanupDanglingGoogleTokens(orgId, tokenId).catch(() => {});

    await supabase.from("audit_log").insert({
      org_id: orgId,
      actor: user.id,
      event: "google_ads_connected",
      payload: { meta_token_id: tokenId, accounts: adAccounts },
    });

    return NextResponse.json({ ok: true, connectedAccounts: adAccounts });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[/api/providers/google-ads/connect]", error);
    return NextResponse.json({ error: "Erro ao conectar conta Google Ads" }, { status: 500 });
  }
}
