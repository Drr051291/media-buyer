import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConnectWizard } from "./connect-wizard";

const HEALTH_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  valid: "default",
  expiring: "secondary",
  invalid: "destructive",
  revoked: "destructive",
  unknown: "secondary",
};

export default async function ConnectionsPage() {
  const supabase = await createClient();
  const { data: tokens } = await supabase
    .from("meta_tokens")
    .select("id, label, token_health, scopes, last_validated_at, ad_accounts(id, name, status)")
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <div className="space-y-1 text-center">
        <h1 className="font-heading text-4xl font-bold text-primary">Conectar Meta Ads (BYOT)</h1>
        <p className="mx-auto max-w-2xl text-lg text-on-surface-variant">
          Integre sua própria tecnologia (Bring Your Own Token) para dar vida à sua estratégia de anúncios.
        </p>
      </div>

      {tokens && tokens.length > 0 && (
        <div className="flex flex-col gap-3">
          {tokens.map((t) => (
            <Card key={t.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  {t.label}
                  <Badge variant={HEALTH_VARIANT[t.token_health] ?? "secondary"}>
                    {t.token_health}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
                <span>Escopos: {t.scopes?.join(", ") || "—"}</span>
                <span>
                  Contas conectadas:{" "}
                  {Array.isArray(t.ad_accounts) && t.ad_accounts.length > 0
                    ? t.ad_accounts.map((a) => a.name).join(", ")
                    : "nenhuma"}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ConnectWizard />
    </div>
  );
}
