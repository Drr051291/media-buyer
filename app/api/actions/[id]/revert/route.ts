import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContributor, UnauthorizedError } from "@/lib/auth/require-org";
import { revertAction } from "@/lib/engine/executor";

/**
 * Reverte uma action 'executed' usando o previous_state capturado no
 * momento da execução (rollback assistido, PROJECT.md 6.5). A checagem de
 * papel (contributor) acontece aqui porque `revertAction` usa o
 * service_role client e ignora RLS.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    await requireOrgContributor();
    const supabase = await createClient();

    const { data: action } = await supabase.from("actions").select("id, status").eq("id", id).maybeSingle();
    if (!action) {
      return NextResponse.json({ error: "Ação não encontrada" }, { status: 404 });
    }
    if (action.status !== "executed") {
      return NextResponse.json(
        { error: `Só é possível reverter ações executadas (status atual: ${action.status})` },
        { status: 409 },
      );
    }

    const result = await revertAction(id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Erro ao reverter ação" }, { status: 500 });
  }
}
