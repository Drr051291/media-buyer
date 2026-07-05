import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toggleOrgStatus } from "./actions";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  active: "default",
  suspended: "destructive",
  cancelled: "secondary",
};

export default async function AdminTenantsPage() {
  const supabase = await createClient();

  const { data: orgs } = await supabase
    .from("organizations")
    .select("id, name, plan, status, created_at")
    .order("created_at", { ascending: false });

  const rows = await Promise.all(
    (orgs ?? []).map(async (org) => {
      const [{ count: adAccountsCount }, { count: membersCount }] = await Promise.all([
        supabase.from("ad_accounts").select("id", { count: "exact", head: true }).eq("org_id", org.id),
        supabase.from("org_members").select("user_id", { count: "exact", head: true }).eq("org_id", org.id),
      ]);
      return { ...org, adAccountsCount: adAccountsCount ?? 0, membersCount: membersCount ?? 0 };
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Tenants</h1>
        <p className="text-sm text-muted-foreground">
          {rows.length} organização(ões). Suspender bloqueia toda sincronização e execução de ações da conta (kill
          switch).
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((org) => {
          const nextStatus = org.status === "active" ? "suspended" : "active";
          return (
            <Card key={org.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{org.name}</span>
                  <Badge variant={STATUS_VARIANT[org.status] ?? "secondary"}>{org.status}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  plano {org.plan} · {org.adAccountsCount} conta(s) de anúncio · {org.membersCount} membro(s)
                </span>
                {org.status !== "cancelled" && (
                  <form action={toggleOrgStatus.bind(null, org.id, nextStatus)}>
                    <Button type="submit" size="sm" variant={nextStatus === "suspended" ? "destructive" : "outline"}>
                      {nextStatus === "suspended" ? "Suspender" : "Reativar"}
                    </Button>
                  </form>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
