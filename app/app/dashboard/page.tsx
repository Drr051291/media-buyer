import Link from "next/link";
import { Plug, Circle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const AUTONOMY_LABEL: Record<string, string> = {
  observador: "Observador",
  copiloto: "Copiloto",
  autopilot: "Autopilot",
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: adAccounts } = await supabase
    .from("ad_accounts")
    .select("id, name, currency, status, autonomy_mode, connected_at")
    .order("connected_at", { ascending: false });

  const accounts = adAccounts ?? [];

  if (accounts.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <h1 className="font-heading text-3xl font-bold text-primary">Nenhuma conta conectada ainda</h1>
        <p className="max-w-md text-on-surface-variant">
          Conecte sua primeira conta de anúncios Meta para começar a receber análises e recomendações.
        </p>
        <Button render={<Link href="/app/settings/connections">Conectar conta Meta</Link>} />
      </div>
    );
  }

  const activeCount = accounts.filter((a) => a.status === "active").length;
  const autopilotCount = accounts.filter((a) => a.autonomy_mode === "autopilot").length;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="font-heading text-5xl leading-tight font-bold text-primary">Dashboard Geral</h1>
          <p className="mt-1 font-heading text-lg text-on-surface-variant">
            Uma visão unificada do seu ecossistema de contas de anúncios.
          </p>
        </div>
        <Button variant="outline" render={<Link href="/app/settings/connections">+ Conectar conta</Link>} />
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="paper-texture">
          <CardContent className="flex flex-col gap-1">
            <span className="text-sm text-on-surface-variant">Contas conectadas</span>
            <span className="font-heading text-3xl text-on-surface">{accounts.length}</span>
          </CardContent>
        </Card>
        <Card className="paper-texture">
          <CardContent className="flex flex-col gap-1">
            <span className="text-sm text-on-surface-variant">Ativas</span>
            <span className="font-heading text-3xl text-on-surface">{activeCount}</span>
          </CardContent>
        </Card>
        <Card className="paper-texture">
          <CardContent className="flex flex-col gap-1">
            <span className="text-sm text-on-surface-variant">Em Autopilot</span>
            <span className="font-heading text-3xl text-on-surface">{autopilotCount}</span>
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-xl text-primary">Fontes conectadas</h2>
        <div className="flex flex-col gap-2">
          {accounts.map((account) => (
            <Link
              key={account.id}
              href={`/app/accounts/${account.id}`}
              className="artisanal-card flex items-center justify-between rounded-lg border border-outline-variant bg-surface-bright p-3 transition-colors hover:bg-surface-container-low"
            >
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded bg-secondary-container/50 text-on-secondary-container">
                  <Plug className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-on-surface">{account.name}</p>
                  <p className="text-xs text-on-surface-variant">
                    {account.currency} · {AUTONOMY_LABEL[account.autonomy_mode] ?? account.autonomy_mode}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={account.status === "active" ? "default" : "secondary"}>{account.status}</Badge>
                <Circle
                  className={`size-2 ${account.status === "active" ? "fill-green-500 text-green-500" : "fill-outline-variant text-outline-variant"}`}
                />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
