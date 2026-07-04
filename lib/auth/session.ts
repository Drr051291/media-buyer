import "server-only";
import { createClient } from "@/lib/supabase/server";

export type OrgMembership = {
  org_id: string;
  role: "owner" | "admin" | "analyst" | "viewer";
  organization: {
    id: string;
    name: string;
    plan: string;
    status: string;
  };
};

/**
 * Sessao atual + organizacoes do usuario. Um usuario pode pertencer a mais de
 * uma org (ex: freelancer que colabora com duas agencias); a V1 assume a
 * primeira como ativa. Troca de org fica para uma fase futura (cookie de org
 * ativa + seletor no header).
 */
export async function getSessionContext() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { user: null, memberships: [] as OrgMembership[], activeOrg: null };
  }

  const { data: memberships } = await supabase
    .from("org_members")
    .select("org_id, role, organization:organizations(id, name, plan, status)")
    .eq("user_id", user.id);

  const normalized = (memberships ?? []).map((m) => ({
    ...m,
    organization: Array.isArray(m.organization) ? m.organization[0] : m.organization,
  })) as unknown as OrgMembership[];

  return {
    user,
    memberships: normalized,
    activeOrg: normalized[0]?.organization ?? null,
  };
}

export async function isPlatformAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  return !!data;
}
