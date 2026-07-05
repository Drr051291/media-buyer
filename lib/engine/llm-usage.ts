import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { LlmCallUsage } from "./reasoner";

/**
 * Preços por milhão de tokens (USD). PROJECT.md 6.4/9: registrar custo por
 * chamada para calibrar pricing. Cache: creation ~1.25x o preço de input,
 * read ~0.1x (ver skill claude-api / shared/prompt-caching.md).
 */
const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  "claude-sonnet-5": { input: 3.0, output: 15.0 },
  "claude-haiku-4-5": { input: 1.0, output: 5.0 },
};

const DEFAULT_PRICE = PRICE_PER_MTOK["claude-sonnet-5"];

const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

function priceFor(model: string): { input: number; output: number } {
  // Modelos vêm com sufixo de data às vezes (ex: claude-haiku-4-5-20251001) —
  // faz match por prefixo contra a tabela conhecida.
  const exact = PRICE_PER_MTOK[model];
  if (exact) return exact;

  const byPrefix = Object.entries(PRICE_PER_MTOK).find(([key]) => model.startsWith(key));
  return byPrefix?.[1] ?? DEFAULT_PRICE;
}

export function computeCostUsd(model: string, usage: LlmCallUsage): number {
  const price = priceFor(model);

  const cost =
    (usage.inputTokens * price.input +
      usage.cacheCreationInputTokens * price.input * CACHE_WRITE_MULTIPLIER +
      usage.cacheReadInputTokens * price.input * CACHE_READ_MULTIPLIER +
      usage.outputTokens * price.output) /
    1_000_000;

  return Math.round(cost * 1_000_000) / 1_000_000; // 6 casas decimais
}

export interface RecordLlmUsageParams {
  orgId: string;
  adAccountId: string | null;
  purpose: "daily_analysis" | "weekly_report" | "chat";
  model: string;
  usage: LlmCallUsage;
}

/** Registra o consumo de uma chamada ao Claude — PROJECT.md 6.4/9 (insumo para o admin de LLM cost). */
export async function recordLlmUsage(params: RecordLlmUsageParams): Promise<void> {
  const supabase = createServiceRoleClient();
  const costUsd = computeCostUsd(params.model, params.usage);

  const { error } = await supabase.from("llm_usage").insert({
    org_id: params.orgId,
    ad_account_id: params.adAccountId,
    purpose: params.purpose,
    model: params.model,
    input_tokens: params.usage.inputTokens,
    output_tokens: params.usage.outputTokens,
    cache_creation_input_tokens: params.usage.cacheCreationInputTokens,
    cache_read_input_tokens: params.usage.cacheReadInputTokens,
    cost_usd: costUsd,
  });

  if (error) throw error;
}
