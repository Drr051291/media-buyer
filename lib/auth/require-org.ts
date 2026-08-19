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
    // Determinístico: sem ordenar, "a primeira org" varia entre chamadas para
    // usuários em >1 org — o que fazia o create e a leitura mirarem orgs
    // diferentes. Para escopar a uma conexão específica, use assertOrgMembership.
    .order("org_id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) throw new UnauthorizedError("Usuário sem organização", 403);

  return { user, orgId: membership.org_id as string, role: membership.role as string };
}

/**
 * Autoriza o usuário logado contra uma org ESPECÍFICA (a da conexão/recurso),
 * em vez de re-derivar "a primeira org do usuário". Corrige o 404 espúrio
 * ("Conexao nao encontrada") para usuários em mais de uma organização.
 * `roles` opcional aplica o mesmo gate de papel de requireOrgAdmin/Contributor.
 */
export async function assertOrgMembership(
  orgId: string,
  opts?: { roles?: string[] },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new UnauthorizedError("Não autenticado", 401);

  const { data: membership } = await supabase
    .from("org_members")
    .select("role")
    .eq("user_id", user.id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!membership) throw new UnauthorizedError("Sem acesso a esta organização", 403);
  if (opts?.roles && !opts.roles.includes(membership.role as string)) {
    throw new UnauthorizedError("Permissão insuficiente para esta ação", 403);
  }
  return { user, orgId, role: membership.role as string };
}

/** Conexão de tokens Meta é uma ação administrativa (secao 7: policy is_org_admin). */
export async function requireOrgAdmin() {
  const ctx = await requireOrgMember();
  if (ctx.role !== "owner" && ctx.role !== "admin") {
    throw new UnauthorizedError("Apenas owner/admin pode gerenciar conexões", 403);
  }
  return ctx;
}

/** Espelha `is_org_contributor` (SQL): owner/admin/analyst decidem ações; viewer só lê. */
export async function requireOrgContributor() {
  const ctx = await requireOrgMember();
  if (ctx.role !== "owner" && ctx.role !== "admin" && ctx.role !== "analyst") {
    throw new UnauthorizedError("Viewer não pode aprovar, rejeitar ou reverter ações", 403);
  }
  return ctx;
}

/** Painel /admin (PROJECT.md 2.2): acesso exclusivo do time interno, via `platform_admins`. */
export async function requirePlatformAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new UnauthorizedError("Não autenticado", 401);

  const { data } = await supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!data) throw new UnauthorizedError("Acesso restrito ao time da plataforma", 403);

  return { user };
}
