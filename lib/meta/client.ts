import {
  classifyMetaError,
  computeBackoffDelayMs,
  parseThrottleHeaders,
  shouldPauseQueue,
  type MetaGraphErrorBody,
  type ThrottleHeaders,
} from "./rate-limit";

const GRAPH_HOST = "https://graph.facebook.com";
const DEFAULT_API_VERSION = "v23.0";
const DEFAULT_MAX_RETRIES = 5;

export class MetaApiError extends Error {
  code: number | null;
  subcode: number | null;
  fbtraceId?: string;

  constructor(message: string, code: number | null, subcode: number | null, fbtraceId?: string) {
    super(message);
    this.name = "MetaApiError";
    this.code = code;
    this.subcode = subcode;
    this.fbtraceId = fbtraceId;
  }
}

type Params = Record<string, string | number | boolean | undefined>;

export interface BatchCall {
  method?: "GET" | "POST" | "DELETE";
  relativeUrl: string;
}

export interface BatchResult {
  code: number;
  headers?: { name: string; value: string }[];
  body: string;
}

export interface MetaClientOptions {
  accessToken: string;
  apiVersion?: string;
  maxRetries?: number;
  /** Chamado a cada resposta com o snapshot de utilização de rate limit. */
  onUsageUpdate?: (usage: ThrottleHeaders) => void | Promise<void>;
  /** Injetável para testes. */
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Wrapper fino sobre a Graph API (Marketing API). Regras obrigatórias do
 * PROJECT.md secao 6.1: ler headers de throttle em toda resposta, backoff
 * exponencial em erros de rate limit, batch API para leituras de entidades.
 *
 * Este cliente NÃO decide o que sincronizar nem grava no banco — isso é
 * responsabilidade das camadas de sync (fora do escopo desta etapa).
 */
export class MetaClient {
  private lastUsage: ThrottleHeaders | null = null;

  constructor(private readonly opts: MetaClientOptions) {}

  get isPaused(): boolean {
    return shouldPauseQueue(this.lastUsage?.accountUsagePct ?? null);
  }

  get usage(): ThrottleHeaders | null {
    return this.lastUsage;
  }

  private get apiVersion() {
    return this.opts.apiVersion ?? process.env.META_API_VERSION ?? DEFAULT_API_VERSION;
  }

  private get fetchImpl() {
    return this.opts.fetchImpl ?? fetch;
  }

  private get sleep() {
    return this.opts.sleepImpl ?? defaultSleep;
  }

  async get<T>(path: string, params: Params = {}): Promise<T> {
    return this.requestWithRetry<T>("GET", path, params);
  }

  async post<T>(path: string, params: Params = {}): Promise<T> {
    return this.requestWithRetry<T>("POST", path, params);
  }

  /**
   * Batch API: até 50 chamadas por request (limite da Meta). Usada para
   * leituras de entidades — nunca para escrita de ações (essas passam pelo
   * Executor com guardrails, fora deste wrapper).
   */
  async batch(calls: BatchCall[]): Promise<BatchResult[]> {
    if (calls.length === 0) return [];
    if (calls.length > 50) {
      throw new Error("Batch API da Meta aceita no máximo 50 chamadas por request");
    }

    const body = new URLSearchParams();
    body.set("access_token", this.opts.accessToken);
    body.set(
      "batch",
      JSON.stringify(calls.map((c) => ({ method: c.method ?? "GET", relative_url: c.relativeUrl }))),
    );

    return this.executeWithRetry<BatchResult[]>(() =>
      this.fetchImpl(`${GRAPH_HOST}/${this.apiVersion}/`, { method: "POST", body }),
    );
  }

  private buildUrl(path: string, params: Params): string {
    const url = new URL(`${GRAPH_HOST}/${this.apiVersion}/${path.replace(/^\//, "")}`);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  private async requestWithRetry<T>(method: "GET" | "POST", path: string, params: Params): Promise<T> {
    if (method === "GET") {
      const url = this.buildUrl(path, { ...params, access_token: this.opts.accessToken });
      return this.executeWithRetry<T>(() => this.fetchImpl(url, { method: "GET" }));
    }

    const body = new URLSearchParams();
    body.set("access_token", this.opts.accessToken);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) body.set(key, String(value));
    }
    const url = `${GRAPH_HOST}/${this.apiVersion}/${path.replace(/^\//, "")}`;
    return this.executeWithRetry<T>(() => this.fetchImpl(url, { method: "POST", body }));
  }

  private async executeWithRetry<T>(doFetch: () => Promise<Response>, attempt = 0): Promise<T> {
    const response = await doFetch();

    this.lastUsage = parseThrottleHeaders({
      businessUseCaseUsage: response.headers.get("x-business-use-case-usage"),
      adsInsightsThrottle: response.headers.get("x-fb-ads-insights-throttle"),
    });
    if (this.opts.onUsageUpdate) {
      await this.opts.onUsageUpdate(this.lastUsage);
    }

    const json = (await response.json().catch(() => null)) as (T & { error?: MetaGraphErrorBody }) | null;

    if (!response.ok || json?.error) {
      const info = classifyMetaError(json?.error);
      const maxRetries = this.opts.maxRetries ?? DEFAULT_MAX_RETRIES;

      if (info.isRetryable && attempt < maxRetries) {
        await this.sleep(computeBackoffDelayMs(attempt));
        return this.executeWithRetry<T>(doFetch, attempt + 1);
      }

      throw new MetaApiError(info.message, info.code, info.subcode, json?.error?.fbtrace_id);
    }

    return json as T;
  }
}

/** Filtro padrão do PROJECT.md 6.1: nunca puxar linhas de entidades sem gasto. */
export function spendGreaterThanZeroFilter() {
  return JSON.stringify([{ field: "spend", operator: "GREATER_THAN", value: 0 }]);
}
