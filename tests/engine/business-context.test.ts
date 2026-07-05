import { describe, expect, it } from "vitest";
import { deriveCpaAlvo } from "@/lib/engine/business-context";

describe("deriveCpaAlvo", () => {
  it("calcula breakeven e sugestão (70% do breakeven)", () => {
    const result = deriveCpaAlvo(180, 55);
    expect(result).not.toBeNull();
    expect(result!.breakeven).toBeCloseTo(99);
    expect(result!.suggested).toBeCloseTo(69.3);
  });

  it("retorna null sem ticket_medio ou margem_bruta_pct", () => {
    expect(deriveCpaAlvo(null, 55)).toBeNull();
    expect(deriveCpaAlvo(180, null)).toBeNull();
  });

  it("retorna null para valores nao positivos", () => {
    expect(deriveCpaAlvo(0, 55)).toBeNull();
    expect(deriveCpaAlvo(180, 0)).toBeNull();
    expect(deriveCpaAlvo(-10, 55)).toBeNull();
  });
});
