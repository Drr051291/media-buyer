import { NextResponse } from "next/server";
import { z } from "zod";
import { assertOrgMembership, UnauthorizedError } from "@/lib/auth/require-org";
import { listProperties } from "@/lib/connectors/ga4/connector";
import { getGa4Connection, readRefreshToken } from "@/lib/connectors/ga4/connection";
import { createServiceRoleClient } from "@/lib/supabase/server";

/** GET: lista propriedades GA4 acessiveis pela conexao (para o dropdown do wizard). */
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
    // Autoriza contra a org DA conexão (não "a primeira org do usuário").
    await assertOrgMembership(connection.org_id);

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
  propertyName: z.string().trim().min(1).max(200).optional(),
  adAccountId: z.string().uuid().nullable().optional(),
});

/** POST: persiste a propriedade escolhida (e o vinculo opcional a ad_account). */
export async function POST(request: Request) {
  try {
    const parsed = selectSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados invalidos" },
        { status: 400 },
      );
    }
    const { connectionId, propertyId, propertyName, adAccountId } = parsed.data;

    const connection = await getGa4Connection(connectionId);
    if (!connection) {
      return NextResponse.json({ error: "Conexao nao encontrada" }, { status: 404 });
    }
    // Escrita: exige owner/admin na org DA conexão.
    await assertOrgMembership(connection.org_id, { roles: ["owner", "admin"] });

    const supabase = createServiceRoleClient();
    const update: Record<string, unknown> = { ga4_property_id: propertyId };
    // Nome amigavel da propriedade (para exibir no painel). Se o cliente nao
    // mandar, mantem o que ja estava — nunca sobrescreve com vazio.
    if (propertyName) update.ga4_property_name = propertyName;
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
