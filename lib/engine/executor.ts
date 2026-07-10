import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { resolveAdAccountForSync } from "./sync-orchestrator";
import { MetaClient, MetaApiError } from "@/lib/meta/client";
import { pauseEntity, reactivateEntity, updateDailyBudget, duplicateAdset } from "@/lib/meta/mutations";
import {
  googleCustomer,
  setGoogleEntityStatus,
  updateGoogleCampaignBudget,
} from "@/lib/providers/google-ads/mutations";
import { checkAllGuardrails, type GuardrailsConfig } from "./guardrails";

type CanonicalLevel = "campaign" | "adset" | "ad";
type ResolvedAccount = { metaAccountId: string; accessToken: string; provider: "meta" | "google" };

/**
 * Camada de escrita provider-agnóstica (ETAPA3GOOGLEADS BLOCO 6). Os guardrails,
 * o claim atômico, o kill switch e a captura de previous_state são
 * compartilhados; só a chamada final à API muda por provider. Google não
 * suporta DUPLICATE_ADSET na V1.
 */
async function applyStatusChange(
  account: ResolvedAccount,
  level: CanonicalLevel,
  entityMetaId: string,
  parentMetaId: string | null,
  active: boolean,
): Promise<unknown> {
  if (account.provider === "google") {
    const customer = googleCustomer(account.accessToken, account.metaAccountId);
    return (await setGoogleEntityStatus(customer, account.metaAccountId, level, entityMetaId, active, parentMetaId)).raw;
  }
  const client = new MetaClient({ accessToken: account.accessToken });
  return (active ? await reactivateEntity(client, entityMetaId) : await pauseEntity(client, entityMetaId)).raw;
}

async function applyBudgetChange(
  account: ResolvedAccount,
  level: CanonicalLevel,
  entityMetaId: string,
  newBudget: number,
): Promise<unknown> {
  if (account.provider === "google") {
    if (level !== "campaign") {
      throw new Error("Ajuste de budget no Google Ads (V1) é só no nível campanha");
    }
    const customer = googleCustomer(account.accessToken, account.metaAccountId);
    return (await updateGoogleCampaignBudget(customer, entityMetaId, newBudget)).raw;
  }
  const client = new MetaClient({ accessToken: account.accessToken });
  return (await updateDailyBudget(client, entityMetaId, newBudget)).raw;
}

/**
 * Action Executor — PROJECT.md 6.5. Recebe uma action já aprovada, valida
 * guardrails, executa a mutação certa na Meta, captura o estado anterior
 * (para rollback) e registra tudo em audit_log. V1 só executa
 * pausar/reativar, ajustar budget e duplicar adset (PROJECT.md 12).
 */

const EXECUTABLE_TYPES = new Set([
  "PAUSE_AD",
  "PAUSE_ADSET",
  "REACTIVATE",
  "ADJUST_BUDGET",
  "REALLOCATE_BUDGET",
  "DUPLICATE_ADSET",
]);

interface EntityRef {
  level: "campaign" | "adset" | "ad";
  id: string;
  name: string;
}

interface ActionRow {
  id: string;
  ad_account_id: string;
  type: string;
  entity_ref: EntityRef;
  params: Record<string, unknown>;
  status: string;
  previous_state: Record<string, unknown> | null;
}

export interface ExecuteActionResult {
  status: "executed" | "failed" | "blocked" | "reverted";
  violations?: string[];
  error?: string;
}

const DEFAULT_GUARDRAILS: GuardrailsConfig = {
  maxBudgetChangePct: 20,
  dailySpendCap: null,
  cooldownHours: 48,
  protectedEntityIds: [],
  maxActionsPerDay: 5,
  executionWindow: null,
};

interface GuardrailsRow {
  max_budget_change_pct: number;
  daily_spend_cap: number | null;
  cooldown_hours: number;
  protected_entity_ids: string[] | null;
  max_actions_per_day: number;
  execution_window: Record<string, unknown> | null;
}

