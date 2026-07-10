import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Leituras de metrics_daily com a dimensão `provider` (ETAPA3GOOGLEADS BLOCO 7).
 * O dashboard multi-canal compara Meta × Google pelo RESULTADO real — a tese do
 * produto — em vez de métricas isoladas de cada plataforma.
 *
 * Recebe o client Supabase de quem chama (sessão do usuário → RLS aplica; ou
 * service_role no backend). Lê sempre do Postgres, nunca da API em tempo real.
 */

export interface ChannelSummary {
  provider: string;
  spend: number;
  conversions: number;
  conversionValue: number;
  roas: number | null;
}

interface MetricSummaryRow {
  provider: string | null;
  spend: number | string | null;
  conversions: number | string | null;
  conversion_value: number | string | null;
}

/**
 * Resumo por canal dos últimos `days` dias (nível campanha, sem breakdown).
 * Uma linha por provider com spend/conversões/valor e ROAS derivado em código.
 */
export async function getChannelSummaries(
  supabase: SupabaseClient,
  days = 30,
): Promise<ChannelSummary[]> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - (days - 1));
  const sinceIso = since.toISOString().slice(0, 10);

  const { data } = await supabase
    .from("metrics_daily")
    .select("provider, spend, conversions, conversion_value")
    .eq("entity_level", "campaign")
    .eq("breakdown_key", "all")
    .gte("date", sinceIso);

  const byProvider = new Map<string, ChannelSummary>();
  for (const raw of (data as MetricSummaryRow[] | null) ?? []) {
    const provider = raw.provider ?? "meta";
    const entry = byProvider.get(provider) ?? {
      provider,
      spend: 0,
      conversions: 0,
      conversionValue: 0,
      roas: null,
    };
    entry.spend += Number(raw.spend ?? 0);
    entry.conversions += Number(raw.conversions ?? 0);
    entry.conversionValue += Number(raw.conversion_value ?? 0);
    byProvider.set(provider, entry);
  }

  for (const entry of byProvider.values()) {
    entry.roas = entry.spend > 0 ? entry.conversionValue / entry.spend : null;
  }

  return Array.from(byProvider.values()).sort((a, b) => b.spend - a.spend);
}
