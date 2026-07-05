import { MetaClient } from "./client";

/**
 * Mutações na Meta Graph API. V1 executa apenas pausar/reativar, ajustar
 * budget e duplicar adset (PROJECT.md 12, premissa 3) — qualquer outro tipo
 * de ação proposta pelo Reasoner fica só como recomendação nesta fase.
 */

export interface MetaMutationResult {
  raw: unknown;
}

async function setEntityStatus(
  client: MetaClient,
  metaId: string,
  status: "ACTIVE" | "PAUSED",
): Promise<MetaMutationResult> {
  const raw = await client.post(metaId, { status });
  return { raw };
}

export function pauseEntity(client: MetaClient, metaId: string): Promise<MetaMutationResult> {
  return setEntityStatus(client, metaId, "PAUSED");
}

export function reactivateEntity(client: MetaClient, metaId: string): Promise<MetaMutationResult> {
  return setEntityStatus(client, metaId, "ACTIVE");
}

/**
 * Ajusta o daily_budget de um adset ou campanha. `newDailyBudget` é
 * informado na unidade normal da moeda (ex: reais) — a Graph API espera o
 * valor na menor unidade (centavos), a mesma convenção usada ao ler o
 * budget em lib/meta/entities.ts (dividido por 100 na leitura).
 */
export async function updateDailyBudget(
  client: MetaClient,
  metaId: string,
  newDailyBudget: number,
): Promise<MetaMutationResult> {
  const dailyBudgetCents = Math.round(newDailyBudget * 100);
  const raw = await client.post(metaId, { daily_budget: dailyBudgetCents });
  return { raw };
}

export interface DuplicateAdsetResult {
  newAdsetMetaId: string | null;
  raw: unknown;
}

interface CopiesResponse {
  copied_adset_id?: string;
  adset_id?: string;
}

/** POST /{adset_id}/copies — duplica um adset (com criativos/ads) via deep copy. */
export async function duplicateAdset(
  client: MetaClient,
  adsetMetaId: string,
  statusOption: "PAUSED" | "ACTIVE" | "INHERITED_FROM_SOURCE" = "PAUSED",
): Promise<DuplicateAdsetResult> {
  const raw = await client.post<CopiesResponse>(`${adsetMetaId}/copies`, {
    deep_copy: true,
    status_option: statusOption,
  });

  return { newAdsetMetaId: raw.copied_adset_id ?? raw.adset_id ?? null, raw };
}
