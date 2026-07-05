import { describe, expect, it } from "vitest";
import { computeCostUsd } from "@/lib/engine/llm-usage";
import type { LlmCallUsage } from "@/lib/engine/reasoner";

function usage(overrides: Partial<LlmCallUsage> = {}): LlmCallUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreationInputTokens: 0,
    cacheReadInputTokens: 0,
    ...overrides,
  };
}

describe("computeCostUsd", () => {
  it("calcula custo de input+output para claude-sonnet-5", () => {
    const cost = computeCostUsd("claude-sonnet-5", usage({ inputTokens: 1_000_000, outputTokens: 1_000_000 }));
    expect(cost).toBeCloseTo(3.0 + 15.0);
  });

  it("aplica multiplicador de cache write (~1.25x) e cache read (~0.1x)", () => {
    const cost = computeCostUsd(
      "claude-sonnet-5",
      usage({ cacheCreationInputTokens: 1_000_000, cacheReadInputTokens: 1_000_000 }),
    );
    expect(cost).toBeCloseTo(3.0 * 1.25 + 3.0 * 0.1);
  });

  it("usa a tabela de preço do haiku quando o modelo é haiku", () => {
    const cost = computeCostUsd("claude-haiku-4-5", usage({ inputTokens: 1_000_000, outputTokens: 1_000_000 }));
    expect(cost).toBeCloseTo(1.0 + 5.0);
  });

  it("faz match por prefixo quando o model id tem sufixo de data", () => {
    const cost = computeCostUsd("claude-haiku-4-5-20251001", usage({ inputTokens: 1_000_000 }));
    expect(cost).toBeCloseTo(1.0);
  });

  it("retorna zero para uso zerado", () => {
    expect(computeCostUsd("claude-sonnet-5", usage())).toBe(0);
  });
});
