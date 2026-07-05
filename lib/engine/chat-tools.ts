import "server-only";
import { z } from "zod";
import type Anthropic from "@anthropic-ai/sdk";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { buildAccountSnapshot, type AccountSnapshotPayload } from "./snapshot";

/**
 * Tools do Chat com o Agente (PROJECT.md 6.6) — todas read-only exceto
 * `propose_action`, que NÃO executa nada na Meta: só cria um card pendente
 * no feed, pelo mesmo pipeline de guardrails da análise diária. O chat
 * nunca tem uma via privilegiada de escrita além dessa.
 */

const ACTION_TYPES = [
  "PAUSE_AD",
  "PAUSE_ADSET",
  "ADJUST_BUDGET",
  "DUPLICATE_ADSET",
  "REALLOCATE_BUDGET",
  "CHANGE_BID",
  "REACTIVATE",
  "SUGGEST_CREATIVE_REFRESH",
  "NO_ACTION_WAIT",
] as const;

const ENTITY_LEVELS = ["campaign", "adset", "ad"] as const;
const WINDOW_KEYS = ["d3", "d7", "d14", "d30"] as const;
const MAX_BUDGET_CHANGE_PCT = 20;

const GetMetricsInput = z.object({
  entity_level: z.enum(ENTITY_LEVELS),
  entity_meta_id: z.string(),
  window: z.enum(WINDOW_KEYS).optional(),
});

const ProposeActionInput = z.object({
  type: z.enum(ACTION_TYPES),
  entity_ref: z.object({
    level: z.enum(ENTITY_LEVELS),
    id: z.string(),
    name: z.string(),
  }),
  params: z.record(z.string(), z.unknown()).optional(),
  reasoning: z.string(),
  expected_impact: z.string(),
  risk: z.enum(["low", "medium", "high"]),
  priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
});

export const CHAT_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_metrics",
    description:
      "Retorna métricas derivadas (spend, CPA, ROAS, CTR, CPM, frequência, deltas) de UMA entidade (campanha, adset ou anúncio) numa janela de dias, calculadas no evento de conversão real da conta. Descubra meta_ids válidos com run_signal_scan primeiro.",
    input_schema: {
      type: "object",
      properties: {
        entity_level: { type: "string", enum: ENTITY_LEVELS },
        entity_meta_id: { type: "string", description: "meta_id da entidade (retornado por run_signal_scan)." },
        window: {
          type: "string",
          enum: WINDOW_KEYS,
          description: "Janela de dias: d3, d7, d14 ou d30. Default d7.",
        },
      },
      required: ["entity_level", "entity_meta_id"],
    },
  },
  {
    name: "get_business_context",
    description:
      "Retorna o perfil de negócio configurado para a conta (modelo de negócio, ticket médio, margem, CPA/ROAS alvo, restrições, notas do gestor). Consulte antes de recomendar qualquer ação — a mesma métrica é boa para uma conta e péssima para outra.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_action_history",
    description:
      "Retorna as últimas 20 ações (propostas, aprovadas, executadas, rejeitadas, revertidas), com o resultado medido (D+4/D+7) e o motivo quando rejeitadas.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "run_signal_scan",
    description:
      "Roda o Metric Engine + os detectores de sinais sobre a conta inteira (mesma lógica da análise diária) e retorna todas as entidades com spend ou sinal relevante — inclui os meta_ids a usar em get_metrics/propose_action.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "propose_action",
    description:
      "Cria uma ação proposta pendente no feed. NÃO executa nada na Meta — o gestor precisa aprovar no feed (mesmo pipeline de guardrails da análise diária). Use apenas depois de consultar run_signal_scan/get_metrics/get_business_context para embasar a proposta.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ACTION_TYPES },
        entity_ref: {
          type: "object",
          properties: {
            level: { type: "string", enum: ENTITY_LEVELS },
            id: { type: "string" },
            name: { type: "string" },
          },
          required: ["level", "id", "name"],
        },
        params: { type: "object", description: "Ex: {new_daily_budget: 240} ou {change_pct: 20}." },
        reasoning: { type: "string" },
        expected_impact: { type: "string" },
        risk: { type: "string", enum: ["low", "medium", "high"] },
        priority: { type: "integer", enum: [1, 2, 3] },
      },
      required: ["type", "entity_ref", "reasoning", "expected_impact", "risk", "priority"],
    },
  },
];

export interface ChatToolContext {
  adAccountId: string;
  getSnapshot: () => Promise<AccountSnapshotPayload>;
}

export function createChatToolContext(adAccountId: string): ChatToolContext {
  const asOfIso = new Date().toISOString().slice(0, 10);
  let snapshotPromise: Promise<AccountSnapshotPayload> | null = null;

  return {
    adAccountId,
    getSnapshot: () => {
      if (!snapshotPromise) snapshotPromise = buildAccountSnapshot(adAccountId, asOfIso);
      return snapshotPromise;
    },
  };
}

