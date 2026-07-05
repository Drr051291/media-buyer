/**
 * Guardrails — PROJECT.md 6.5. Funções puras de validação, sem I/O: quem
 * chama (o Executor) busca os dados no banco e monta o input. Cada check
 * devolve null (ok) ou uma violação — o Executor decide o que fazer com
 * a lista de violações (bloquear a execução e marcar a action como failed).
 */

export interface ExecutionWindow {
  /** Hora local de início, 0-23. */
  startHour: number;
  /** Hora local de fim (exclusiva), 0-23. */
  endHour: number;
  /** 0=domingo .. 6=sábado. Omitido = todos os dias. */
  daysOfWeek?: number[];
}

export interface GuardrailsConfig {
  maxBudgetChangePct: number;
  dailySpendCap: number | null;
  cooldownHours: number;
  protectedEntityIds: string[];
  maxActionsPerDay: number;
  executionWindow: ExecutionWindow | null;
}

export interface GuardrailViolation {
  code: string;
  message: string;
}

export function checkBudgetChangePct(
  currentBudget: number,
  newBudget: number,
  maxChangePct: number,
): GuardrailViolation | null {
  if (currentBudget <= 0) return null; // sem baseline, não dá para checar variação percentual

  const changePct = ((newBudget - currentBudget) / currentBudget) * 100;
  if (Math.abs(changePct) > maxChangePct) {
    return {
      code: "BUDGET_CHANGE_EXCEEDED",
      message: `Variação de ${changePct.toFixed(1)}% excede o guardrail de ±${maxChangePct}%`,
    };
  }
  return null;
}

export function checkDailySpendCap(
  projectedDailySpend: number,
  cap: number | null,
): GuardrailViolation | null {
  if (cap == null) return null;
  if (projectedDailySpend > cap) {
    return {
      code: "DAILY_SPEND_CAP_EXCEEDED",
      message: `Spend projetado ${projectedDailySpend.toFixed(2)} excede o teto diário de ${cap.toFixed(2)}`,
    };
  }
  return null;
}

export function checkProtectedEntity(
  entityMetaId: string,
  protectedIds: string[],
): GuardrailViolation | null {
  if (protectedIds.includes(entityMetaId)) {
    return {
      code: "ENTITY_PROTECTED",
      message: `Entidade ${entityMetaId} está na lista de proteção — nenhuma ação automática permitida`,
    };
  }
  return null;
}

export function checkCooldown(
  lastChangeAt: Date | null,
  cooldownHours: number,
  now: Date,
): GuardrailViolation | null {
  if (!lastChangeAt) return null;

  const hoursSince = (now.getTime() - lastChangeAt.getTime()) / (1000 * 60 * 60);
  if (hoursSince < cooldownHours) {
    return {
      code: "COOLDOWN_ACTIVE",
      message: `Última mudança nesta entidade há ${hoursSince.toFixed(1)}h — cooldown exige ${cooldownHours}h`,
    };
  }
  return null;
}

/** `now` deve já vir no fuso horário da conta — esta função só olha hora/dia. */
export function checkExecutionWindow(now: Date, window: ExecutionWindow | null): GuardrailViolation | null {
  if (!window) return null;

  const hour = now.getHours();
  const day = now.getDay();

  if (window.daysOfWeek && !window.daysOfWeek.includes(day)) {
    return {
      code: "OUTSIDE_EXECUTION_WINDOW",
      message: `Dia da semana (${day}) fora da janela de execução permitida`,
    };
  }

  if (hour < window.startHour || hour >= window.endHour) {
    return {
      code: "OUTSIDE_EXECUTION_WINDOW",
      message: `Hora atual (${hour}h) fora da janela ${window.startHour}h–${window.endHour}h`,
    };
  }

  return null;
}

export function checkMaxActionsPerDay(actionsToday: number, maxPerDay: number): GuardrailViolation | null {
  if (actionsToday >= maxPerDay) {
    return {
      code: "MAX_ACTIONS_PER_DAY_EXCEEDED",
      message: `Já foram executadas ${actionsToday} ações hoje (máximo ${maxPerDay})`,
    };
  }
  return null;
}

export interface GuardrailCheckInput {
  entityMetaId: string;
  currentBudget?: number | null;
  newBudget?: number | null;
  projectedDailySpendForAccount?: number | null;
  guardrails: GuardrailsConfig;
  now: Date;
  lastChangeAtForEntity: Date | null;
  actionsExecutedTodayCount: number;
}

/** Roda todos os checks aplicáveis e devolve a lista de violações (vazia = pode executar). */
export function checkAllGuardrails(input: GuardrailCheckInput): GuardrailViolation[] {
  const violations: GuardrailViolation[] = [];
  const { guardrails } = input;

  const protectedViolation = checkProtectedEntity(input.entityMetaId, guardrails.protectedEntityIds);
  if (protectedViolation) violations.push(protectedViolation);

  const cooldownViolation = checkCooldown(input.lastChangeAtForEntity, guardrails.cooldownHours, input.now);
  if (cooldownViolation) violations.push(cooldownViolation);

  const maxActionsViolation = checkMaxActionsPerDay(input.actionsExecutedTodayCount, guardrails.maxActionsPerDay);
  if (maxActionsViolation) violations.push(maxActionsViolation);

  const windowViolation = checkExecutionWindow(input.now, guardrails.executionWindow);
  if (windowViolation) violations.push(windowViolation);

  if (input.currentBudget != null && input.newBudget != null) {
    const budgetViolation = checkBudgetChangePct(input.currentBudget, input.newBudget, guardrails.maxBudgetChangePct);
    if (budgetViolation) violations.push(budgetViolation);
  }

  if (input.projectedDailySpendForAccount != null) {
    const capViolation = checkDailySpendCap(input.projectedDailySpendForAccount, guardrails.dailySpendCap);
    if (capViolation) violations.push(capViolation);
  }

  return violations;
}
