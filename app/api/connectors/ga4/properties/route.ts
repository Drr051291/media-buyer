import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOrgAdmin, requireOrgMember, UnauthorizedError } from "@/lib/auth/require-org";
import { listProperties } from "@/lib/connectors/ga4/connector";
import { getGa4Connection, readRefreshToken } from "@/lib/connectors/ga4/connection";
import { createServiceRoleClient } from "@/lib/supabase/server";

/** GET: lista propriedades GA4 acessiveis pela conexao (para o dropdown do wizard). */
export async function GET(request: Request) {
  try {
    const { orgId } = await requireOrgMember();
    const connectionId = new URL(request.url).searchParams.get("connectionId");
    if (!connectionId) {
      return NextResponse.json({ error: "connectionId obrigatorio" }, { status: 400 });
    }

    const connection = await getGa4Connection(connectionId);
    if (!connection || connection.org_id !== orgId) {
      return NextResponse.json({ error: "Conexao nao encontrada" }, { status: 404 });
    }

    const refreshToken = await readRefreshToken(connection);
    const properties = await listProperties(refreshToken);
    return NextResponse.json({ properties, selected: connection.ga4_property_id });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[/api/connectors/ga4/properties GET]", error);
    return NextResponse.json({ error: "Erro ao listar propriedades" }, { status: 502 });
  }
}

const selectSchema = z.object({
  connectionId: z.string().uuid(),
  propertyId: z.string().regex(/^properties\/\d+$/, "propertyId invalido"),
  adAccountId: z.string().uuid().nullable().optional(),
});

/** POST: persiste a propriedade escolhida (e o vinculo opcional a ad_account). */
export async function POST(request: Request) {
  try {
    const { orgId } = await requireOrgAdmin();
    const parsed = selectSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados invalidos" },
        { status: 400 },
      );
    }
    const { connectionId, propertyId, adAccountId } = parsed.data;

    const connection = await getGa4Connection(connectionId);
    if (!connection || connection.org_id !== orgId) {
      return NextResponse.json({ error: "Conexao nao encontrada" }, { status: 404 });
    }

    const supabase = createServiceRoleClient();
    const update: Record<string, unknown> = { ga4_property_id: propertyId };
    if (adAccountId !== undefined) update.ad_account_id = adAccountId;

    const { error } = await supabase.from("connections").update(update).eq("id", connectionId);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error("[/api/connectors/ga4/properties POST]", error);
    return NextResponse.json({ error: "Erro ao salvar propriedade" }, { status: 500 });
  }
}
