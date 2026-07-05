/**
 * Business Context Profile — PROJECT.md secao 6.2. O diferencial do produto:
 * sem isso, qualquer analise de metricas e generica.
 */

export const BUSINESS_MODELS = [
  "ecommerce",
  "leadgen",
  "app",
  "local",
  "infoproduto",
  "saas",
] as const;
export type BusinessModel = (typeof BUSINESS_MODELS)[number];

export const ESTRATEGIAS = ["escala", "eficiencia", "teste"] as const;
export type Estrategia = (typeof ESTRATEGIAS)[number];

export interface BusinessContextProfile {
  business_model: BusinessModel | "";
  vertical: string;
  descricao_livre: string;
  objetivo_principal: string;
  eventos_secundarios: string[];
  ticket_medio: number | null;
  margem_bruta_pct: number | null;
  cpa_alvo: number | null;
  roas_alvo: number | null;
  cpa_maximo_aceitavel: number | null;
  ltv_estimado: number | null;
  ciclo_de_venda_dias: number | null;
  orcamento_mensal: number | null;
  estrategia: Estrategia | "";
  sazonalidade: string[];
  restricoes: string[];
  notas_do_gestor: string;
}

export const EMPTY_BUSINESS_CONTEXT_PROFILE: BusinessContextProfile = {
  business_model: "",
  vertical: "",
  descricao_livre: "",
  objetivo_principal: "",
  eventos_secundarios: [],
  ticket_medio: null,
  margem_bruta_pct: null,
  cpa_alvo: null,
  roas_alvo: null,
  cpa_maximo_aceitavel: null,
  ltv_estimado: null,
  ciclo_de_venda_dias: null,
  orcamento_mensal: null,
  estrategia: "",
  sazonalidade: [],
  restricoes: [],
  notas_do_gestor: "",
};

/**
 * Deriva um alvo de CPA quando o cliente não define um explicitamente:
 * cpa_breakeven = ticket_medio * margem_bruta_pct; alvo sugerido = 70% disso.
 * Sempre mostrar ao usuário e pedir confirmação (nunca aplicar silenciosamente).
 */
export function deriveCpaAlvo(
  ticketMedio: number | null,
  margemBrutaPct: number | null,
): { breakeven: number; suggested: number } | null {
  if (ticketMedio == null || margemBrutaPct == null) return null;
  if (ticketMedio <= 0 || margemBrutaPct <= 0) return null;

  const breakeven = ticketMedio * (margemBrutaPct / 100);
  const suggested = breakeven * 0.7;
  return { breakeven, suggested };
}
