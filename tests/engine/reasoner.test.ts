import { describe, expect, it } from "vitest";
import { validateDailyAnalysis, type DailyAnalysisOutput } from "@/lib/engine/reasoner";
import type { AccountSnapshotPayload } from "@/lib/engine/snapshot";

function snapshot(): AccountSnapshotPayload {
  return {
    date: "2026-07-01",
    currency: "BRL",
    business_context_configured: true,
    conversion_event: "purchase",
    entities: [
      {
        level: "adset",
        meta_id: "as1",
        name: "Adset 1",
        status: "ACTIVE",
        windows: {
          d3: { spend: 10, impressions: 100, clicks: 2, conversions: 1, ctr: 2, cpm: 100, cpc: 5, cpa: 10, roas: 4, frequency: 1, days_with_data: 3 },
          d7: { spend: 10, impressions: 100, clicks: 2, conversions: 1, ctr: 2, cpm: 100, cpc: 5, cpa: 10, roas: 4, frequency: 1, days_with_data: 7 },
          d14: { spend: 10, impressions: 100, clicks: 2, conversions: 1, ctr: 2, cpm: 100, cpc: 5, cpa: 10, roas: 4, frequency: 1, days_with_data: 14 },
          d30: { spend: 10, impressions: 100, clicks: 2, conversions: 1, ctr: 2, cpm: 100, cpc: 5, cpa: 10, roas: 4, frequency: 1, days_with_data: 30 },
        },
        delta_7d_pct: { spend: 0, ctr: 0, cpm: 0, cpa: 0, roas: 0, frequency: 0 },
        share_of_parent_spend_7d: null,
        signals: [],
      },
    ],
  };
}

function baseOutput(overrides: Partial<DailyAnalysisOutput> = {}): DailyAnalysisOutput {
  return {
    diagnosis: "Conta estável.",
    health_score: 80,
    insights: [],
    proposed_actions: [],
    ...overrides,
  };
}

describe("validateDailyAnalysis", () => {
  it("mantém insights e ações que referenciam entidades reais do snapshot", () => {
    const output = baseOutput({
      insights: [
        {
          entity_ref: { level: "adset", id: "as1", name: "Adset 1" },
          finding: "CPA estável",
          evidence: ["CPA 7d: 10"],
          severity: "info",
        },
      ],
      proposed_actions: [
        {
          type: "ADJUST_BUDGET",
          entity_ref: { level: "adset", id: "as1", name: "Adset 1" },
          params: { change_pct: 15 },
          reasoning: "Escalar vencedor",
          expected_impact: "Mais volume mantendo CPA",
          risk: "low",
          priority: 1,
        },
      ],
    });

    const result = validateDailyAnalysis(output, snapshot());
    expect(result.insights).toHaveLength(1);
    expect(result.proposedActions).toHaveLength(1);
    expect(result.droppedCount).toBe(0);
  });

  it("descarta insight cuja entidade não existe no snapshot", () => {
    const output = baseOutput({
      insights: [
        {
          entity_ref: { level: "adset", id: "inexistente", name: "Fantasma" },
          finding: "...",
          evidence: [],
          severity: "info",
        },
      ],
    });

    const result = validateDailyAnalysis(output, snapshot());
    expect(result.insights).toHaveLength(0);
    expect(result.droppedCount).toBe(1);
    expect(result.warnings[0]).toContain("não existe no snapshot");
  });

  it("descarta ação que viola o guardrail de variação de budget (>20%)", () => {
    const output = baseOutput({
      proposed_actions: [
        {
          type: "ADJUST_BUDGET",
          entity_ref: { level: "adset", id: "as1", name: "Adset 1" },
          params: { change_pct: 50 },
          reasoning: "...",
          expected_impact: "...",
          risk: "high",
          priority: 1,
        },
      ],
    });

    const result = validateDailyAnalysis(output, snapshot());
    expect(result.proposedActions).toHaveLength(0);
    expect(result.droppedCount).toBe(1);
    expect(result.warnings[0]).toContain("guardrail");
  });

  it("permite NO_ACTION_WAIT mesmo sem entity_ref conhecido (ação genérica de conta)", () => {
    const output = baseOutput({
      proposed_actions: [
        {
          type: "NO_ACTION_WAIT",
          entity_ref: { level: "campaign", id: "sem-dado-suficiente", name: "N/A" },
          params: {},
          reasoning: "Dados insuficientes",
          expected_impact: "Nenhum",
          risk: "low",
          priority: 3,
        },
      ],
    });

    const result = validateDailyAnalysis(output, snapshot());
    expect(result.proposedActions).toHaveLength(1);
    expect(result.droppedCount).toBe(0);
  });
});
