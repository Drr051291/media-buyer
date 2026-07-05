import { describe, expect, it } from "vitest";
import { verdictFor } from "@/lib/engine/action-results";

describe("verdictFor", () => {
  it("classifica como improved quando o CPA cai 10% ou mais", () => {
    const result = verdictFor(100, 89);
    expect(result.verdict).toBe("improved");
    expect(result.deltaPct).toBeCloseTo(-11, 0);
  });

  it("classifica como worsened quando o CPA sobe 10% ou mais", () => {
    const result = verdictFor(100, 112);
    expect(result.verdict).toBe("worsened");
  });

  it("classifica como neutral dentro da margem de +-10%", () => {
    const result = verdictFor(100, 105);
    expect(result.verdict).toBe("neutral");
  });

  it("não calcula sem baseline ou valor atual", () => {
    expect(verdictFor(null, 100)).toEqual({ deltaPct: null, verdict: null });
    expect(verdictFor(100, null)).toEqual({ deltaPct: null, verdict: null });
  });

  it("não calcula com baseline zero (divisão por zero)", () => {
    expect(verdictFor(0, 100)).toEqual({ deltaPct: null, verdict: null });
  });
});
