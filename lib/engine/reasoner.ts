import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { AccountSnapshotPayload } from "./snapshot";
import type { BusinessContextProfile } from "./business-context";

/**
 * Reasoner — PROJECT.md 6.4. O LLM nunca calcula números e nunca chama a
 * Meta diretamente: recebe o Account Snapshot já processado (Metric Engine +
 * detectores) e devolve raciocínio + ações propostas em schema estruturado.
 * Sonnet 5 para a análise diária completa (PROJECT.md secao 3: modelo
 * principal de análise).
 */
const REASONER_MODEL = "claude-sonnet-5";

const client = new Anthropic();

const EntityRefSchema = z.object({
  level: z.enum(["campaign", "adset", "ad"]),
  id: z.string(),
  name: z.string(),
});

const InsightSchema = z.object({
  entity_ref: EntityRefSchema,
  finding: z.string(),
  evidence: z.array(z.string()),
  severity: z.enum(["info", "warning", "critical"]),
});

const ActionParamsSchema = z.object({
  new_daily_budget: z.number().nullable().optional(),
  change_pct: z.number().nullable().optional(),
  new_bid: z.number().nullable().optional(),
  duplicate_of_adset_id: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

const ProposedActionSchema = z.object({
  type: z.enum([
    "PAUSE_AD",
    "PAUSE_ADSET",
    "ADJUST_BUDGET",
    "DUPLICATE_ADSET",
    "REALLOCATE_BUDGET",
    "CHANGE_BID",
    "REACTIVATE",
    "SUGGEST_CREATIVE_REFRESH",
    "NO_ACTION_WAIT",
  ]),
  entity_ref: EntityRefSchema,
  params: ActionParamsSchema,
  reasoning: z.string(),
  expected_impact: z.string(),
  risk: z.enum(["low", "medium", "high"]),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

const DailyAnalysisSchema = z.object({
  diagnosis: z.string(),
  health_score: z.number().min(0).max(100),
  insights: z.array(InsightSchema),
  proposed_actions: z.array(ProposedActionSchema),
});

export type DailyAnalysisOutput = z.infer<typeof DailyAnalysisSchema>;

const SYSTEM_PROMPT = `Você é um gestor de tráfego sênior especializado em Meta Ads, atuando como copiloto de outro gestor humano.

Regras de decisão (obrigatórias):
- Você recebe um "Account Snapshot" já calculado (métricas e sinais determinísticos) e o Business Context da conta. Nunca calcule métricas por conta própria — use exclusivamente os números do snapshot.
- Toda evidência citada em "evidence" DEVE vir literalmente do snapshot fornecido (mesmos números). Nunca invente ou estime métricas.
- Referencie entidades exclusivamente pelo campo "meta_id" do snapshot, em entity_ref.id — nunca invente IDs.
- Se uma entidade tem o sinal NO_SIGNIFICANCE, não tire conclusões de CPA/ROAS sobre ela — proponha NO_ACTION_WAIT ou aguarde mais dados.
- Nunca proponha ADJUST_BUDGET/REALLOCATE_BUDGET com params.change_pct acima de 20% (guardrail padrão) ou abaixo de -20%.
- Sempre ancore a justificativa (reasoning) no Business Context da conta (ticket médio, margem, estratégia, restrições) — a mesma métrica pode ser boa para uma conta e péssima para outra.
- Respeite qualquer restrição listada em business_context.restricoes (ex: "nunca pausar a campanha X").
- Escreva diagnosis, finding, reasoning e expected_impact em português, em linguagem de negócio (não jargão técnico de mídia).
- health_score (0-100) reflete a saúde geral da conta na janela de 7 dias, considerando os sinais críticos/warning presentes.`;

export interface RunDailyAnalysisInput {
  businessContext: BusinessContextProfile | null;
  snapshot: AccountSnapshotPayload;
  /** Resumo textual de ações passadas e resultado medido (Fase 3 popula; vazio por enquanto). */
  memory?: string;
}

export interface LlmCallUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

export interface RunDailyAnalysisResult {
  output: DailyAnalysisOutput;
  usage: LlmCallUsage;
  model: string;
}

export async function runDailyAnalysis(input: RunDailyAnalysisInput): Promise<RunDailyAnalysisResult> {
  const userContent = JSON.stringify({
    business_context:
      input.businessContext ??
      "Ainda não configurado pelo gestor — evite conclusões de CPA/ROAS alvo e recomende preencher o Contexto de Negócio.",
    account_snapshot: input.snapshot,
    memory: input.memory ?? "Sem histórico de ações executadas ainda.",
  });

  const response = await client.messages.parse({
    model: REASONER_MODEL,
    max_tokens: 8000,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userContent }],
    output_config: { format: zodOutputFormat(DailyAnalysisSchema) },
  });

  if (!response.parsed_output) {
    throw new Error("Claude não retornou output estruturado válido para a análise diária");
  }

  return {
    output: response.parsed_output,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
    },
    model: response.model,
  };
}

const MAX_BUDGET_CHANGE_PCT = 20;

export interface ValidatedDailyAnalysis {
  diagnosis: string;
  healthScore: number;
  insights: DailyAnalysisOutput["insights"];
  proposedActions: DailyAnalysisOutput["proposed_actions"];
  droppedCount: number;
  warnings: string[];
}

/**
 * Validação pós-LLM (PROJECT.md 6.4): entity_ids devem existir no snapshot e
 * ações não podem violar o guardrail padrão de variação de budget. Itens
 * inválidos são descartados individualmente — a análise inteira não é
 * jogada fora por causa de um item ruim.
 */
export function validateDailyAnalysis(
  output: DailyAnalysisOutput,
  snapshot: AccountSnapshotPayload,
): ValidatedDailyAnalysis {
  const knownEntityKeys = new Set(snapshot.entities.map((e) => `${e.level}:${e.meta_id}`));
  const warnings: string[] = [];
  let droppedCount = 0;

  const insights = output.insights.filter((insight) => {
    const key = `${insight.entity_ref.level}:${insight.entity_ref.id}`;
    if (!knownEntityKeys.has(key)) {
      warnings.push(`insight descartado: entidade "${key}" não existe no snapshot`);
      droppedCount++;
      return false;
    }
    return true;
  });

  const proposedActions = output.proposed_actions.filter((action) => {
    const key = `${action.entity_ref.level}:${action.entity_ref.id}`;

    if (action.type !== "NO_ACTION_WAIT" && !knownEntityKeys.has(key)) {
      warnings.push(`ação "${action.type}" descartada: entidade "${key}" não existe no snapshot`);
      droppedCount++;
      return false;
    }

    if (action.params.change_pct != null && Math.abs(action.params.change_pct) > MAX_BUDGET_CHANGE_PCT) {
      warnings.push(
        `ação "${action.type}" descartada: change_pct ${action.params.change_pct}% excede o guardrail de ${MAX_BUDGET_CHANGE_PCT}%`,
      );
      droppedCount++;
      return false;
    }

    return true;
  });

  return {
    diagnosis: output.diagnosis,
    healthScore: output.health_score,
    insights,
    proposedActions,
    droppedCount,
    warnings,
  };
}
