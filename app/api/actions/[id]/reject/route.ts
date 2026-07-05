import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireOrgContributor, UnauthorizedError } from "@/lib/auth/require-org";

const bodySchema = z.object({ reason: z.string().trim().max(2000).optional() });

/**
 * Rejeita uma action 'proposed' — vira memória do agente (PROJECT.md 6.4,
 * item 4: "recomendações rejeitadas pelo usuário e o motivo"). O motivo é
 * opcional (`reason`) e gravado em `decision_note` para o Reasoner aprender
 * a preferência do gestor. Nenhuma chamada à Meta acontece aqui.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const { user } = await requireOrgContributor();
    const supabase = await createClient();

    const parsedBody = bodySchema.safeParse(await request.json().catch(() => ({})));
    const reason = parsedBody.success ? (parsedBody.data.reason ?? null) : null;

    const { data: action } = await supabase.from("actions").select("id, status").eq("id", id).maybeSingle();
    if (!action) {
      return NextResponse.json({ error: "Ação não encontrada" }, { status: 404 });
    }
    if (action.status !== "proposed") {
      return NextResponse.json(
        { error: `Ação precisa estar 'proposed' (status atual: ${action.status})` },
        { status: 409 },
      );
    }

    const { data: updated, error: updateError } = await supabase
      .from("actions")
      .update({
        status: "rejected",
        decided_by: user.id,
        decided_at: new Date().toISOString(),
        decision_note: reason,
      })
      .eq("id", id)
      .eq("status", "proposed")
      .select("id")
      .maybeSingle();

    if (updateError || !updated) {
      return NextResponse.json(
        { error: "Não foi possível rejeitar (sem permissão ou a ação mudou de estado)" },
        { status: 409 },
      );
    }

    return NextResponse.json({ status: "rejected" });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Erro ao rejeitar ação" }, { status: 500 });
  }
}
