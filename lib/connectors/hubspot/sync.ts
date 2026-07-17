import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { toBusinessEventRow, type CanonicalEvent } from "@/lib/connectors/data-connector";
import {
  searchObjects,
  getDealPipelines,
  batchContactAssociations,
  lastModifiedProperty,
} from "./client";
import { accessTokenFor, readCredentials } from "./credentials";
import { getHubspotConnection, type HubspotConnectionRow } from "./connection";
import {
  buildDealStageIndex,
  mapContact,
  mapDeal,
  mapMeeting,
  CONTACT_PROPERTIES,
  DEAL_PROPERTIES,
  MEETING_PROPERTIES,
  type DealStageIndex,
  type HubspotObject,
} from "./map";

/**
 * Sync do HubSpot (ETAPA-HUBSPOT.md seção 4). Jobs fatiados e retomáveis
 * (PROJECT.md 3.2): UMA página da Search API por objeto por invocação,
 * progresso em connections.sync_cursor. Backfill e incremental usam o MESMO
 * mecanismo — o cursor começa 180 dias atrás (horizonte da atribuição,
 * ETAPA2.md 2.4) e avança até "agora"; depois disso cada rodada diária puxa
 * só o que mudou. O webhook mantém os dados frescos entre rodadas.
 *
 * Formato do cursor:
 *   { "hubspot": {
 *       "last_run_date": "YYYY-MM-DD",       // rodada diária já concluída?
 *       "objects": {
 *         "contacts": { "since_ms": 1234, "after": "..."? },
 *         "deals":    { ... },
 *         "meetings": { ... } } } }
 */

const OBJECT_TYPES = ["contacts", "deals", "meetings"] as const;
type HubspotObjectType = (typeof OBJECT_TYPES)[number];

const BACKFILL_DEFAULT_DAYS = 180;
const PAGE_LIMIT = 100;

interface ObjectCursor {
  since_ms: number;
  after?: string;
}
interface HubspotCursor {
  last_run_date?: string;
  objects?: Partial<Record<HubspotObjectType, ObjectCursor>>;
}
interface SyncCursorEnvelope {
  hubspot?: HubspotCursor;
  [key: string]: unknown;
}

const PROPERTIES: Record<HubspotObjectType, readonly string[]> = {
  contacts: CONTACT_PROPERTIES,
  deals: DEAL_PROPERTIES,
  meetings: MEETING_PROPERTIES,
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function patchCursor(connectionId: string, envelope: SyncCursorEnvelope): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase
    .from("connections")
    .update({ sync_cursor: envelope, last_sync_at: new Date().toISOString() })
    .eq("id", connectionId);
}

/** Upsert idempotente em business_events (UNIQUE connector_id, external_id). */
export async function upsertBusinessEvents(
  connection: HubspotConnectionRow,
  events: CanonicalEvent[],
): Promise<number> {
  if (events.length === 0) return 0;
  const supabase = createServiceRoleClient();
  const rows = events.map((event) =>
    toBusinessEventRow(connection.org_id, connection.ad_account_id, "hubspot", event),
  );
  const { error } = await supabase
    .from("business_events")
    .upsert(rows, { onConflict: "connector_id,external_id", ignoreDuplicates: true });
  if (error) throw error;
  return rows.length;
}

/** Inicializa os cursores (fim do wizard). Idempotente; não zera cursor existente. */
export async function initHubspotSync(
  connectionId: string,
  days = BACKFILL_DEFAULT_DAYS,
): Promise<void> {
  const connection = await getHubspotConnection(connectionId);
  if (!connection) return;
  const envelope = (connection.sync_cursor ?? {}) as SyncCursorEnvelope;
  const existing = envelope.hubspot?.objects ?? {};
  const floorMs = Date.now() - days * 24 * 60 * 60 * 1000;

  const objects: Partial<Record<HubspotObjectType, ObjectCursor>> = {};
  for (const type of OBJECT_TYPES) {
    objects[type] = existing[type] ?? { since_ms: floorMs };
  }
  await patchCursor(connectionId, {
    ...envelope,
    hubspot: { ...envelope.hubspot, last_run_date: undefined, objects },
  });
}

export interface SyncOutcome {
  processed: boolean;
  rows?: number;
  reason?: string;
  /** true quando ainda há páginas pendentes (o worker deve voltar). */
  pending?: boolean;
}

