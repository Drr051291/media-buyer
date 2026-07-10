import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { ga4Connector } from "./connector";
import {
  getGa4Connection,
  readRefreshToken,
  type Ga4ConnectionRow,
} from "./connection";
import type { Ga4NormalizedRow } from "./report";

/**
 * Sync do GA4 (ETAPA2-GA4 BLOCOS 5-6). Jobs fatiados e retomaveis (PROJECT.md
 * 3.2): uma propriedade (ou uma janela) por invocacao, progresso em
 * connections.sync_cursor. GA4 nao usa sync_jobs (aquela e keyed por
 * ad_account NOT NULL).
 */

const CONFLICT_KEY =
  "connection_id,date,session_source,session_medium,session_campaign,landing_page,device_category";
const REFETCH_DAYS = 3; // GA4 revisa dados retroativamente (~48-72h)
const DEFAULT_INCREMENTAL_LOOKBACK_DAYS = 7;
const BACKFILL_CHUNK_DAYS = 14;
const BACKFILL_DEFAULT_DAYS = 90;
const UPSERT_BATCH = 500;

interface IncrementalCursor {
  last_date?: string;
}
interface BackfillCursor {
  status?: "running" | "done";
  next_until?: string;
  floor?: string;
}
interface Ga4SyncCursor {
  incremental?: IncrementalCursor;
  backfill?: BackfillCursor;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Desloca uma data 'YYYY-MM-DD' por N dias (negativo = passado). UTC-safe. */
function shiftIso(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function maxIso(a: string, b: string): string {
  return a >= b ? a : b;
}

/** Converte linhas normalizadas em rows de ga4_metrics_daily. */
function toDbRows(connection: Ga4ConnectionRow, rows: Ga4NormalizedRow[]) {
  return rows.map((r) => ({
    org_id: connection.org_id,
    connection_id: connection.id,
    ad_account_id: connection.ad_account_id,
    property_id: connection.ga4_property_id,
    ...r,
    synced_at: new Date().toISOString(),
  }));
}

/**
 * Upsert idempotente por chave natural. Rodar 2x a mesma janela NAO duplica —
 * sobrescreve (o re-fetch dos ultimos dias e esperado).
 */
export async function upsertGa4Metrics(
  connection: Ga4ConnectionRow,
  rows: Ga4NormalizedRow[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const supabase = createServiceRoleClient();
  const dbRows = toDbRows(connection, rows);

  for (let i = 0; i < dbRows.length; i += UPSERT_BATCH) {
    const batch = dbRows.slice(i, i + UPSERT_BATCH);
    const { error } = await supabase
      .from("ga4_metrics_daily")
      .upsert(batch, { onConflict: CONFLICT_KEY });
    if (error) throw error;
  }
  return dbRows.length;
}

async function patchCursor(connectionId: string, cursor: Ga4SyncCursor): Promise<void> {
  const supabase = createServiceRoleClient();
  await supabase
    .from("connections")
    .update({ sync_cursor: cursor, last_sync_at: new Date().toISOString() })
    .eq("id", connectionId);
}

interface SyncOutcome {
  processed: boolean;
  rows?: number;
  window?: { start: string; end: string };
  reason?: string;
}

/**
 * Sync incremental de UMA conexao: re-busca [last_date - 3d, hoje] e avanca o
 * cursor. Sem cursor ainda -> ultimos 7 dias (o historico vem do backfill).
 */
export async function syncIncremental(connectionId: string): Promise<SyncOutcome> {
  const connection = await getGa4Connection(connectionId);
  if (!connection) return { processed: false, reason: "conexao_inexistente" };
  if (connection.status !== "active") return { processed: false, reason: "conexao_inativa" };
  if (!connection.ga4_property_id) return { processed: false, reason: "sem_propriedade" };

  const cursor = (connection.sync_cursor ?? {}) as Ga4SyncCursor;
  const end = todayIso();
  const start = cursor.incremental?.last_date
    ? shiftIso(cursor.incremental.last_date, -REFETCH_DAYS)
    : shiftIso(end, -DEFAULT_INCREMENTAL_LOOKBACK_DAYS);

  const refreshToken = await readRefreshToken(connection);
  const rows = await ga4Connector.fetchWindow(refreshToken, connection.ga4_property_id, start, end);
  const written = await upsertGa4Metrics(connection, rows);

  await patchCursor(connectionId, {
    ...cursor,
    incremental: { last_date: end },
  });

  return { processed: true, rows: written, window: { start, end } };
}

/** Agenda o backfill de 90d (chamado no fim do wizard). Idempotente. */
export async function initBackfill(
  connectionId: string,
  days = BACKFILL_DEFAULT_DAYS,
): Promise<void> {
  const connection = await getGa4Connection(connectionId);
  if (!connection) return;
  const cursor = (connection.sync_cursor ?? {}) as Ga4SyncCursor;
  const end = todayIso();
  await patchCursor(connectionId, {
    ...cursor,
    backfill: { status: "running", next_until: end, floor: shiftIso(end, -days) },
  });
}

/**
 * Processa UMA janela do backfill (retomavel): [max(floor, next_until - 14d),
 * next_until]. Avanca next_until para tras; quando alcanca o floor, marca done.
 */
export async function runBackfillChunk(connectionId: string): Promise<SyncOutcome> {
  const connection = await getGa4Connection(connectionId);
  if (!connection) return { processed: false, reason: "conexao_inexistente" };
  if (connection.status !== "active") return { processed: false, reason: "conexao_inativa" };
  if (!connection.ga4_property_id) return { processed: false, reason: "sem_propriedade" };

  const cursor = (connection.sync_cursor ?? {}) as Ga4SyncCursor;
  const bf = cursor.backfill;
  if (!bf || bf.status === "done" || !bf.next_until || !bf.floor) {
    return { processed: false, reason: "sem_backfill_pendente" };
  }

  const end = bf.next_until;
  const start = maxIso(bf.floor, shiftIso(end, -(BACKFILL_CHUNK_DAYS - 1)));

  const refreshToken = await readRefreshToken(connection);
  const rows = await ga4Connector.fetchWindow(refreshToken, connection.ga4_property_id, start, end);
  const written = await upsertGa4Metrics(connection, rows);

  const done = start <= bf.floor;
  await patchCursor(connectionId, {
    ...cursor,
    backfill: done
      ? { ...bf, status: "done" }
      : { ...bf, next_until: shiftIso(start, -1) },
  });

  return { processed: true, rows: written, window: { start, end } };
}

/** Conexoes GA4 ativas com propriedade escolhida (para os orquestradores de cron). */
async function activeGa4Connections(): Promise<Ga4ConnectionRow[]> {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("connections")
    .select("id, org_id, ad_account_id, ga4_property_id, status, credentials_vault_id, sync_cursor, organizations!inner(status)")
    .eq("connector_id", "ga4")
    .eq("status", "active")
    .eq("organizations.status", "active")
    .not("ga4_property_id", "is", null);
  return (data as Ga4ConnectionRow[] | null) ?? [];
}

/**
 * Orquestrador incremental para o worker diario: uma conexao por chamada
 * (disciplina de timeout). Retorna se processou algo, para o loop do worker.
 */
export async function processNextGa4Incremental(): Promise<SyncOutcome> {
  const connections = await activeGa4Connections();
  // Prioriza quem ainda nao tem cursor incremental (recem-conectada).
  const pending = connections.sort((a, b) => {
    const al = ((a.sync_cursor as Ga4SyncCursor)?.incremental?.last_date) ?? "";
    const bl = ((b.sync_cursor as Ga4SyncCursor)?.incremental?.last_date) ?? "";
    return al.localeCompare(bl);
  });
  const today = todayIso();
  for (const c of pending) {
    const last = (c.sync_cursor as Ga4SyncCursor)?.incremental?.last_date;
    if (last === today) continue; // ja sincronizada hoje
    return syncIncremental(c.id);
  }
  return { processed: false, reason: "nada_pendente" };
}

/** Orquestrador de backfill para o worker diario: uma janela por chamada. */
export async function processNextGa4BackfillChunk(): Promise<SyncOutcome> {
  const connections = await activeGa4Connections();
  for (const c of connections) {
    const bf = (c.sync_cursor as Ga4SyncCursor)?.backfill;
    if (bf && bf.status === "running") {
      return runBackfillChunk(c.id);
    }
  }
  return { processed: false, reason: "nada_pendente" };
}