async function getMetricsTool(ctx: ChatToolContext, input: z.infer<typeof GetMetricsInput>) {
  const snapshot = await ctx.getSnapshot();
  const entity = snapshot.entities.find((e) => e.level === input.entity_level && e.meta_id === input.entity_meta_id);

  if (!entity) {
    return {
      error:
        "Entidade não encontrada no snapshot atual (sem spend/sinal recente ou meta_id inválido). Use run_signal_scan para listar entidades válidas.",
    };
  }

  const windowKey = input.window ?? "d7";
  return {
    level: entity.level,
    meta_id: entity.meta_id,
    name: entity.name,
    status: entity.status,
    window: windowKey,
    metrics: entity.windows[windowKey],
    delta_7d_pct: entity.delta_7d_pct,
    share_of_parent_spend_7d: entity.share_of_parent_spend_7d,
    signals: entity.signals,
  };
}

async function getBusinessContextTool(adAccountId: string) {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("business_context")
    .select("profile")
    .eq("ad_account_id", adAccountId)
    .maybeSingle();

  return data?.profile ?? { configured: false, message: "Contexto de negócio ainda não configurado pelo gestor." };
}

async function getActionHistoryTool(adAccountId: string) {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("actions")
    .select(
      "type, entity_ref, status, reasoning, risk, priority, decision_note, proposed_at, decided_at, executed_at, error, action_results(metric, baseline_value, d4_value, d7_value, delta_pct, verdict)",
    )
    .eq("ad_account_id", adAccountId)
    .order("proposed_at", { ascending: false })
    .limit(20);

  return data ?? [];
}

async function runSignalScanTool(ctx: ChatToolContext) {
  const snapshot = await ctx.getSnapshot();
  return {
    date: snapshot.date,
    currency: snapshot.currency,
    conversion_event: snapshot.conversion_event,
    business_context_configured: snapshot.business_context_configured,
    entities: snapshot.entities,
  };
}

async function proposeActionTool(adAccountId: string, input: z.infer<typeof ProposeActionInput>) {
  const supabase = createServiceRoleClient();

  if (input.type !== "NO_ACTION_WAIT") {
    const { data: entity } = await supabase
      .from("entities")
      .select("meta_id")
      .eq("ad_account_id", adAccountId)
      .eq("level", input.entity_ref.level)
      .eq("meta_id", input.entity_ref.id)
      .maybeSingle();

    if (!entity) {
      return { ok: false, error: `Entidade ${input.entity_ref.level}:${input.entity_ref.id} não existe nesta conta.` };
    }
  }

  const changePct = input.params?.change_pct;
  if (typeof changePct === "number" && Math.abs(changePct) > MAX_BUDGET_CHANGE_PCT) {
    return {
      ok: false,
      error: `change_pct ${changePct}% excede o guardrail padrão de ±${MAX_BUDGET_CHANGE_PCT}%.`,
    };
  }

  const idempotencyKey = `${adAccountId}:chat:${Date.now()}:${input.type}:${input.entity_ref.id}`;

  const { data: inserted, error } = await supabase
    .from("actions")
    .insert({
      ad_account_id: adAccountId,
      type: input.type,
      entity_ref: input.entity_ref,
      params: input.params ?? {},
      reasoning: input.reasoning,
      expected_impact: input.expected_impact,
      risk: input.risk,
      priority: input.priority,
      status: "proposed",
      idempotency_key: idempotencyKey,
    })
    .select("id")
    .single();

  if (error || !inserted) return { ok: false, error: error?.message ?? "Falha ao criar ação" };

  return {
    ok: true,
    action_id: inserted.id,
    message: "Ação criada como pendente no feed — precisa de aprovação humana no feed antes de qualquer execução.",
  };
}

export async function executeChatTool(name: string, rawInput: unknown, ctx: ChatToolContext): Promise<unknown> {
  switch (name) {
    case "get_metrics": {
      const parsed = GetMetricsInput.safeParse(rawInput);
      if (!parsed.success) return { error: "input inválido para get_metrics", details: parsed.error.flatten() };
      return getMetricsTool(ctx, parsed.data);
    }
    case "get_business_context":
      return getBusinessContextTool(ctx.adAccountId);
    case "get_action_history":
      return getActionHistoryTool(ctx.adAccountId);
    case "run_signal_scan":
      return runSignalScanTool(ctx);
    case "propose_action": {
      const parsed = ProposeActionInput.safeParse(rawInput);
      if (!parsed.success) return { ok: false, error: "input inválido para propose_action", details: parsed.error.flatten() };
      return proposeActionTool(ctx.adAccountId, parsed.data);
    }
    default:
      return { error: `ferramenta desconhecida: ${name}` };
  }
}
