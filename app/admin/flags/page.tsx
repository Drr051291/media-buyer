import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { setFeatureFlag } from "./actions";

const AUTOPILOT_FLAG = "autopilot_enabled";

export default async function AdminFlagsPage() {
  const supabase = await createClient();

  const [{ data: orgs }, { data: flags }] = await Promise.all([
    supabase.from("organizations").select("id, name").order("name"),
    supabase.from("feature_flags").select("org_id, flag, enabled").eq("flag", AUTOPILOT_FLAG),
  ]);

  const enabledByOrg = new Set((flags ?? []).filter((f) => f.enabled).map((f) => f.org_id));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-4xl font-bold text-primary">Feature flags</h1>
        <p className="text-sm text-muted-foreground">
          {AUTOPILOT_FLAG}: libera a opção Autopilot no seletor de autonomia de cada conta do tenant.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {(orgs ?? []).map((org) => {
          const enabled = enabledByOrg.has(org.id);
          return (
            <Card key={org.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-sm font-medium">
                  <span>{org.name}</span>
                  <Badge variant={enabled ? "default" : "secondary"}>
                    autopilot {enabled ? "liberado" : "bloqueado"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <form action={setFeatureFlag.bind(null, org.id, AUTOPILOT_FLAG, !enabled)}>
                  <Button type="submit" size="sm" variant="outline">
                    {enabled ? "Bloquear" : "Liberar"} autopilot
                  </Button>
                </form>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
