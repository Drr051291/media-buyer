import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgAdmin, UnauthorizedError } from "@/lib/auth/require-org";
import { getAccountInfo } from "@/lib/connectors/hubspot/client";
import { serializeCredentials } from "@/lib/connectors/hubspot/credentials";
import { createSecret, deleteSecret } from "@/lib/vault";
import { createServiceRoleClient } from "@/lib/supabase/server";

const connectSchema = z.object({
  token: z.string().min(20),
  adAccountId: z.string().uuid().nullish(),
});

/**
 * Caminho alternativo BYOT (ETAPA-HUBSPOT.md seção 3.2): o cliente cola o
 * token de um Private App criado no próprio portal (mesma filosofia do token
 * de System User da Meta). Valida o token contra a API, descobre o portal e
 * faz upsert da connection com a credencial no Vault.
 */
export async function POST(request: Request) {
  try {
    const { user, orgId } = await requireOrgAdmin();
    const parsed = connectSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }
    const { token, adAccountId } = parsed.data;

    // Prova de vida do token: se não autentica, nem chega ao Vault.
    let portalId: string;
    try {
      const account = await getAccountInfo(token);
      portalId = account.portalId;
    } catch {
      return NextResponse.json(
        { error: "Token inválido ou sem os escopos necessários (crm.objects.*.read)" },
        { status: 422 },
      );
    }

    const supabase = createServiceRoleClient();

    // Um portal pertence a UM tenant (o webhook resolve tenant por portalId).
    const { data: portalTaken } = await supabase
      .from("connections")
      .select("id")
      .eq("connector_id", "hubspot")
      .eq("hubspot_portal_id", portalId)
      .neq("org_id", orgId)
      .maybeSingle();
    if (portalTaken) {
      return NextResponse.json(
        { error: "Este portal HubSpot já está conectado a outra organização" },
        { status: 409 },
      );
    }

    const { data: existing } = await supabase
      .from("connections")
      .select("id, credentials_vault_id")
      .eq("org_id", orgId)
      .eq("connector_id", "hubspot")
      .maybeSingle();

    const vaultSecretId = await createSecret(
      serializeCredentials({ mode: "private_app", token }),
      `hubspot_private_app:${orgId}`,
    );

    let connectionId: string;
    if (existing) {
      const { error: updateError } = await supabase
        .from("connections")
        .update({
          credentials_vault_id: vaultSecretId,
          hubspot_portal_id: portalId,
          auth_mode: "api_key",
          status: "active",
          ad_account_id: adAccountId ?? undefined,
          last_sync_at: null,
        })
        .eq("id", existing.id);
      if (updateError) throw updateError;
      connectionId = existing.id;
      if (existing.credentials_vault_id) {
        await deleteSecret(existing.credentials_vault_id).catch(() => {});
      }
    } else {
      const { data: inserted, error: insertError } = await supabase
        .from("connections")
        .insert({
          org_id: orgId,
          ad_account_id: adAccountId ?? null,
          connector_id: "hubspot",
          category: "crm",
          label: "HubSpot",
          auth_mode: "api_key",
          credentials_vault_id: vaultSecretId,
          hubspot_portal_id: portalId,
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
        portal_id: portalId,
        mode: "private_app",
        linked_ad_account_id: adAccountId ?? null,
      },
    });

    return NextResponse.json({ connectionId, portalId });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[/api/connectors/hubspot/connect]", error);
    return NextResponse.json({ error: "Erro ao conectar HubSpot" }, { status: 500 });
  }
}
