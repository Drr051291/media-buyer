import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgAdmin, requireOrgMember, UnauthorizedError } from "@/lib/auth/require-org";
import { getHubspotConnection } from "@/lib/connectors/hubspot/connection";
import { accessTokenFor, readCredentials } from "@/lib/connectors/hubspot/credentials";
import { searchObjects } from "@/lib/connectors/hubspot/client";
import { initHubspotSync, syncHubspotSlice } from "@/lib/connectors/hubspot/sync";
import { CONTACT_PROPERTIES, DEAL_PROPERTIES } from "@/lib/connectors/hubspot/map";

const TEST_WINDOW_DAYS = 28;

/**
 * GET: prova de vida do conector antes de confirmar — conta contatos e
 * negócios modificados nos últimos 28 dias (o `total` da Search API, sem
 * paginar). Espelha o relatório de teste do wizard GA4.
 */
export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgMember();
    const connectionId = new URL(request.url).searchParams.get("connectionId");
    if (!connectionId) {
      return NextResponse.json({ error: "connectionId obrigatório" }, { status: 400 });
    }
    const connection = await getHubspotConnection(connectionId);
    if (!connection || connection.org_id !== orgId) {
      return NextResponse.json({ error: "Conexão não encontrada" }, { status: 404 });
    }

    const credentials = await readCredentials(connection.credentials_vault_id);
    const accessToken = await accessTokenFor(credentials);
    const sinceMs = Date.now() - TEST_WINDOW_DAYS * 24 * 60 * 60 * 1000;

    const [contacts, deals] = await Promise.all([
      searchObjects(accessToken, {
        objectType: "contacts",
        sinceMs,
        properties: CONTACT_PROPERTIES,
        limit: 1,
      }),
      searchObjects(accessToken, {
        objectType: "deals",
        sinceMs,
        properties: DEAL_PROPERTIES,
        limit: 1,
      }),
    ]);

    return NextResponse.json({
      windowDays: TEST_WINDOW_DAYS,
      contacts: contacts.total,
      deals: deals.total,
      portalId: connection.hubspot_portal_id,
    });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[/api/connectors/hubspot/confirm GET]", error);
    return NextResponse.json({ error: "Erro ao rodar teste de acesso" }, { status: 502 });
  }
}

const confirmSchema = z.object({ connectionId: z.string().uuid() });

/**
 * POST: confirma a conexão — inicializa os cursores (backfill de 180d via o
 * mesmo mecanismo incremental) e roda a primeira fatia síncrona para o feed
 * já ter eventos.
 */
export async function POST(request: Request) {
  try {
    const { user, orgId } = await requireOrgAdmin();
    const parsed = confirmSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
    }
    const { connectionId } = parsed.data;

    const connection = await getHubspotConnection(connectionId);
    if (!connection || connection.org_id !== orgId) {
      return NextResponse.json({ error: "Conexão não encontrada" }, { status: 404 });
    }

    await initHubspotSync(connectionId);
    const first = await syncHubspotSlice(connectionId).catch(() => ({ processed: false as const }));

    const { createServiceRoleClient } = await import("@/lib/supabase/server");
    await createServiceRoleClient().from("audit_log").insert({
      org_id: orgId,
      actor: user.id,
      event: "hubspot_confirmed",
      payload: { connection_id: connectionId, portal_id: connection.hubspot_portal_id },
    });

    return NextResponse.json({ ok: true, firstSync: first.processed });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[/api/connectors/hubspot/confirm POST]", error);
    return NextResponse.json({ error: "Erro ao confirmar conexão" }, { status: 500 });
  }
}
