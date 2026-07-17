import "server-only";

/**
 * Client mínimo da API do HubSpot (ETAPA-HUBSPOT.md seção 4). Mesma
 * disciplina do lib/meta/client.ts: retry com backoff exponencial em 429/5xx,
 * pedir só os fields necessários, paginação explícita.
 *
 * Limites relevantes: ~110 req/10s por portal instalado; a SEARCH API tem
 * teto separado (~4 req/s, compartilhado entre objetos) e cap de 10.000
 * resultados por query — por isso o sync avança por cursor de
 * hs_lastmodifieddate em vez de paginar uma query gigante.
 */

const BASE_URL = "https://api.hubapi.com";
const MAX_RETRIES = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function hubspotFetch<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });

    if (res.ok) {
      return (await res.json()) as T;
    }

    // 429 (rate limit) e 5xx: backoff exponencial e retry.
    if (res.status === 429 || res.status >= 500) {
      lastError = new Error(`HubSpot ${path}: ${res.status} ${res.statusText}`);
      if (attempt < MAX_RETRIES) {
        await sleep(1000 * 2 ** attempt);
        continue;
      }
      throw lastError;
    }

    // 4xx não-recuperável: inclui o corpo (sem token) para diagnóstico.
    const body = await res.text().catch(() => "");
    throw new Error(`HubSpot ${path}: ${res.status} ${body.slice(0, 300)}`);
  }
  throw lastError ?? new Error(`HubSpot ${path}: falha desconhecida`);
}

export interface SearchPage<T> {
  total: number;
  results: T[];
  paging?: { next?: { after?: string } };
}

export interface SearchParams {
  objectType: "contacts" | "deals" | "meetings";
  /** Epoch ms — filtra hs_lastmodifieddate/lastmodifieddate >= since. */
  sinceMs: number;
  properties: readonly string[];
  after?: string;
  limit?: number;
}

/** Nome da propriedade de "última modificação" difere entre contatos e o resto. */
export function lastModifiedProperty(objectType: SearchParams["objectType"]): string {
  return objectType === "contacts" ? "lastmodifieddate" : "hs_lastmodifieddate";
}

/**
 * Uma página da Search API, ordenada por última modificação ASC — o cursor
 * incremental do sync avança com o último registro visto (padrão GTE +
 * upsert idempotente para absorver a sobreposição).
 */
export async function searchObjects(
  accessToken: string,
  params: SearchParams,
): Promise<SearchPage<{ id: string; properties: Record<string, string | null> }>> {
  const sortProperty = lastModifiedProperty(params.objectType);
  return hubspotFetch(accessToken, `/crm/v3/objects/${params.objectType}/search`, {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [
            { propertyName: sortProperty, operator: "GTE", value: String(params.sinceMs) },
          ],
        },
      ],
      sorts: [{ propertyName: sortProperty, direction: "ASCENDING" }],
      properties: params.properties,
      limit: params.limit ?? 100,
      ...(params.after ? { after: params.after } : {}),
    }),
  });
}

interface PipelinesResponse {
  results: {
    id: string;
    label: string;
    stages: { id: string; label: string; metadata?: { isClosed?: string; probability?: string } }[];
  }[];
}

export async function getDealPipelines(accessToken: string): Promise<PipelinesResponse["results"]> {
  const data = await hubspotFetch<PipelinesResponse>(accessToken, "/crm/v3/pipelines/deals");
  return data.results;
}

interface AssociationsBatchResponse {
  results: { from: { id: string }; to: { toObjectId: number }[] }[];
}

/**
 * Associações em lote (v4): deal/meeting -> contatos. A Search API não
 * devolve associações, então cada página de deals/meetings custa +1 chamada.
 */
export async function batchContactAssociations(
  accessToken: string,
  fromObjectType: "deals" | "meetings",
  ids: string[],
): Promise<Record<string, string[]>> {
  if (ids.length === 0) return {};
  const data = await hubspotFetch<AssociationsBatchResponse>(
    accessToken,
    `/crm/v4/associations/${fromObjectType}/contacts/batch/read`,
    {
      method: "POST",
      body: JSON.stringify({ inputs: ids.map((id) => ({ id })) }),
    },
  );
  const map: Record<string, string[]> = {};
  for (const row of data.results ?? []) {
    map[row.from.id] = (row.to ?? []).map((t) => String(t.toObjectId));
  }
  return map;
}

/** Busca um objeto individual (usado pelo handler de webhook). */
export async function getObject(
  accessToken: string,
  objectType: "contacts" | "deals",
  id: string,
  properties: readonly string[],
): Promise<{ id: string; properties: Record<string, string | null> } | null> {
  try {
    return await hubspotFetch(
      accessToken,
      `/crm/v3/objects/${objectType}/${id}?properties=${properties.join(",")}`,
    );
  } catch (error) {
    // Objeto apagado entre o webhook e o fetch: ignora.
    if (error instanceof Error && error.message.includes(": 404")) return null;
    throw error;
  }
}

/**
 * Info da conta (funciona com OAuth e private app token) — usado pelo
 * validate() e para descobrir o portalId no fluxo de token colado.
 */
export async function getAccountInfo(
  accessToken: string,
): Promise<{ portalId: string; timeZone?: string; companyCurrency?: string }> {
  const data = await hubspotFetch<{ portalId: number; timeZone?: string; companyCurrency?: string }>(
    accessToken,
    "/account-info/v3/details",
  );
  return { portalId: String(data.portalId), timeZone: data.timeZone, companyCurrency: data.companyCurrency };
}
