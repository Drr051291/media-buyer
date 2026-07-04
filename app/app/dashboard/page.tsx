import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: adAccounts } = await supabase
    .from("ad_accounts")
    .select("id, name, currency, status, autonomy_mode, connected_at")
    .order("connected_at", { ascending: false });

  if (!adAccounts || adAccounts.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <h1 className="text-2xl font-semibold">Nenhuma conta conectada ainda</h1>
        <p className="max-w-md text-muted-foreground">
          Conecte sua primeira conta de anúncios Meta para começar a receber
          análises e recomendações.
        </p>
        <Button render={<Link href="/app/settings/connections">Conectar conta Meta</Link>} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <Button variant="outline" render={<Link href="/app/settings/connections">+ Conectar conta</Link>} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {adAccounts.map((account) => (
          <Card key={account.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                {account.name}
                <Badge variant={account.status === "active" ? "default" : "secondary"}>
                  {account.status}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-1 text-sm text-muted-foreground">
              <span>Moeda: {account.currency}</span>
              <span>Modo: {account.autonomy_mode}</span>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
