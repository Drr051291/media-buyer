"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { BusinessContextProfile } from "@/lib/engine/business-context";

export type SaveContextState = { error: string | null; ok?: boolean };

function toNumberOrNull(value: FormDataEntryValue | null): number | null {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toList(value: FormDataEntryValue | null): string[] {
  if (value == null) return [];
  return String(value)
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function saveBusinessContext(
  adAccountId: string,
  _prevState: SaveContextState,
  formData: FormData,
): Promise<SaveContextState> {
  const profile: BusinessContextProfile = {
    business_model: String(formData.get("business_model") ?? "") as BusinessContextProfile["business_model"],
    vertical: String(formData.get("vertical") ?? ""),
    descricao_livre: String(formData.get("descricao_livre") ?? ""),
    objetivo_principal: String(formData.get("objetivo_principal") ?? ""),
    eventos_secundarios: toList(formData.get("eventos_secundarios")),
    ticket_medio: toNumberOrNull(formData.get("ticket_medio")),
    margem_bruta_pct: toNumberOrNull(formData.get("margem_bruta_pct")),
    cpa_alvo: toNumberOrNull(formData.get("cpa_alvo")),
    roas_alvo: toNumberOrNull(formData.get("roas_alvo")),
    cpa_maximo_aceitavel: toNumberOrNull(formData.get("cpa_maximo_aceitavel")),
    ltv_estimado: toNumberOrNull(formData.get("ltv_estimado")),
    ciclo_de_venda_dias: toNumberOrNull(formData.get("ciclo_de_venda_dias")),
    orcamento_mensal: toNumberOrNull(formData.get("orcamento_mensal")),
    estrategia: String(formData.get("estrategia") ?? "") as BusinessContextProfile["estrategia"],
    sazonalidade: toList(formData.get("sazonalidade")),
    restricoes: toList(formData.get("restricoes")),
    notas_do_gestor: String(formData.get("notas_do_gestor") ?? ""),
  };

  const supabase = await createClient();
  const { error } = await supabase.from("business_context").upsert(
    {
      ad_account_id: adAccountId,
      profile,
      business_model: profile.business_model || null,
      objetivo_principal: profile.objetivo_principal || null,
      ticket_medio: profile.ticket_medio,
      margem_bruta_pct: profile.margem_bruta_pct,
      cpa_alvo: profile.cpa_alvo,
      roas_alvo: profile.roas_alvo,
      cpa_maximo: profile.cpa_maximo_aceitavel,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "ad_account_id" },
  );

  if (error) {
    return { error: error.message };
  }

  revalidatePath(`/app/accounts/${adAccountId}/context`);
  return { error: null, ok: true };
}