function toGuardrailsConfig(row: GuardrailsRow): GuardrailsConfig {
  return {
    maxBudgetChangePct: Number(row.max_budget_change_pct),
    dailySpendCap: row.daily_spend_cap != null ? Number(row.daily_spend_cap) : null,
    cooldownHours: row.cooldown_hours,
    protectedEntityIds: row.protected_entity_ids ?? [],
    maxActionsPerDay: row.max_actions_per_day,
    executionWindow:
      row.execution_window && Object.keys(row.execution_window).length > 0
        ? (row.execution_window as unknown as GuardrailsConfig["executionWindow"])
        : null,
  };
}

function computeNewBudget(
  type: string,
  params: Record<string, unknown>,
  currentBudget: number | null,
): number | null {
  if (type !== "ADJUST_BUDGET" && type !== "REALLOCATE_BUDGET") return null;

  const explicit = params.new_daily_budget;
  if (typeof explicit === "number") return explicit;

  const changePct = params.change_pct;
  if (typeof changePct === "number" && currentBudget != null) {
    return currentBudget * (1 + changePct / 100);
  }
  return null;
}

function startOfTodayIso(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
}

async function markFailed(actionId: string, error: string): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase.from("actions").update({ status: "failed", error }).eq("id", actionId);
}

async function writeAudit(
  adAccountId: string,
  actor: string | null,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const supabase = createServiceRoleClient();
  const { data: account } = await supabase.from("ad_accounts").select("org_id").eq("id", adAccountId).single();
  if (!account) return;
  await supabase.from("audit_log").insert({ org_id: account.org_id, actor, event, payload });
}

/**
 * Executa uma action já aprovada. Só avança se todos os guardrails
 * passarem — do contrário marca a action como failed e audita o bloqueio
 * (sem nunca chamar a Meta).
 */
