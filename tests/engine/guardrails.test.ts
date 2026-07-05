import { describe, expect, it } from "vitest";
import {
  checkAllGuardrails,
  checkBudgetChangePct,
  checkCooldown,
  checkDailySpendCap,
  checkExecutionWindow,
  checkMaxActionsPerDay,
  checkProtectedEntity,
  type GuardrailsConfig,
} from "@/lib/engine/guardrails";

function config(overrides: Partial<GuardrailsConfig> = {}): GuardrailsConfig {
  return {
    maxBudgetChangePct: 20,
    dailySpendCap: null,
    cooldownHours: 48,
    protectedEntityIds: [],
    maxActionsPerDay: 5,
    executionWindow: null,
    ...overrides,
  };
}

describe("checkBudgetChangePct", () => {
  it("permite variação dentro do limite", () => {
    expect(checkBudgetChangePct(100, 115, 20)).toBeNull();
  });

  it("bloqueia aumento acima do limite", () => {
    expect(checkBudgetChangePct(100, 150, 20)?.code).toBe("BUDGET_CHANGE_EXCEEDED");
  });

  it("bloqueia redução acima do limite (variação negativa)", () => {
    expect(checkBudgetChangePct(100, 50, 20)?.code).toBe("BUDGET_CHANGE_EXCEEDED");
  });

  it("não bloqueia sem baseline (budget atual <= 0)", () => {
    expect(checkBudgetChangePct(0, 100, 20)).toBeNull();
  });
});

describe("checkDailySpendCap", () => {
  it("bloqueia quando o spend projetado excede o teto", () => {
    expect(checkDailySpendCap(150, 100)?.code).toBe("DAILY_SPEND_CAP_EXCEEDED");
  });

  it("não bloqueia sem teto configurado", () => {
    expect(checkDailySpendCap(150, null)).toBeNull();
  });
});

describe("checkProtectedEntity", () => {
  it("bloqueia entidade protegida", () => {
    expect(checkProtectedEntity("ad1", ["ad1", "ad2"])?.code).toBe("ENTITY_PROTECTED");
  });

  it("permite entidade fora da lista", () => {
    expect(checkProtectedEntity("ad3", ["ad1", "ad2"])).toBeNull();
  });
});

describe("checkCooldown", () => {
  it("bloqueia dentro do cooldown", () => {
    const now = new Date("2026-07-05T12:00:00Z");
    const lastChange = new Date("2026-07-04T12:00:00Z"); // 24h atrás
    expect(checkCooldown(lastChange, 48, now)?.code).toBe("COOLDOWN_ACTIVE");
  });

  it("permite após o cooldown", () => {
    const now = new Date("2026-07-05T12:00:00Z");
    const lastChange = new Date("2026-07-03T00:00:00Z"); // 60h atrás
    expect(checkCooldown(lastChange, 48, now)).toBeNull();
  });

  it("permite quando não há mudança anterior", () => {
    expect(checkCooldown(null, 48, new Date())).toBeNull();
  });
});

describe("checkMaxActionsPerDay", () => {
  it("bloqueia ao atingir o máximo", () => {
    expect(checkMaxActionsPerDay(5, 5)?.code).toBe("MAX_ACTIONS_PER_DAY_EXCEEDED");
  });

  it("permite abaixo do máximo", () => {
    expect(checkMaxActionsPerDay(2, 5)).toBeNull();
  });
});

describe("checkExecutionWindow", () => {
  it("bloqueia fora do horário permitido", () => {
    const now = new Date(2026, 5, 5, 23, 0); // 23h local
    expect(checkExecutionWindow(now, { startHour: 8, endHour: 20 })?.code).toBe("OUTSIDE_EXECUTION_WINDOW");
  });

  it("permite dentro do horário", () => {
    const now = new Date(2026, 5, 5, 14, 0); // 14h local
    expect(checkExecutionWindow(now, { startHour: 8, endHour: 20 })).toBeNull();
  });

  it("bloqueia fora dos dias permitidos", () => {
    const sunday = new Date(2026, 5, 7, 14, 0); // domingo
    expect(checkExecutionWindow(sunday, { startHour: 0, endHour: 24, daysOfWeek: [1, 2, 3, 4, 5] })?.code).toBe(
      "OUTSIDE_EXECUTION_WINDOW",
    );
  });

  it("sem janela configurada, sempre permite", () => {
    expect(checkExecutionWindow(new Date(), null)).toBeNull();
  });
});

describe("checkAllGuardrails", () => {
  it("retorna vazio quando nada viola", () => {
    const violations = checkAllGuardrails({
      entityMetaId: "ad1",
      currentBudget: 100,
      newBudget: 110,
      guardrails: config(),
      now: new Date("2026-07-05T12:00:00Z"),
      lastChangeAtForEntity: null,
      actionsExecutedTodayCount: 0,
    });
    expect(violations).toHaveLength(0);
  });

  it("acumula múltiplas violações", () => {
    const violations = checkAllGuardrails({
      entityMetaId: "ad1",
      currentBudget: 100,
      newBudget: 200, // +100%, viola budget
      guardrails: config({ protectedEntityIds: ["ad1"], maxActionsPerDay: 0 }),
      now: new Date("2026-07-05T12:00:00Z"),
      lastChangeAtForEntity: null,
      actionsExecutedTodayCount: 0,
    });

    const codes = violations.map((v) => v.code);
    expect(codes).toContain("ENTITY_PROTECTED");
    expect(codes).toContain("MAX_ACTIONS_PER_DAY_EXCEEDED");
    expect(codes).toContain("BUDGET_CHANGE_EXCEEDED");
  });
});
