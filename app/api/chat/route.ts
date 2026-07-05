import { NextResponse } from "next/server";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";
import { requireOrgMember, UnauthorizedError } from "@/lib/auth/require-org";
import { CHAT_TOOLS, createChatToolContext, executeChatTool } from "@/lib/engine/chat-tools";
import { recordLlmUsage } from "@/lib/engine/llm-usage";
import type { LlmCallUsage } from "@/lib/engine/reasoner";

/**
 * Chat com o Agente (PROJECT.md 6.6): mesmo limite do job diário — o LLM só
 * lê dados já processados via tools e nunca chama a Meta. `propose_action` é
 * a única tool de escrita, e só cria um card pendente no feed (mesmo
 * pipeline de guardrails). Sonnet 5, mesmo modelo do Reasoner diário.
 */

export const maxDuration = 60;

const CHAT_MODEL = "claude-sonnet-5";
const MAX_TOOL_ROUNDS = 6;
const HISTORY_LIMIT = 20;

const bodySchema = z.object({
  adAccountId: z.string().uuid(),
  message: z.string().trim().min(1).max(4000),
});

const SYSTEM_PROMPT = `Você é um gestor de tráfego sênior especializado em Meta Ads, atuando como copiloto de outro gestor humano, conversando no chat da plataforma sobre UMA conta específica.

Regras de decisão (obrigatórias):
- Você nunca calcula métricas por conta própria e nunca chama a Meta diretamente. Use as tools (get_metrics, get_business_context, get_action_history, run_signal_scan) para ler dados já processados.
- Toda métrica ou número que você citar DEVE vir literalmente do resultado de uma tool chamada nesta conversa — nunca invente ou estime.
- Use run_signal_scan primeiro quando precisar descobrir quais entidades existem e seus meta_ids antes de chamar get_metrics ou propose_action.
- propose_action APENAS cria um card pendente no feed — nunca executa nada na Meta. Deixe sempre claro que a ação ainda precisa de aprovação do gestor.
- Nunca proponha ADJUST_BUDGET/REALLOCATE_BUDGET com params.change_pct acima de 20% ou abaixo de -20% (guardrail padrão).
- Ancore toda recomendação no Business Context da conta (ticket médio, margem, estratégia, restrições) — consulte get_business_context antes de recomendar.
- Responda sempre em português, em linguagem de negócio, direto ao ponto.`;

interface ToolCallLogEntry {
  name: string;
  input: unknown;
  result: unknown;
}

export async function POST(request: Request) {
  try {
    const { user } = await requireOrgMember();

    const parsedBody = bodySchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return NextResponse.json({ error: "Payload inválido" }, { status: 400 });
    }
    const { adAccountId, message } = parsedBody.data;

    const supabase = await createClient();
    const { data: account } = await supabase
      .from("ad_accounts")
      .select("id, org_id")
      .eq("id", adAccountId)
      .maybeSingle();
    if (!account) {
      return NextResponse.json({ error: "Conta não encontrada" }, { status: 404 });
    }

    const { data: priorRows } = await supabase
      .from("chat_messages")
      .select("role, content")
      .eq("ad_account_id", adAccountId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);

    const history = [...(priorRows ?? [])].reverse();

    const { error: insertUserError } = await supabase.from("chat_messages").insert({
      ad_account_id: adAccountId,
      user_id: user.id,
      role: "user",
      content: message,
    });
    if (insertUserError) throw insertUserError;

    const anthropic = new Anthropic();
    const toolCtx = createChatToolContext(adAccountId);

    const messages: Anthropic.MessageParam[] = [
      ...history.map((h) => ({ role: h.role as "user" | "assistant", content: h.content ?? "" })),
      { role: "user" as const, content: message },
    ];

    const toolCallLog: ToolCallLogEntry[] = [];
    const usageTotals: LlmCallUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheCreationInputTokens: 0,
      cacheReadInputTokens: 0,
    };
    let model = CHAT_MODEL;
    let finalText = "";

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const response = await anthropic.messages.create({
        model: CHAT_MODEL,
        max_tokens: 2000,
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        messages,
        tools: CHAT_TOOLS,
      });

      model = response.model;
      usageTotals.inputTokens += response.usage.input_tokens;
      usageTotals.outputTokens += response.usage.output_tokens;
      usageTotals.cacheCreationInputTokens += response.usage.cache_creation_input_tokens ?? 0;
      usageTotals.cacheReadInputTokens += response.usage.cache_read_input_tokens ?? 0;

      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason !== "tool_use") {
        finalText = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("\n");
        break;
      }

      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
      );
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of toolUseBlocks) {
        const result = await executeChatTool(block.name, block.input, toolCtx);
        toolCallLog.push({ name: block.name, input: block.input, result });
        toolResults.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(result) });
      }

      messages.push({ role: "user", content: toolResults });
    }

    if (!finalText) {
      finalText = "Não consegui concluir a análise dentro do limite de passos — tente reformular a pergunta.";
    }

    const { error: insertAssistantError } = await supabase.from("chat_messages").insert({
      ad_account_id: adAccountId,
      user_id: user.id,
      role: "assistant",
      content: finalText,
      tool_calls: toolCallLog,
    });
    if (insertAssistantError) throw insertAssistantError;

    await recordLlmUsage({
      orgId: account.org_id,
      adAccountId,
      purpose: "chat",
      model,
      usage: usageTotals,
    }).catch(() => {});

    return NextResponse.json({ reply: finalText, toolCalls: toolCallLog });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Erro ao processar mensagem do chat" }, { status: 500 });
  }
}
