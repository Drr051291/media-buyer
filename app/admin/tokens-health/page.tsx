import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const HEALTH_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  valid: "default",
  expiring: "secondary",
  invalid: "destructive",
  revoked: "destructive",
  unknown: "secondary",
};

export default async function AdminTokensHealthPage() {
  const supabase = await createClient();

  const { data: tokens } = await supabase
    .from("meta_tokens")
    .select(
      "id, label, token_health, scopes, last_validated_at, organizations(name), ad_accounts(id, name, status)",
    )
    .order("last_validated_at", { ascending: true, nullsFirst: true });

  const rows = tokens ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Saúde de tokens</h1>
        <p className="text-sm text-muted-foreground">{rows.length} token(s) Meta, de todos os tenants.</p>
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((t) => {
          const org = Array.isArray(t.organizations) ? t.organizations[0] : t.organizations;
          const accounts = t.ad_accounts ?? [];
          return (
            <Card key={t.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span>
                    {t.label} <span className="text-xs font-normal text-muted-foreground">({org?.name ?? "?"})</span>
                  </span>
                  <Badge variant={HEALTH_VARIANT[t.token_health] ?? "secondary"}>{t.token_health}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 text-sm text-muted-foreground">
                <span>Escopos: {t.scopes?.join(", ") || "—"}</span>
                <span>
                  Última validação:{" "}
                  {t.last_validated_at ? new Date(t.last_validated_at).toLocaleString("pt-BR") : "nunca"}
                </span>
                <span>
                  Contas: {accounts.length > 0 ? accounts.map((a) => `${a.name} (${a.status})`).join(", ") : "nenhuma"}
                </span>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
