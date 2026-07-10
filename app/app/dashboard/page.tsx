import Link from "next/link";
import { Plug, Circle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getChannelSummaries } from "@/lib/db/metrics";
import { formatCurrency } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const AUTONOMY_LABEL: Record<string, string> = {
  observador: "Observador",
  copiloto: "Copiloto",
  autopilot: "Autopilot",
};

const PROVIDER_LABEL: Record<string, string> = {
  meta: "Meta",
  google: "Google Ads",
};

const CHANNELS = [
  { value: "all", label: "Todos" },
  { value: "meta", label: "Meta" },
  { value: "google", label: "Google Ads" },
] as const;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string }>;
}) {
  const { channel: channelParam } = await searchParams;
  const channel = CHANNELS.some((c) => c.value === channelParam) ? channelParam! : "all";

  const supabase = await createClient();
  const { data: adAccounts } = await supabase
    .from("ad_accounts")
    .select("id, name, currency, status, autonomy_mode, connected_at, provider")
    .order("connected_at", { ascending: false });

  const allAccounts = adAccounts ?? [];

  if (allAccounts.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <h1 className="font-heading text-3xl font-bold text-primary">Nenhuma conta conectada ainda</h1>
        <p className="max-w-md text-on-surface-variant">
          Conecte sua primeira conta de anúncios (Meta ou Google Ads) para começar a receber
          análises e recomendações.
        </p>
        <div className="flex gap-3">
          <Button render={<Link href="/app/settings/connections">Conectar Meta</Link>} />
          <Button variant="outline" render={<Link href="/app/integrations/google-ads">Conectar Google Ads</Link>} />
        </div>
      </div>
    );
  }

  const channelSummaries = await getChannelSummaries(supabase, 30);
  const accounts =
    channel === "all" ? allAccounts : allAccounts.filter((a) => (a.provider ?? "meta") === channel);

  const activeCount = accounts.filter((a) => a.status === "active").length;
  const autopilotCount = accounts.filter((a) => a.autonomy_mode === "autopilot").length;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="font-heading text-5xl leading-tight font-bold text-primary">Dashboard Geral</h1>
          <p className="mt-1 font-heading text-lg text-on-surface-variant">
            Meta e Google Ads no mesmo painel, comparáveis pelo resultado real.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" render={<Link href="/app/settings/connections">+ Meta</Link>} />
          <Button variant="outline" render={<Link href="/app/integrations/google-ads">+ Google</Link>} />
        </div>
      </div>

      {/* Comparação por canal (últimos 30 dias) — a tese do produto. */}
      {channelSummaries.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-xl text-primary">Por canal · últimos 30 dias</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {channelSummaries.map((s) => (
              <Card key={s.provider} className="paper-texture">
                <CardContent className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="font-heading text-lg text-on-surface">
                      {PROVIDER_LABEL[s.provider] ?? s.provider}
                    </span>
                    <Badge variant="secondary">{s.roas != null ? `${s.roas.toFixed(2)}x ROAS` : "—"}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col">
                      <span className="text-xs text-on-surface-variant">Investimento</span>
                      <span className="font-heading text-2xl text-on-surface">{formatCurrency(s.spend, "BRL")}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-xs text-on-surface-variant">Conversões</span>
                      <span className="font-heading text-2xl text-on-surface">
                        {s.conversions.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

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
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-xl text-primary">Fontes conectadas</h2>
          <div className="flex gap-1">
            {CHANNELS.map((c) => (
              <Link
                key={c.value}
                href={c.value === "all" ? "/app/dashboard" : `/app/dashboard?channel=${c.value}`}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm transition-colors",
                  channel === c.value
                    ? "bg-primary text-primary-foreground"
                    : "text-on-surface-variant hover:bg-surface-container-low",
                )}
              >
                {c.label}
              </Link>
            ))}
          </div>
        </div>
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
                <Badge variant="outline">{PROVIDER_LABEL[account.provider ?? "meta"] ?? account.provider}</Badge>
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
