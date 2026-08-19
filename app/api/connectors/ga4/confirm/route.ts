import { NextResponse } from "next/server";
import { z } from "zod";
import { assertOrgMembership, UnauthorizedError } from "@/lib/auth/require-org";
import { getGa4Connection, readRefreshToken } from "@/lib/connectors/ga4/connection";
import { ga4Connector } from "@/lib/connectors/ga4/connector";
import { initBackfill, syncIncremental } from "@/lib/connectors/ga4/sync";

const TEST_WINDOW_DAYS = 28;

function shiftIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * GET: relatorio de teste (ultimos 28d) — prova de vida do conector antes de
 * confirmar. Retorna totais de sessoes/conversoes/receita (BLOCO 4 passo 3).
 */
export async function GET(request: Request) {
  try {
    const connectionId = new URL(request.url).searchParams.get("connectionId");
    if (!connectionId) {
      return NextResponse.json({ error: "connectionId obrigatorio" }, { status: 400 });
    }
    const connection = await getGa4Connection(connectionId);
    if (!connection) {
      return NextResponse.json({ error: "Conexao nao encontrada" }, { status: 404 });
    }
    await assertOrgMembership(connection.org_id);
    if (!connection.ga4_property_id) {
      return NextResponse.json({ error: "Selecione uma propriedade primeiro" }, { status: 409 });
    }

    const refreshToken = await readRefreshToken(connection);
    const rows = await ga4Connector.fetchWindow(
      refreshToken,
      connection.ga4_property_id,
      shiftIso(-TEST_WINDOW_DAYS),
      shiftIso(0),
    );

    const totals = rows.reduce(
      (acc, r) => {
        acc.sessions += r.sessions;
        acc.conversions += r.conversions;
        acc.revenue += r.purchase_revenue;
        return acc;
      },
      { sessions: 0, conversions: 0, revenue: 0 },
    );

    return NextResponse.json({ windowDays: TEST_WINDOW_DAYS, ...totals });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[/api/connectors/ga4/confirm GET]", error);
    return NextResponse.json({ error: "Erro ao rodar relatorio de teste" }, { status: 502 });
  }
}

const confirmSchema = z.object({ connectionId: z.string().uuid() });

/**
 * POST: confirma a conexao — agenda o backfill de 90d e roda o primeiro sync
 * incremental para o dashboard ter dado imediato.
 */
export async function POST(request: Request) {
  try {
    const parsed = confirmSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados invalidos" }, { status: 400 });
    }
    const { connectionId } = parsed.data;

    const connection = await getGa4Connection(connectionId);
    if (!connection) {
      return NextResponse.json({ error: "Conexao nao encontrada" }, { status: 404 });
    }
    const { user, orgId } = await assertOrgMembership(connection.org_id, {
      roles: ["owner", "admin"],
    });
    if (!connection.ga4_property_id) {
      return NextResponse.json({ error: "Selecione uma propriedade primeiro" }, { status: 409 });
    }

    await initBackfill(connectionId);
    // Primeiro incremental sincrono: dashboard já mostra os últimos dias.
    const first = await syncIncremental(connectionId).catch(() => ({ processed: false }));

    const { createServiceRoleClient } = await import("@/lib/supabase/server");
    await createServiceRoleClient().from("audit_log").insert({
      org_id: orgId,
      actor: user.id,
      event: "ga4_confirmed",
      payload: { connection_id: connectionId, property_id: connection.ga4_property_id },
    });

    return NextResponse.json({ ok: true, firstSync: first.processed });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[/api/connectors/ga4/confirm POST]", error);
    return NextResponse.json({ error: "Erro ao confirmar conexao" }, { status: 500 });
  }
}
