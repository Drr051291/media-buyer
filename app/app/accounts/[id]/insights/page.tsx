import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const SEVERITY_RANK: Record<string, number> = { critical: 0, warning: 1, info: 2 };
const SEVERITY_VARIANT: Record<string, "destructive" | "secondary" | "default"> = {
  critical: "destructive",
  warning: "secondary",
  info: "default",
};

interface EntityRef {
  level?: string;
  id?: string;
  name?: string;
}

interface ProposedAction {
  type: string;
  entity_ref: EntityRef;
  reasoning: string;
  expected_impact: string;
  risk: "low" | "medium" | "high";
  priority: number;
}

const RISK_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  low: "default",
  medium: "secondary",
  high: "destructive",
};

export default async function InsightsFeedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: account } = await supabase.from("ad_accounts").select("id, name").eq("id", id).maybeSingle();
  if (!account) notFound();

  const { data: snapshot } = await supabase
    .from("snapshots")
    .select("id, date, diagnosis, health_score, proposed_actions, llm_model")
    .eq("ad_account_id", id)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: insightsRaw } = snapshot
    ? await supabase
        .from("insights")
        .select("finding, evidence, severity, entity_ref")
        .eq("snapshot_id", snapshot.id)
    : { data: [] };

  const insights = [...(insightsRaw ?? [])].sort(
    (a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9),
  );
  const proposedActions = ((snapshot?.proposed_actions as ProposedAction[] | null) ?? []).sort(
    (a, b) => a.priority - b.priority,
  );

  if (!snapshot) {
    return (
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Insights — {account.name}</h1>
        <p className="text-muted-foreground">
          Ainda não há análise para esta conta. A primeira roda assim que o job diário
          processar os dados sincronizados.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Insights — {account.name}</h1>
        <p className="text-sm text-muted-foreground">
          Análise de {new Date(snapshot.date).toLocaleDateString("pt-BR")} · gerado por {snapshot.llm_model}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Diagnóstico
            <Badge variant={snapshot.health_score >= 70 ? "default" : snapshot.health_score >= 40 ? "secondary" : "destructive"}>
              Health score: {snapshot.health_score}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">{snapshot.diagnosis}</p>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Achados ({insights.length})</h2>
        {insights.length === 0 && <p className="text-sm text-muted-foreground">Nenhum achado relevante hoje.</p>}
        {insights.map((insight, i) => (
          <Card key={i}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-sm font-medium">
                {(insight.entity_ref as EntityRef)?.name ?? "Conta"}
                <Badge variant={SEVERITY_VARIANT[insight.severity] ?? "default"}>{insight.severity}</Badge>
              </CardTitle>
              <CardDescription>{insight.finding}</CardDescription>
            </CardHeader>
            {Array.isArray(insight.evidence) && insight.evidence.length > 0 && (
              <CardContent>
                <ul className="list-inside list-disc text-xs text-muted-foreground">
                  {(insight.evidence as string[]).map((e, j) => (
                    <li key={j}>{e}</li>
                  ))}
                </ul>
              </CardContent>
            )}
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Ações propostas ({proposedActions.length})</h2>
        <p className="text-xs text-muted-foreground">
          Somente leitura nesta fase — execução chega na Fase 3 (Copiloto).
        </p>
        {proposedActions.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma ação proposta hoje.</p>
        )}
        {proposedActions.map((action, i) => (
          <Card key={i}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-sm font-medium">
                <span>
                  {action.type} — {action.entity_ref?.name ?? "Conta"}
                </span>
                <Badge variant={RISK_VARIANT[action.risk] ?? "default"}>risco {action.risk}</Badge>
              </CardTitle>
              <CardDescription>{action.reasoning}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">Impacto esperado: {action.expected_impact}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
