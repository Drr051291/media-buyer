import "server-only";
import { enums, ResourceNames, type Customer } from "google-ads-api";
import type { CanonicalLevel } from "@/lib/providers/ads-provider";
import { customerFor, normalizeCustomerId } from "./client";
import { unitToMicros } from "./gaql";

/**
 * Mutações no Google Ads (ETAPA3GOOGLEADS BLOCO 6). V1 executa só pausar/
 * reativar (campaign/ad_group/ad_group_ad status) e ajustar budget de campanha
 * (campaign_budget.amount_micros). Passa pelos MESMOS guardrails do Meta — este
 * módulo é só a camada de escrita na API.
 *
 * Regra anti-bug: budget em MICROS na escrita (R$ 100/dia → 100_000_000).
 */

export interface GoogleMutationResult {
  raw: unknown;
}

/** Traduz o status canônico (ACTIVE/PAUSED) para o enum do Google (ENABLED/PAUSED). */
function campaignStatus(active: boolean) {
  return active ? enums.CampaignStatus.ENABLED : enums.CampaignStatus.PAUSED;
}
function adGroupStatus(active: boolean) {
  return active ? enums.AdGroupStatus.ENABLED : enums.AdGroupStatus.PAUSED;
}
function adGroupAdStatus(active: boolean) {
  return active ? enums.AdGroupAdStatus.ENABLED : enums.AdGroupAdStatus.PAUSED;
}

/**
 * Muda o status de uma entidade (pausar = active:false, reativar = active:true).
 * `parentId` (ad_group id) é obrigatório para o nível 'ad' — o resource name do
 * ad_group_ad é composto (adGroupId~adId).
 */
export async function setGoogleEntityStatus(
  customer: Customer,
  customerId: string,
  level: CanonicalLevel,
  entityId: string,
  active: boolean,
  parentId?: string | null,
): Promise<GoogleMutationResult> {
  const cid = normalizeCustomerId(customerId);
  if (level === "campaign") {
    const raw = await customer.campaigns.update([
      { resource_name: ResourceNames.campaign(cid, entityId), status: campaignStatus(active) },
    ]);
    return { raw };
  }
  if (level === "adset") {
    const raw = await customer.adGroups.update([
      { resource_name: ResourceNames.adGroup(cid, entityId), status: adGroupStatus(active) },
    ]);
    return { raw };
  }
  // level === "ad"
  if (!parentId) {
    throw new Error("Pausar/reativar anúncio do Google exige o ad_group pai (parent_meta_id)");
  }
  const raw = await customer.adGroupAds.update([
    { resource_name: ResourceNames.adGroupAd(cid, parentId, entityId), status: adGroupAdStatus(active) },
  ]);
  return { raw };
}

interface BudgetLookupRow {
  campaign_budget?: { resource_name?: string };
}

/**
 * Ajusta o budget diário de uma campanha. O budget do Google é um recurso
 * separado (campaign_budget); primeiro descobrimos seu resource_name via GAQL,
 * depois atualizamos amount_micros. `newDailyBudget` vem na unidade da moeda.
 */
export async function updateGoogleCampaignBudget(
  customer: Customer,
  campaignId: string,
  newDailyBudget: number,
): Promise<GoogleMutationResult> {
  const rows = (await customer.query(
    `SELECT campaign_budget.resource_name
     FROM campaign
     WHERE campaign.id = ${campaignId}`,
  )) as BudgetLookupRow[];
  const budgetResourceName = rows[0]?.campaign_budget?.resource_name;
  if (!budgetResourceName) {
    throw new Error("campaign_budget não encontrado para a campanha (budget compartilhado?)");
  }
  const raw = await customer.campaignBudgets.update([
    { resource_name: budgetResourceName, amount_micros: unitToMicros(newDailyBudget) },
  ]);
  return { raw };
}

/** Constrói o Customer autenticado a partir do refresh_token + customer_id. */
export function googleCustomer(refreshToken: string, customerId: string): Customer {
  return customerFor(refreshToken, customerId);
}
