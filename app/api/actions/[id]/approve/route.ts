import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContributor, UnauthorizedError } from "@/lib/auth/require-org";
import { executeAction } from "@/lib/engine/executor";

/**
 * Aprova uma action 'proposed' e dispara a execução (PROJECT.md 6.5). A
 * atualização de status usa o client com sessão do usuário — a RLS
 * (`is_org_contributor`) já garante que viewer não aprova nada. Contas em
 * modo Observador nunca chegam a executar, mesmo se aprovadas.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const { user } = await requireOrgContributor();
    const supabase = await createClient();

    const { data: action } = await supabase.from("actions").select("id, ad_account_id, status").eq("id", id).maybeSingle();
    if (!action) {
      return NextResponse.json({ error: "Ação não encontrada" }, { status: 404 });
    }
    if (action.status !== "proposed") {
      return NextResponse.json(
        { error: `Ação precisa estar 'proposed' (status atual: ${action.status})` },
        { status: 409 },
      );
    }

    const { data: adAccount } = await supabase
      .from("ad_accounts")
      .select("autonomy_mode")
      .eq("id", action.ad_account_id)
      .single();

    if (adAccount?.autonomy_mode === "observador") {
      return NextResponse.json(
        { error: "Conta está em modo Observador — nenhuma execução automática é permitida" },
        { status: 403 },
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("actions")
      .update({ status: "approved", decided_by: user.id, decided_at: new Date().toISOString() })
      .eq("id", id)
      .eq("status", "proposed")
      .select("id")
      .maybeSingle();

    if (updateError || !updated) {
      return NextResponse.json(
        { error: "Não foi possível aprovar (sem permissão ou a ação mudou de estado)" },
        { status: 409 },
      );
    }

    const result = await executeAction(id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Erro ao aprovar ação" }, { status: 500 });
  }
}
