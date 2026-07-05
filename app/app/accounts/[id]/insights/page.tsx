import { notFound } from "next/navigation";
import { AlertTriangle, AlertCircle, Info, Lightbulb } from "lucide-react";
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
const SEVERITY_ICON: Record<string, typeof AlertTriangle> = {
  critical: AlertTriangle,
  warning: AlertCircle,
  info: Info,
};
const SEVERITY_ICON_BG: Record<string, string> = {
  critical: "bg-error-container text-on-error-container",
  warning: "bg-tertiary-container/40 text-tertiary",
  info: "bg-secondary-container text-on-secondary-container",
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
        <h1 className="font-heading text-3xl font-bold text-primary">Insights — {account.name}</h1>
        <p className="text-on-surface-variant">
          Ainda não há análise para esta conta. A primeira roda assim que o job diário
          processar os dados sincronizados.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="space-y-1">
        <h1 className="font-heading text-5xl leading-tight font-bold text-on-surface">Feed de Insights &amp; Ações</h1>
        <p className="max-w-2xl text-lg text-on-surface-variant">
          Análise de {new Date(snapshot.date).toLocaleDateString("pt-BR")} · gerado por {snapshot.llm_model}
        </p>
      </div>

      <section className="relative overflow-hidden rounded-2xl bg-primary-container p-6 text-on-primary-container md:p-8">
        <div className="relative z-10 flex items-start gap-3">
          <Lightbulb className="mt-1 size-7 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-heading text-xl">Diagnóstico do Copiloto</h2>
              <Badge
                variant={snapshot.health_score >= 70 ? "default" : snapshot.health_score >= 40 ? "secondary" : "destructive"}
                className="bg-surface text-primary"
              >
                Health score: {snapshot.health_score}
              </Badge>
            </div>
            <p className="max-w-3xl leading-relaxed text-on-primary-container/90">{snapshot.diagnosis}</p>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-xl text-on-surface">Achados ({insights.length})</h2>
        {insights.length === 0 && <p className="text-sm text-on-surface-variant">Nenhum achado relevante hoje.</p>}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {insights.map((insight, i) => {
            const Icon = SEVERITY_ICON[insight.severity] ?? Info;
            return (
              <Card key={i} className="p-4">
                <CardHeader className="px-0">
                  <div className="mb-2 flex items-start justify-between">
                    <div className={`flex size-10 items-center justify-center rounded-lg ${SEVERITY_ICON_BG[insight.severity] ?? ""}`}>
                      <Icon className="size-5" />
                    </div>
                    <Badge variant={SEVERITY_VARIANT[insight.severity] ?? "default"}>{insight.severity}</Badge>
                  </div>
                  <CardTitle className="text-base">{(insight.entity_ref as EntityRef)?.name ?? "Conta"}</CardTitle>
                  <CardDescription>{insight.finding}</CardDescription>
                </CardHeader>
                {Array.isArray(insight.evidence) && insight.evidence.length > 0 && (
                  <CardContent className="px-0">
                    <ul className="list-inside list-disc text-xs text-on-surface-variant">
                      {(insight.evidence as string[]).map((e, j) => (
                        <li key={j}>{e}</li>
                      ))}
                    </ul>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      <div className="hand-drawn-divider" />

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-xl text-on-surface">Ações propostas ({proposedActions.length})</h2>
        <p className="text-xs text-on-surface-variant">
          Aprovar dispara a execução na Meta (modo Copiloto) respeitando os guardrails da conta.
        </p>
        {proposedActions.length === 0 && (
          <p className="text-sm text-on-surface-variant">Nenhuma ação proposta hoje.</p>
        )}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {proposedActions.map((action) => (
            <Card key={action.id} className="flex flex-col justify-between p-4">
              <CardHeader className="px-0">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <CardTitle className="text-base">{action.type}</CardTitle>
                  <Badge variant={RISK_VARIANT[action.risk ?? "low"] ?? "default"}>risco {action.risk}</Badge>
                </div>
                <p className="text-xs text-on-surface-variant">{action.entity_ref?.name ?? "Conta"}</p>
                <CardDescription>{action.reasoning}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 border-t border-outline-variant/30 px-0 pt-3">
                <p className="text-xs text-on-surface-variant">Impacto esperado: {action.expected_impact}</p>
                <ProposedActionButtons actionId={action.id} />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-xl text-on-surface">Histórico de ações</h2>
        {history.length === 0 && <p className="text-sm text-on-surface-variant">Nenhuma ação decidida ainda.</p>}
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
                <p className="text-xs text-on-surface-variant">Motivo: {action.decision_note}</p>
              )}
              {(() => {
                const result = Array.isArray(action.action_results) ? action.action_results[0] : action.action_results;
                if (!result || result.verdict == null) return null;
                return (
                  <p className="text-xs text-on-surface-variant">
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
      </section>
    </div>
  );
}
