import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default async function AccountsPage() {
  const supabase = await createClient();
  const { data: adAccounts } = await supabase
    .from("ad_accounts")
    .select("id, name, currency, status, autonomy_mode")
    .order("name");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Contas</h1>

      {(!adAccounts || adAccounts.length === 0) && (
        <p className="text-muted-foreground">
          Nenhuma conta conectada ainda. Conecte uma em{" "}
          <Link href="/app/settings/connections" className="underline underline-offset-4">
            Conexões
          </Link>
          .
        </p>
      )}

      <div className="flex flex-col gap-2">
        {adAccounts?.map((account) => (
          <Link key={account.id} href={`/app/accounts/${account.id}`}>
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  {account.name}
                  <Badge variant={account.status === "active" ? "default" : "secondary"}>
                    {account.status}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {account.currency} · modo {account.autonomy_mode}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
