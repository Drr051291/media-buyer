import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const LOOKBACK_DAYS = 30;

function formatUsd(n: number): string {
  return `US$ ${n.toFixed(2)}`;
}

export default async function AdminLlmUsagePage() {
  const supabase = await createClient();
  const since = new Date();
  since.setDate(since.getDate() - LOOKBACK_DAYS);
  const sinceIso = since.toISOString();

  const { data: usageRaw } = await supabase
    .from("llm_usage")
    .select("org_id, purpose, cost_usd, input_tokens, output_tokens, organizations(name)")
    .gte("created_at", sinceIso);

  const rows = usageRaw ?? [];

  const totalCost = rows.reduce((sum, r) => sum + Number(r.cost_usd), 0);

  const byOrg = new Map<string, { name: string; cost: number; inputTokens: number; outputTokens: number }>();
  const byPurpose = new Map<string, { cost: number; count: number }>();

  for (const r of rows) {
    const org = Array.isArray(r.organizations) ? r.organizations[0] : r.organizations;
    const orgEntry = byOrg.get(r.org_id) ?? { name: org?.name ?? "?", cost: 0, inputTokens: 0, outputTokens: 0 };
    orgEntry.cost += Number(r.cost_usd);
    orgEntry.inputTokens += r.input_tokens;
    orgEntry.outputTokens += r.output_tokens;
    byOrg.set(r.org_id, orgEntry);

    const purposeEntry = byPurpose.get(r.purpose) ?? { cost: 0, count: 0 };
    purposeEntry.cost += Number(r.cost_usd);
    purposeEntry.count += 1;
    byPurpose.set(r.purpose, purposeEntry);
  }

  const orgRows = [...byOrg.values()].sort((a, b) => b.cost - a.cost);
  const purposeRows = [...byPurpose.entries()].sort((a, b) => b[1].cost - a[1].cost);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-4xl font-bold text-primary">Custo de LLM</h1>
        <p className="text-sm text-muted-foreground">Últimos {LOOKBACK_DAYS} dias, todos os tenants.</p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <p className="text-xs text-muted-foreground">Custo total estimado</p>
          <p className="font-heading text-2xl font-semibold text-on-surface">{formatUsd(totalCost)}</p>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Por tenant</h2>
        {orgRows.length === 0 && <p className="text-sm text-muted-foreground">Sem uso de LLM no período.</p>}
        {orgRows.map((org, i) => (
          <Card key={i}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-sm font-medium">
                <span>{org.name}</span>
                <span>{formatUsd(org.cost)}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {org.inputTokens.toLocaleString("pt-BR")} tokens de input · {org.outputTokens.toLocaleString("pt-BR")}{" "}
              tokens de output
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Por finalidade</h2>
        {purposeRows.map(([purpose, data]) => (
          <div key={purpose} className="flex items-center justify-between text-sm">
            <span>
              {purpose} ({data.count} chamada{data.count === 1 ? "" : "s"})
            </span>
            <span className="text-muted-foreground">{formatUsd(data.cost)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
