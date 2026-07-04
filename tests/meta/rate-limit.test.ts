import { describe, expect, it } from "vitest";
import {
  classifyMetaError,
  computeBackoffDelayMs,
  parseAdsInsightsThrottle,
  parseBusinessUseCaseUsage,
  parseThrottleHeaders,
  shouldPauseQueue,
} from "@/lib/meta/rate-limit";

describe("parseBusinessUseCaseUsage", () => {
  it("extrai o maior percentual entre call_count/total_cputime/total_time", () => {
    const header = JSON.stringify({
      "123456789": [
        { type: "ads_management", call_count: 28, total_cputime: 25, total_time: 61 },
      ],
    });

    const result = parseBusinessUseCaseUsage(header);
    expect(result.accountUsagePct).toBe(61);
  });

  it("retorna null quando o header está ausente ou é inválido", () => {
    expect(parseBusinessUseCaseUsage(null).accountUsagePct).toBeNull();
    expect(parseBusinessUseCaseUsage("not json").accountUsagePct).toBeNull();
  });
});

describe("parseAdsInsightsThrottle", () => {
  it("extrai app_id_util_pct e acc_id_util_pct", () => {
    const header = JSON.stringify({ app_id_util_pct: 9.67, acc_id_util_pct: 24.75 });
    const result = parseAdsInsightsThrottle(header);
    expect(result.appUsagePct).toBe(9.67);
    expect(result.accountUsagePct).toBe(24.75);
  });
});

describe("parseThrottleHeaders", () => {
  it("prioriza business-use-case-usage sobre ads-insights-throttle", () => {
    const result = parseThrottleHeaders({
      businessUseCaseUsage: JSON.stringify({ acc: [{ total_time: 90 }] }),
      adsInsightsThrottle: JSON.stringify({ acc_id_util_pct: 10 }),
    });
    expect(result.accountUsagePct).toBe(90);
  });

  it("cai para ads-insights-throttle quando business-use-case-usage está ausente", () => {
    const result = parseThrottleHeaders({
      businessUseCaseUsage: null,
      adsInsightsThrottle: JSON.stringify({ acc_id_util_pct: 42 }),
    });
    expect(result.accountUsagePct).toBe(42);
  });
});

describe("shouldPauseQueue", () => {
  it("pausa a fila quando utilização > 80%", () => {
    expect(shouldPauseQueue(81)).toBe(true);
    expect(shouldPauseQueue(80)).toBe(false);
    expect(shouldPauseQueue(null)).toBe(false);
  });
});

describe("classifyMetaError", () => {
  it("marca code=4 e code=17 como retryable", () => {
    expect(classifyMetaError({ code: 4 }).isRetryable).toBe(true);
    expect(classifyMetaError({ code: 17 }).isRetryable).toBe(true);
  });

  it("marca subcode 1504022 como retryable", () => {
    expect(classifyMetaError({ code: 100, error_subcode: 1504022 }).isRetryable).toBe(true);
  });

  it("não marca erros genéricos como retryable", () => {
    expect(classifyMetaError({ code: 190, message: "Invalid token" }).isRetryable).toBe(false);
  });

  it("lida com erro ausente", () => {
    const info = classifyMetaError(null);
    expect(info.isRetryable).toBe(false);
    expect(info.code).toBeNull();
  });
});

describe("computeBackoffDelayMs", () => {
  it("cresce exponencialmente e respeita o teto maxMs", () => {
    const noJitter = { random: () => 0.5 }; // jitterFactor = 1.0
    expect(computeBackoffDelayMs(0, { baseMs: 1000, ...noJitter })).toBe(1000);
    expect(computeBackoffDelayMs(1, { baseMs: 1000, ...noJitter })).toBe(2000);
    expect(computeBackoffDelayMs(2, { baseMs: 1000, ...noJitter })).toBe(4000);
    expect(computeBackoffDelayMs(10, { baseMs: 1000, maxMs: 30_000, ...noJitter })).toBe(30_000);
  });

  it("aplica jitter dentro de +/-20%", () => {
    const delayMin = computeBackoffDelayMs(0, { baseMs: 1000, random: () => 0 });
    const delayMax = computeBackoffDelayMs(0, { baseMs: 1000, random: () => 0.999999 });
    expect(delayMin).toBeGreaterThanOrEqual(800);
    expect(delayMax).toBeLessThanOrEqual(1200);
  });
});
