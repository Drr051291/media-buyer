import { MetaClient } from "./client";

export type EntityLevel = "campaign" | "adset" | "ad";

export interface MetaEntity {
  level: EntityLevel;
  metaId: string;
  parentMetaId: string | null;
  name: string;
  status: string | null;
  objective: string | null;
  dailyBudget: number | null;
  targetingSummary: Record<string, unknown>;
  creativeId: string | null;
}

export interface FetchEntitiesPage {
  entities: MetaEntity[];
  /** Cursor para a próxima página; null quando não há mais páginas. */
  nextAfter: string | null;
}

const LEVEL_ENDPOINT: Record<EntityLevel, string> = {
  campaign: "campaigns",
  adset: "adsets",
  ad: "ads",
};

const LEVEL_FIELDS: Record<EntityLevel, string> = {
  campaign: "id,name,status,objective,daily_budget",
  adset: "id,name,status,daily_budget,campaign_id,targeting",
  ad: "id,name,status,adset_id,creative{id}",
};

interface RawCampaign {
  id: string;
  name: string;
  status?: string;
  objective?: string;
  daily_budget?: string;
}

interface RawAdset {
  id: string;
  name: string;
  status?: string;
  daily_budget?: string;
  campaign_id?: string;
  targeting?: Record<string, unknown>;
}

interface RawAd {
  id: string;
  name: string;
  status?: string;
  adset_id?: string;
  creative?: { id?: string };
}

interface MetaListResponse<T> {
  data: T[];
  paging?: { cursors?: { after?: string }; next?: string };
}

/** Resume o targeting para não guardar payloads gigantes/sensíveis do Meta. */
function summarizeTargeting(targeting: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!targeting) return {};
  const geoLocations = targeting.geo_locations as { countries?: string[] } | undefined;
  return {
    age_min: targeting.age_min,
    age_max: targeting.age_max,
    genders: targeting.genders,
    countries: geoLocations?.countries ?? [],
    interests_count: Array.isArray(targeting.interests) ? targeting.interests.length : 0,
    custom_audiences_count: Array.isArray(targeting.custom_audiences)
      ? targeting.custom_audiences.length
      : 0,
  };
}

function toMetaEntity(level: EntityLevel, raw: RawCampaign | RawAdset | RawAd): MetaEntity {
  if (level === "campaign") {
    const c = raw as RawCampaign;
    return {
      level,
      metaId: c.id,
      parentMetaId: null,
      name: c.name,
      status: c.status ?? null,
      objective: c.objective ?? null,
      dailyBudget: c.daily_budget ? Number(c.daily_budget) / 100 : null,
      targetingSummary: {},
      creativeId: null,
    };
  }
  if (level === "adset") {
    const a = raw as RawAdset;
    return {
      level,
      metaId: a.id,
      parentMetaId: a.campaign_id ?? null,
      name: a.name,
      status: a.status ?? null,
      objective: null,
      dailyBudget: a.daily_budget ? Number(a.daily_budget) / 100 : null,
      targetingSummary: summarizeTargeting(a.targeting),
      creativeId: null,
    };
  }
  const ad = raw as RawAd;
  return {
    level,
    metaId: ad.id,
    parentMetaId: ad.adset_id ?? null,
    name: ad.name,
    status: ad.status ?? null,
    objective: null,
    dailyBudget: null,
    targetingSummary: {},
    creativeId: ad.creative?.id ?? null,
  };
}

/**
 * Busca UMA página de UM nível de entidade (campaign|adset|ad) de uma conta.
 * O chamador (job de sync) controla paginação entre invocações via
 * sync_jobs.cursor — ver PROJECT.md 3.2 (jobs fatiados e retomáveis).
 */
export async function fetchEntitiesPage(
  client: MetaClient,
  metaAccountId: string,
  level: EntityLevel,
  after?: string,
  limit = 100,
): Promise<FetchEntitiesPage> {
  const response = await client.get<MetaListResponse<RawCampaign | RawAdset | RawAd>>(
    `act_${metaAccountId}/${LEVEL_ENDPOINT[level]}`,
    { fields: LEVEL_FIELDS[level], limit, after },
  );

  return {
    entities: response.data.map((raw) => toMetaEntity(level, raw)),
    nextAfter: response.paging?.next ? (response.paging.cursors?.after ?? null) : null,
  };
}
