import "server-only";
import { createClient } from "@/lib/supabase/server";

export class UnauthorizedError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

/** Usuário logado + org ativa (primeira org do usuário) + seu papel nela. */
export async function requireOrgMember() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new UnauthorizedError("Não autenticado", 401);

  const { data: membership } = await supabase
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) throw new UnauthorizedError("Usuário sem organização", 403);

  return { user, orgId: membership.org_id as string, role: membership.role as string };
}

/** Conexão de tokens Meta é uma ação administrativa (secao 7: policy is_org_admin). */
export async function requireOrgAdmin() {
  const ctx = await requireOrgMember();
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    throw new UnauthorizedError("Apenas owner/admin pode gerenciar conexões", 403);
  }
  return ctx;
}
