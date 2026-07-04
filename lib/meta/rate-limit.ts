/**
 * Parsing puro dos headers de rate limit da Meta Marketing API e das regras
 * de backoff/pausa. Sem I/O — só transforma dados, para ser 100% testável.
 *
 * Referência dos headers:
 * - `x-business-use-case-usage`: JSON por conta de negócio/anúncio, cada
 *   entrada já vem em campos `call_count`, `total_cputime`, `total_time`
 *   expressos como percentual (0-100) de utilização da janela de rate limit.
 * - `x-fb-ads-insights-throttle`: JSON com `app_id_util_pct` e `acc_id_util_pct`.
 */

export interface BusinessUseCaseUsageEntry {
  type?: string;
  call_count?: number;
  total_cputime?: number;
  total_time?: number;
  estimated_time_to_regain_access?: number;
}

export interface ThrottleHeaders {
  /** Maior percentual de utilização entre call_count/total_cputime/total_time. */
  accountUsagePct: number | null;
  appUsagePct: number | null;
  raw: {
    businessUseCaseUsage?: Record<string, BusinessUseCaseUsageEntry[]>;
    adsInsightsThrottle?: { app_id_util_pct?: number; acc_id_util_pct?: number };
  };
}

function safeJsonParse<T>(value: string | null | undefined): T | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function parseBusinessUseCaseUsage(
  header: string | null | undefined,
): { accountUsagePct: number | null; raw: Record<string, BusinessUseCaseUsageEntry[]> | null } {
  const parsed = safeJsonParse<Record<string, BusinessUseCaseUsageEntry[]>>(header);
  if (!parsed) return { accountUsagePct: null, raw: null };

  let max = 0;
  let found = false;
  for (const entries of Object.values(parsed)) {
    for (const entry of entries) {
      for (const field of [entry.call_count, entry.total_cputime, entry.total_time]) {
        if (typeof field === "number") {
          found = true;
          max = Math.max(max, field);
        }
      }
    }
  }

  return { accountUsagePct: found ? max : null, raw: parsed };
}

export function parseAdsInsightsThrottle(
  header: string | null | undefined,
): { appUsagePct: number | null; accountUsagePct: number | null; raw: { app_id_util_pct?: number; acc_id_util_pct?: number } | null } {
  const parsed = safeJsonParse<{ app_id_util_pct?: number; acc_id_util_pct?: number }>(header);
  if (!parsed) return { appUsagePct: null, accountUsagePct: null, raw: null };

  return {
    appUsagePct: typeof parsed.app_id_util_pct === "number" ? parsed.app_id_util_pct : null,
    accountUsagePct: typeof parsed.acc_id_util_pct === "number" ? parsed.acc_id_util_pct : null,
    raw: parsed,
  };
}

/** Combina os dois headers num snapshot único, priorizando business-use-case-usage. */
export function parseThrottleHeaders(headers: {
  businessUseCaseUsage: string | null;
  adsInsightsThrottle: string | null;
}): ThrottleHeaders {
  const buc = parseBusinessUseCaseUsage(headers.businessUseCaseUsage);
  const throttle = parseAdsInsightsThrottle(headers.adsInsightsThrottle);

  return {
    accountUsagePct: buc.accountUsagePct ?? throttle.accountUsagePct,
    appUsagePct: throttle.appUsagePct,
    raw: {
      businessUseCaseUsage: buc.raw ?? undefined,
      adsInsightsThrottle: throttle.raw ?? undefined,
    },
  };
}

/** Regra do PROJECT.md 6.1: pausar fila da conta se utilização > 80%. */
export function shouldPauseQueue(accountUsagePct: number | null): boolean {
  return accountUsagePct != null && accountUsagePct > 80;
}

export interface MetaGraphErrorBody {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

export interface MetaErrorInfo {
  code: number | null;
  subcode: number | null;
  message: string;
  isRetryable: boolean;
}

/** Regra do PROJECT.md 6.1: backoff em code=4 / code=17 / subcode 1504022. */
const RETRYABLE_CODES = new Set([4, 17]);
const RETRYABLE_SUBCODES = new Set([1504022]);

export function classifyMetaError(error: MetaGraphErrorBody | null | undefined): MetaErrorInfo {
  const code = typeof error?.code === "number" ? error.code : null;
  const subcode = typeof error?.error_subcode === "number" ? error.error_subcode : null;

  const isRetryable =
    (code !== null && RETRYABLE_CODES.has(code)) ||
    (subcode !== null && RETRYABLE_SUBCODES.has(subcode));

  return {
    code,
    subcode,
    message: error?.message ?? "Erro desconhecido da Meta Graph API",
    isRetryable,
  };
}

export interface BackoffOptions {
  baseMs?: number;
  maxMs?: number;
  /** Injetável para testes determinísticos. */
  random?: () => number;
}

/** Backoff exponencial com jitter: base * 2^attempt, limitado a maxMs, +/-20% de jitter. */
export function computeBackoffDelayMs(attempt: number, options: BackoffOptions = {}): number {
  const baseMs = options.baseMs ?? 1000;
  const maxMs = options.maxMs ?? 30_000;
  const random = options.random ?? Math.random;

  const raw = Math.min(maxMs, baseMs * 2 ** attempt);
  const jitterFactor = 0.8 + random() * 0.4; // 0.8x .. 1.2x
  return Math.round(raw * jitterFactor);
}
