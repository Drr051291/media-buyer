"use server";

import { createClient } from "@/lib/supabase/server";
import { generateWeeklyReport } from "@/lib/engine/weekly-report";
import { recordLlmUsage } from "@/lib/engine/llm-usage";

export type GenerateReportState = { report: string | null; error: string | null };

export async function generateReportAction(
  adAccountId: string,
  _prevState: GenerateReportState,
  _formData: FormData,
): Promise<GenerateReportState> {
  try {
    const supabase = await createClient();
    const { data: account } = await supabase
      .from("ad_accounts")
      .select("org_id")
      .eq("id", adAccountId)
      .maybeSingle();

    if (!account) return { report: null, error: "Conta não encontrada" };

    const { report, usage, model } = await generateWeeklyReport(adAccountId);

    if (model !== "n/a") {
      await recordLlmUsage({
        orgId: account.org_id,
        adAccountId,
        purpose: "weekly_report",
        model,
        usage,
      });
    }

    return { report, error: null };
  } catch (error) {
    return { report: null, error: error instanceof Error ? error.message : "Erro ao gerar relatório" };
  }
}