/** Epoch ms da última modificação de um objeto retornado pela Search API. */
function lastModifiedMs(type: HubspotObjectType, object: HubspotObject): number {
  const value = object.properties[lastModifiedProperty(type)];
  const ms = value ? Date.parse(value) : NaN;
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Processa UMA página de UM tipo de objeto e avança o cursor. Retorna os
 * eventos mapeados (a gravação é do chamador, que agrega os três tipos).
 */
async function pullPage(
  accessToken: string,
  portalId: string,
  type: HubspotObjectType,
  cursor: ObjectCursor,
  stageIndexRef: { current: DealStageIndex | null },
): Promise<{ events: CanonicalEvent[]; nextCursor: ObjectCursor; hadPage: boolean }> {
  const page = await searchObjects(accessToken, {
    objectType: type,
    sinceMs: cursor.since_ms,
    properties: PROPERTIES[type],
    after: cursor.after,
    limit: PAGE_LIMIT,
  });

  const results = (page.results ?? []) as HubspotObject[];
  if (results.length === 0) {
    return { events: [], nextCursor: { since_ms: cursor.since_ms }, hadPage: false };
  }

  let events: CanonicalEvent[] = [];
  if (type === "contacts") {
    events = results.flatMap((c) => mapContact(portalId, c));
  } else if (type === "deals") {
    if (!stageIndexRef.current) {
      stageIndexRef.current = buildDealStageIndex(await getDealPipelines(accessToken));
    }
    const associations = await batchContactAssociations(
      accessToken,
      "deals",
      results.map((r) => r.id),
    );
    events = results.flatMap((d) =>
      mapDeal(portalId, d, stageIndexRef.current!, associations[d.id] ?? []),
    );
  } else {
    const associations = await batchContactAssociations(
      accessToken,
      "meetings",
      results.map((r) => r.id),
    );
    events = results.flatMap((m) => mapMeeting(portalId, m, associations[m.id] ?? []));
  }

  const nextAfter = page.paging?.next?.after;
  if (nextAfter) {
    // Há mais páginas nesta janela: mantém o since e leva o `after` adiante.
    return { events, nextCursor: { since_ms: cursor.since_ms, after: nextAfter }, hadPage: true };
  }

  // Janela esgotada: avança o since para o último visto + 1ms. O GTE +
  // upsert idempotente absorvem qualquer sobreposição de timestamps.
  const maxSeen = Math.max(...results.map((r) => lastModifiedMs(type, r)), cursor.since_ms);
  return { events, nextCursor: { since_ms: maxSeen + 1 }, hadPage: true };
}

/**
 * Roda uma fatia do sync de UMA conexão: no máximo uma página por tipo de
 * objeto (3 buscas + associações ≈ bem abaixo do timeout). Retomável: se
 * qualquer tipo ainda tem `after`, o worker é convidado a voltar.
 */
export async function syncHubspotSlice(connectionId: string): Promise<SyncOutcome> {
  const connection = await getHubspotConnection(connectionId);
  if (!connection) return { processed: false, reason: "conexao_inexistente" };
  if (connection.status !== "active") return { processed: false, reason: "conexao_inativa" };
  if (!connection.hubspot_portal_id) return { processed: false, reason: "sem_portal" };

  const envelope = (connection.sync_cursor ?? {}) as SyncCursorEnvelope;
  const cursor = envelope.hubspot;
  if (!cursor?.objects) return { processed: false, reason: "sync_nao_inicializado" };

  const credentials = await readCredentials(connection.credentials_vault_id);
  const accessToken = await accessTokenFor(credentials);
  const stageIndexRef = { current: null as DealStageIndex | null };

  let totalRows = 0;
  let anyAfterPending = false;
  const nextObjects: Partial<Record<HubspotObjectType, ObjectCursor>> = { ...cursor.objects };

  for (const type of OBJECT_TYPES) {
    const objectCursor = cursor.objects[type];
    if (!objectCursor) continue;
    const { events, nextCursor } = await pullPage(
      accessToken,
      connection.hubspot_portal_id,
      type,
      objectCursor,
      stageIndexRef,
    );
    totalRows += await upsertBusinessEvents(connection, events);
    nextObjects[type] = nextCursor;
    if (nextCursor.after) anyAfterPending = true;
  }

  await patchCursor(connectionId, {
    ...envelope,
    hubspot: {
      ...cursor,
      objects: nextObjects,
      // Rodada diária concluída só quando nenhuma janela tem página pendente.
      last_run_date: anyAfterPending ? cursor.last_run_date : todayIso(),
    },
  });

  return { processed: true, rows: totalRows, pending: anyAfterPending };
}

/** Conexões HubSpot ativas de orgs ativas (para o worker de cron). */
async function activeHubspotConnections(): Promise<HubspotConnectionRow[]> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("connections")
    .select(
      "id, org_id, ad_account_id, hubspot_portal_id, status, credentials_vault_id, sync_cursor, organizations!inner(status)",
    )
    .eq("connector_id", "hubspot")
    .eq("status", "active")
    .eq("organizations.status", "active")
    .not("hubspot_portal_id", "is", null);
  return (data as HubspotConnectionRow[] | null) ?? [];
}

/**
 * Orquestrador para o worker diário (app/api/cron/sync): uma fatia por
 * chamada (disciplina de timeout). Prioriza conexões com paginação pendente
 * (backfill em andamento); pula quem já concluiu a rodada de hoje.
 */
export async function processNextHubspotSlice(): Promise<SyncOutcome> {
  const connections = await activeHubspotConnections();
  const today = todayIso();

  const hasPendingAfter = (c: HubspotConnectionRow) => {
    const objects = ((c.sync_cursor as SyncCursorEnvelope)?.hubspot?.objects ?? {}) as Partial<
      Record<HubspotObjectType, ObjectCursor>
    >;
    return Object.values(objects).some((o) => o?.after);
  };
  const ranToday = (c: HubspotConnectionRow) =>
    (c.sync_cursor as SyncCursorEnvelope)?.hubspot?.last_run_date === today;

  const candidate =
    connections.find(hasPendingAfter) ?? connections.find((c) => !ranToday(c));
  if (!candidate) return { processed: false, reason: "nada_pendente" };

  return syncHubspotSlice(candidate.id);
}