export async function executeAction(actionId: string): Promise<ExecuteActionResult> {
  const supabase = createServiceRoleClient();

  const { data: action, error: actionError } = await supabase
    .from("actions")
    .select("id, ad_account_id, type, entity_ref, params, status, previous_state")
    .eq("id", actionId)
    .single();

  if (actionError || !action) return { status: "failed", error: "Ação não encontrada" };
  const typedAction = action as ActionRow;

  if (typedAction.status !== "approved") {
    return { status: "failed", error: `Ação precisa estar 'approved' (status atual: ${typedAction.status})` };
  }

  // Claim atômico: só avança se conseguir mover approved -> executing agora
  // mesmo. Duas invocações concorrentes (retry de cron, autopilot correndo
  // junto com uma aprovação manual) nunca executam a mesma action duas vezes
  // — a segunda encontra 0 linhas afetadas e desiste sem chamar a Meta.
  const { data: claimed } = await supabase
    .from("actions")
    .update({ status: "executing" })
    .eq("id", actionId)
    .eq("status", "approved")
    .select("id")
    .maybeSingle();

  if (!claimed) {
    return { status: "failed", error: "Ação já está sendo executada por outra invocação" };
  }

  // Kill switch (PROJECT.md 6.5/2.2): conta pausada (ad_accounts.status) ou
  // tenant suspenso pelo admin da plataforma (organizations.status) bloqueia
  // qualquer execução, antes mesmo dos guardrails configuráveis.
  const { data: killSwitchRowRaw } = await supabase
    .from("ad_accounts")
    .select("status, organizations(status)")
    .eq("id", typedAction.ad_account_id)
    .single();

  const killSwitchRow = killSwitchRowRaw as { status: string; organizations: { status: string } | { status: string }[] | null } | null;
  const orgRow = killSwitchRow?.organizations;
  const orgStatus = Array.isArray(orgRow) ? orgRow[0]?.status : orgRow?.status;

  if (killSwitchRow?.status !== "active" || orgStatus !== "active") {
    const message = `Execução bloqueada: conta ou organização não está ativa (conta=${killSwitchRow?.status ?? "?"}, organização=${orgStatus ?? "?"})`;
    await markFailed(actionId, message);
    await writeAudit(typedAction.ad_account_id, null, "action_blocked_by_kill_switch", { action_id: actionId });
    return { status: "blocked", violations: [message] };
  }

  if (!EXECUTABLE_TYPES.has(typedAction.type)) {
    const message = "Tipo de ação não suportado para execução automática na V1";
    await markFailed(actionId, message);
    return { status: "failed", error: message };
  }

  const entityRef = typedAction.entity_ref;
  const entityMetaId = entityRef.id;
  const entityLevel = entityRef.level;

  const [{ data: entity }, { data: guardrailsRow }, account, { data: lastExecuted }, { count: actionsToday }] =
    await Promise.all([
      supabase
        .from("entities")
        .select("status, daily_budget, parent_meta_id")
        .eq("ad_account_id", typedAction.ad_account_id)
        .eq("level", entityLevel)
        .eq("meta_id", entityMetaId)
        .maybeSingle(),
      supabase.from("guardrails").select("*").eq("ad_account_id", typedAction.ad_account_id).maybeSingle(),
      resolveAdAccountForSync(typedAction.ad_account_id),
      supabase
        .from("actions")
        .select("executed_at")
        .eq("ad_account_id", typedAction.ad_account_id)
        .contains("entity_ref", { id: entityMetaId })
        .eq("status", "executed")
        .order("executed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("actions")
        .select("id", { count: "exact", head: true })
        .eq("ad_account_id", typedAction.ad_account_id)
        .eq("status", "executed")
        .gte("executed_at", startOfTodayIso()),
    ]);

  // Fail-closed: sem a entidade sincronizada localmente não dá pra confirmar
  // que ela existe de fato nesta conta, nem validar guardrails com segurança
  // — melhor recusar do que confiar cegamente num entity_ref.id vindo do
  // Reasoner/chat e chamar a Meta direto com ele.
  if (!entity) {
    const message = "Entidade não encontrada na sincronização local — execução recusada por segurança";
    await markFailed(actionId, message);
    await writeAudit(typedAction.ad_account_id, null, "action_blocked_entity_not_found", { action_id: actionId });
    return { status: "blocked", violations: [message] };
  }

  const guardrailsConfig = guardrailsRow ? toGuardrailsConfig(guardrailsRow as GuardrailsRow) : DEFAULT_GUARDRAILS;
  const currentBudget = entity.daily_budget != null ? Number(entity.daily_budget) : null;
  const newBudget = computeNewBudget(typedAction.type, typedAction.params, currentBudget);

  // Sem currentBudget não dá pra validar o guardrail de variação percentual
  // — checkBudgetChangePct simplesmente não é chamado quando currentBudget é
  // null, o que deixaria uma mudança de budget passar sem limite nenhum.
  if ((typedAction.type === "ADJUST_BUDGET" || typedAction.type === "REALLOCATE_BUDGET") && currentBudget == null) {
    const message = "Budget atual da entidade desconhecido — impossível validar o guardrail de variação percentual";
    await markFailed(actionId, message);
    await writeAudit(typedAction.ad_account_id, null, "action_blocked_by_guardrail", {
      action_id: actionId,
      violations: ["BUDGET_UNKNOWN"],
    });
    return { status: "blocked", violations: [message] };
  }

  // Teto de spend diário (PROJECT.md 6.5): projeta o spend diário total da
  // conta no MESMO nível da entidade (soma dos budgets ativos, trocando a
  // contribuição desta entidade pelo valor pós-ação). Aproximação aceita:
  // não distingue Campaign Budget Optimization (budget no campaign) de
  // Ad Set Budget Optimization (budget no adset) — só roda quando o nível é
  // adset/campaign, que é onde este schema guarda daily_budget.
  const budgetAffectingTypes = new Set(["ADJUST_BUDGET", "REALLOCATE_BUDGET", "REACTIVATE"]);
  let projectedDailySpendForAccount: number | null = null;
  if (budgetAffectingTypes.has(typedAction.type) && (entityLevel === "adset" || entityLevel === "campaign")) {
    const contribution = typedAction.type === "REACTIVATE" ? currentBudget : newBudget;
    if (contribution != null) {
      const { data: activeEntities } = await supabase
        .from("entities")
        .select("meta_id, daily_budget")
        .eq("ad_account_id", typedAction.ad_account_id)
        .eq("level", entityLevel)
        .eq("status", "ACTIVE");

      const othersTotal = (activeEntities ?? [])
        .filter((e) => e.meta_id !== entityMetaId)
        .reduce((sum, e) => sum + Number(e.daily_budget ?? 0), 0);

      projectedDailySpendForAccount = othersTotal + contribution;
    }
  }

  const violations = checkAllGuardrails({
    entityMetaId,
    currentBudget,
    newBudget,
    projectedDailySpendForAccount,
    guardrails: guardrailsConfig,
    now: new Date(),
    lastChangeAtForEntity: lastExecuted?.executed_at ? new Date(lastExecuted.executed_at) : null,
    actionsExecutedTodayCount: actionsToday ?? 0,
  });

  if (violations.length > 0) {
    const message = violations.map((v) => v.message).join("; ");
    await markFailed(actionId, `Bloqueada por guardrails: ${message}`);
    await writeAudit(typedAction.ad_account_id, null, "action_blocked_by_guardrail", {
      action_id: actionId,
      violations: violations.map((v) => v.code),
    });
    return { status: "blocked", violations: violations.map((v) => v.message) };
  }

  const parentMetaId = (entity as { parent_meta_id?: string | null })?.parent_meta_id ?? null;
  const previousState: Record<string, unknown> = {};

  try {
    let metaResponse: unknown;

    switch (typedAction.type) {
      case "PAUSE_AD":
      case "PAUSE_ADSET": {
        previousState.status = entity?.status ?? null;
        metaResponse = await applyStatusChange(account, entityLevel, entityMetaId, parentMetaId, false);
        await supabase
          .from("entities")
          .update({ status: "PAUSED" })
          .eq("ad_account_id", typedAction.ad_account_id)
          .eq("level", entityLevel)
          .eq("meta_id", entityMetaId);
        break;
      }
      case "REACTIVATE": {
        previousState.status = entity?.status ?? null;
        metaResponse = await applyStatusChange(account, entityLevel, entityMetaId, parentMetaId, true);
        await supabase
          .from("entities")
          .update({ status: "ACTIVE" })
          .eq("ad_account_id", typedAction.ad_account_id)
          .eq("level", entityLevel)
          .eq("meta_id", entityMetaId);
        break;
      }
      case "ADJUST_BUDGET":
      case "REALLOCATE_BUDGET": {
        if (newBudget == null) {
          throw new Error("Ação de budget sem novo valor calculável (params.new_daily_budget/change_pct)");
        }
        previousState.daily_budget = currentBudget;
        metaResponse = await applyBudgetChange(account, entityLevel, entityMetaId, newBudget);
        await supabase
          .from("entities")
          .update({ daily_budget: newBudget })
          .eq("ad_account_id", typedAction.ad_account_id)
          .eq("level", entityLevel)
          .eq("meta_id", entityMetaId);
        break;
      }
      case "DUPLICATE_ADSET": {
        if (account.provider === "google") {
          throw new Error("DUPLICATE_ADSET não é suportado no Google Ads (V1)");
        }
        const client = new MetaClient({ accessToken: account.accessToken });
        const result = await duplicateAdset(client, entityMetaId);
        metaResponse = result.raw;
        previousState.created_adset_meta_id = result.newAdsetMetaId;
        break;
      }
      default:
        throw new Error("Tipo de ação não implementado");
    }

    await supabase
      .from("actions")
      .update({
        status: "executed",
        executed_at: new Date().toISOString(),
        meta_response: metaResponse,
        previous_state: previousState,
      })
      .eq("id", actionId);

    await writeAudit(typedAction.ad_account_id, null, "action_executed", {
      action_id: actionId,
      type: typedAction.type,
      entity_ref: entityRef,
    });

    return { status: "executed" };
  } catch (error) {
    const message =
      error instanceof MetaApiError ? `Meta: ${error.message}` : error instanceof Error ? error.message : String(error);
    await markFailed(actionId, message);
    await writeAudit(typedAction.ad_account_id, null, "action_failed", { action_id: actionId, error: message });
    return { status: "failed", error: message };
  }
}

/** Reverte uma action já executada, usando o previous_state capturado na execução. */
export async function revertAction(actionId: string): Promise<ExecuteActionResult> {
  const supabase = createServiceRoleClient();

  const { data: action, error } = await supabase
    .from("actions")
    .select("id, ad_account_id, type, entity_ref, params, status, previous_state")
    .eq("id", actionId)
    .single();

  if (error || !action) return { status: "failed", error: "Ação não encontrada" };
  const typedAction = action as ActionRow;

  if (typedAction.status !== "executed") {
    return { status: "failed", error: `Só é possível reverter ações executadas (status atual: ${typedAction.status})` };
  }
  if (!typedAction.previous_state) {
    return { status: "failed", error: "Ação sem estado anterior registrado — não é possível reverter" };
  }

  const entityRef = typedAction.entity_ref;
  const entityMetaId = entityRef.id;
  const entityLevel = entityRef.level;
  const previousState = typedAction.previous_state;

  const account = await resolveAdAccountForSync(typedAction.ad_account_id);

  // parent_meta_id é necessário para reverter status de anúncio no Google
  // (resource name composto adGroupId~adId).
  const { data: entityRow } = await supabase
    .from("entities")
    .select("parent_meta_id")
    .eq("ad_account_id", typedAction.ad_account_id)
    .eq("level", entityLevel)
    .eq("meta_id", entityMetaId)
    .maybeSingle();
  const parentMetaId = (entityRow as { parent_meta_id?: string | null })?.parent_meta_id ?? null;

  try {
    let metaResponse: unknown;

    if ("status" in previousState) {
      const previousStatus = previousState.status as string | null;
      if (previousStatus == null) {
        // A entidade não estava sincronizada localmente no momento da
        // execução — não dá pra saber se o estado real era ACTIVE ou
        // PAUSED. Adivinhar (ex: sempre pausar) pode deixar a entidade no
        // estado ERRADO silenciosamente; melhor recusar e pedir reversão
        // manual no Ads Manager.
        throw new Error(
          "Estado anterior desconhecido (entidade não estava sincronizada na execução) — reversão automática recusada, requer intervenção manual",
        );
      }
      metaResponse = await applyStatusChange(
        account,
        entityLevel,
        entityMetaId,
        parentMetaId,
        previousStatus === "ACTIVE",
      );
      await supabase
        .from("entities")
        .update({ status: previousStatus })
        .eq("ad_account_id", typedAction.ad_account_id)
        .eq("level", entityLevel)
        .eq("meta_id", entityMetaId);
    } else if ("daily_budget" in previousState) {
      const previousBudget = Number(previousState.daily_budget);
      metaResponse = await applyBudgetChange(account, entityLevel, entityMetaId, previousBudget);
      await supabase
        .from("entities")
        .update({ daily_budget: previousBudget })
        .eq("ad_account_id", typedAction.ad_account_id)
        .eq("level", entityLevel)
        .eq("meta_id", entityMetaId);
    } else if ("created_adset_meta_id" in previousState) {
      // Só Meta cria adset por duplicação (Google não faz DUPLICATE_ADSET na V1).
      const createdAdsetId = previousState.created_adset_meta_id as string | null;
      if (createdAdsetId) {
        const client = new MetaClient({ accessToken: account.accessToken });
        metaResponse = (await pauseEntity(client, createdAdsetId)).raw;
      }
    } else {
      throw new Error("previous_state em formato desconhecido");
    }

    await supabase.from("actions").update({ status: "reverted", meta_response: metaResponse }).eq("id", actionId);
    await writeAudit(typedAction.ad_account_id, null, "action_reverted", { action_id: actionId });

    return { status: "reverted" };
  } catch (error) {
    const message =
      error instanceof MetaApiError ? `Meta: ${error.message}` : error instanceof Error ? error.message : String(error);
    await writeAudit(typedAction.ad_account_id, null, "action_revert_failed", { action_id: actionId, error: message });
    return { status: "failed", error: message };
  }
}
