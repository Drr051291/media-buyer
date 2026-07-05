import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ReportsPage() {
  const supabase = await createClient();
  const { data: adAccounts } = await supabase.from("ad_accounts").select("id, name").order("name");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Relatórios</h1>
        <p className="text-muted-foreground">
          Relatório semanal gerado pela IA em linguagem de negócio, pronto para enviar ao
          cliente final.
        </p>
      </div>

      {(!adAccounts || adAccounts.length === 0) && (
        <p className="text-sm text-muted-foreground">Nenhuma conta conectada ainda.</p>
      )}

      <div className="flex flex-col gap-2">
        {adAccounts?.map((account) => (
          <Link key={account.id} href={`/app/reports/${account.id}`}>
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardTitle className="text-base">{account.name}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                Ver / gerar relatório semanal
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
