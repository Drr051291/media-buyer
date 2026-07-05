import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgAdmin, UnauthorizedError } from "@/lib/auth/require-org";
import { validateToken, hasMinimumScope } from "@/lib/meta/debug-token";
import { MetaApiError } from "@/lib/meta/client";
import { createSecret } from "@/lib/vault";
import { createServiceRoleClient } from "@/lib/supabase/server";

const bodySchema = z.object({
  token: z.string().min(20),
  label: z.string().min(1).max(120),
  selectedAccounts: z
    .array(
      z.object({
        id: z.string(), // "act_123456789"
        accountId: z.string(),
        name: z.string(),
        currency: z.string(),
        timezoneName: z.string(),
        accountStatus: z.number(),
      }),
    )
    .min(1, "Selecione pelo menos uma conta"),
});

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
    const { token, label, selectedAccounts } = parsed.data;

    // Nunca confiar em scopes/validade vindos do client — revalida no backend.
    const health = await validateToken(token);
    if (!health.isValid) {
      return NextResponse.json({ error: "Token inválido ou expirado" }, { status: 422 });
    }
    if (!hasMinimumScope(health.scopes)) {
      return NextResponse.json({ error: "Token sem escopo mínimo (ads_read)" }, { status: 422 });
    }

    const vaultSecretId = await createSecret(token, `meta_token:${orgId}:${label}`);
    const supabase = createServiceRoleClient();

    const { data: metaToken, error: tokenError } = await supabase
      .from("meta_tokens")
      .insert({
        org_id: orgId,
        label,
        vault_secret_id: vaultSecretId,
        scopes: health.scopes,
        token_health: "valid",
        expires_at: health.expiresAt,
        last_validated_at: new Date().toISOString(),
        created_by: user.id,
      })
      .select("id")
      .single();

    if (tokenError || !metaToken) {
      throw tokenError ?? new Error("Falha ao salvar token");
    }

    // Modo Observador é o default seguro (PROJECT.md 6.5); upgrade de
    // autonomia é feito depois, na tela de Configuração de Autonomia.
    const { data: adAccounts, error: accountsError } = await supabase
      .from("ad_accounts")
      .upsert(
        selectedAccounts.map((a) => ({
          org_id: orgId,
          meta_token_id: metaToken.id,
          meta_account_id: a.accountId,
          name: a.name,
          currency: a.currency,
          timezone: a.timezoneName,
          account_status: a.accountStatus,
          status: "active",
          autonomy_mode: "observador",
        })),
        { onConflict: "org_id,meta_account_id" },
      )
      .select("id, name");

    if (accountsError) throw accountsError;

    // Dispara os jobs de sync iniciais (PROJECT.md roadmap Fase 1 Etapa 4):
    // estrutura da conta + backfill de 90 dias. Ambos rodam fatiados via
    // /api/cron/sync-entities e /api/cron/sync-insights-backfill.
    if (adAccounts && adAccounts.length > 0) {
      const until = new Date();
      const since = new Date(until);
      since.setDate(since.getDate() - 90);
      const isoDate = (d: Date) => d.toISOString().slice(0, 10);

      const { error: jobsError } = await supabase.from("sync_jobs").insert(
        adAccounts.flatMap((a) => [
          { ad_account_id: a.id, kind: "sync_entities", status: "pending", cursor: {} },
          {
            ad_account_id: a.id,
            kind: "sync_insights_backfill",
            status: "pending",
            cursor: { phase: "submit", since: isoDate(since), until: isoDate(until) },
          },
        ]),
      );
      if (jobsError) throw jobsError;
    }

    await supabase.from("audit_log").insert({
      org_id: orgId,
      actor: user.id,
      event: "meta_token_connected",
      payload: { label, meta_token_id: metaToken.id, accounts: adAccounts },
    });

    return NextResponse.json({ ok: true, connectedAccounts: adAccounts });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof MetaApiError) {
      return NextResponse.json({ error: `Meta: ${error.message}` }, { status: 502 });
    }
    console.error("[/api/meta/connect]", error);
    return NextResponse.json({ error: "Erro ao conectar conta" }, { status: 500 });
  }
}
