import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { BusinessContextProfile } from "./business-context";
import type { LlmCallUsage } from "./reasoner";

const client = new Anthropic();
const REPORT_MODEL = "claude-sonnet-5";

const SYSTEM_PROMPT = `Você é um gestor de tráfego sênior escrevendo um relatório semanal para o cliente final de uma agência.

Regras:
- Use exclusivamente os números fornecidos (diagnósticos e health scores diários já calculados) — nunca invente métricas.
- Escreva em português, linguagem de negócio, sem jargão técnico de mídia paga.
- Estruture em: resumo executivo, o que funcionou bem, pontos de atenção, próximos passos.
- Seja direto — o relatório precisa ser lido em menos de 2 minutos.`;

export interface WeeklyReportResult {
  report: string;
  usage: LlmCallUsage;
  model: string;
}

/**
 * Relatório semanal (PROJECT.md 6/10 Fase 2): agrega os diagnósticos diários
 * dos últimos 7 dias e pede ao Reasoner um resumo em linguagem de negócio.
 * Gerado sob demanda — não persistido (o gestor pode gerar de novo quando quiser).
 */
export async function generateWeeklyReport(adAccountId: string): Promise<WeeklyReportResult> {
  const supabase = createServiceRoleClient();

  const [{ data: account, error: accountError }, { data: context }, { data: snapshots }] = await Promise.all([
    supabase.from("ad_accounts").select("id, name, currency").eq("id", adAccountId).single(),
    supabase
      .from("business_context")
      .select("profile")
      .eq("ad_account_id", adAccountId)
      .maybeSingle(),
    supabase
      .from("snapshots")
      .select("date, diagnosis, health_score")
      .eq("ad_account_id", adAccountId)
      .order("date", { ascending: true })
      .limit(7),
  ]);

  if (accountError || !account) throw new Error("Conta não encontrada");

  if (!snapshots || snapshots.length === 0) {
    return {
      report:
        "Ainda não há análises diárias suficientes para gerar um relatório semanal desta conta. " +
        "O relatório fica disponível assim que o job diário rodar por alguns dias.",
      usage: { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
      model: "n/a",
    };
  }

  const businessContext = (context?.profile as BusinessContextProfile | undefined) ?? null;

  const userContent = JSON.stringify({
    account_name: account.name,
    currency: account.currency,
    business_context: businessContext ?? "não configurado",
    daily_diagnoses: snapshots.map((s) => ({
      date: s.date,
      health_score: s.health_score,
      diagnosis: s.diagnosis,
    })),
  });

  const response = await client.messages.create({
    model: REPORT_MODEL,
    max_tokens: 2000,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userContent }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const report = textBlock && "text" in textBlock ? textBlock.text : "";

  return {
    report,
    usage: {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheCreationInputTokens: response.usage.cache_creation_input_tokens ?? 0,
      cacheReadInputTokens: response.usage.cache_read_input_tokens ?? 0,
    },
    model: response.model,
  };
}
