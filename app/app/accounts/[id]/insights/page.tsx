import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProposedActionButtons, RevertActionButton } from "./action-buttons";

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

interface ActionResultRow {
  metric: string;
  baseline_value: number | null;
  d4_value: number | null;
  d7_value: number | null;
  delta_pct: number | null;
  verdict: string | null;
}

interface ActionRow {
  id: string;
  type: string;
  entity_ref: EntityRef;
  reasoning: string | null;
  expected_impact: string | null;
  risk: "low" | "medium" | "high" | null;
  priority: number | null;
  status: string;
  error: string | null;
  decision_note: string | null;
  proposed_at: string;
  action_results: ActionResultRow[] | ActionResultRow | null;
}

const RISK_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  low: "default",
  medium: "secondary",
  high: "destructive",
};

const STATUS_LABEL: Record<string, string> = {
  approved: "Aprovada — aguardando execução",
  executed: "Executada",
  failed: "Falhou",
  rejected: "Rejeitada",
  reverted: "Revertida",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive"> = {
  approved: "secondary",
  executed: "default",
  failed: "destructive",
  rejected: "secondary",
  reverted: "secondary",
};

export default async function InsightsFeedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: account } = await supabase.from("ad_accounts").select("id, name").eq("id", id).maybeSingle();
  if (!account) notFound();

  const { data: snapshot } = await supabase
    .from("snapshots")
    .select("id, date, diagnosis, health_score, llm_model")
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

  const { data: proposedRaw } = await supabase
    .from("actions")
    .select(
      "id, type, entity_ref, reasoning, expected_impact, risk, priority, status, error, decision_note, proposed_at, action_results(metric, baseline_value, d4_value, d7_value, delta_pct, verdict)",
    )
    .eq("ad_account_id", id)
    .eq("status", "proposed")
    .order("priority", { ascending: true });

  const proposedActions = (proposedRaw ?? []) as ActionRow[];

  const { data: historyRaw } = await supabase
    .from("actions")
    .select(
      "id, type, entity_ref, reasoning, expected_impact, risk, priority, status, error, decision_note, proposed_at, action_results(metric, baseline_value, d4_value, d7_value, delta_pct, verdict)",
    )
    .eq("ad_account_id", id)
    .neq("status", "proposed")
    .order("proposed_at", { ascending: false })
    .limit(20);

  const history = (historyRaw ?? []) as ActionRow[];

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
          Aprovar dispara a execução na Meta (modo Copiloto) respeitando os guardrails da conta.
        </p>
        {proposedActions.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma ação proposta hoje.</p>
        )}
        {proposedActions.map((action) => (
          <Card key={action.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-sm font-medium">
                <span>
                  {action.type} — {action.entity_ref?.name ?? "Conta"}
                </span>
                <Badge variant={RISK_VARIANT[action.risk ?? "low"] ?? "default"}>risco {action.risk}</Badge>
              </CardTitle>
              <CardDescription>{action.reasoning}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <p className="text-xs text-muted-foreground">Impacto esperado: {action.expected_impact}</p>
              <ProposedActionButtons actionId={action.id} />
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Histórico de ações</h2>
        {history.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma ação decidida ainda.</p>
        )}
        {history.map((action) => (
          <Card key={action.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-sm font-medium">
                <span>
                  {action.type} — {action.entity_ref?.name ?? "Conta"}
                </span>
                <Badge variant={STATUS_VARIANT[action.status] ?? "default"}>
                  {STATUS_LABEL[action.status] ?? action.status}
                </Badge>
              </CardTitle>
              <CardDescription>{action.reasoning}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {action.error && <p className="text-xs text-destructive">Erro: {action.error}</p>}
              {action.status === "rejected" && action.decision_note && (
                <p className="text-xs text-muted-foreground">Motivo: {action.decision_note}</p>
              )}
              {(() => {
                const result = Array.isArray(action.action_results) ? action.action_results[0] : action.action_results;
                if (!result || result.verdict == null) return null;
                return (
                  <p className="text-xs text-muted-foreground">
                    Resultado ({result.metric}): baseline {result.baseline_value ?? "?"} → atual{" "}
                    {result.d7_value ?? result.d4_value ?? "?"} ({result.verdict}
                    {result.delta_pct != null ? `, ${result.delta_pct.toFixed(1)}%` : ""})
                  </p>
                );
              })()}
              {action.status === "executed" && <RevertActionButton actionId={action.id} />}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
