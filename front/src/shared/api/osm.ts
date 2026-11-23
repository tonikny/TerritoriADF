// Funcions pures de la feature OSM: consulta de pendents i accions de push/pull.
// Les mutacions que hi ha darrere canvien hidrants i estats de sync, així que qui
// les crida ha d'invalidar les consultes afectades (`osmPending` i `hidrants`).
import type { SyncStatus } from "@territoriadf/contracts/sync";

import { request } from "./client";

/** Fila de `GET /api/osm/pending`: el backend no parseja `sync_error`. */
export interface PendingHidrant {
  id: string;
  osm_id: number | null;
  lat: number;
  lon: number;
  /** `GET /api/osm/pending` filtra els SYNCED: aquí no hi poden arribar. */
  sync_status: Exclude<SyncStatus, "SYNCED">;
  sync_error: string | null;
  street: string;
  num: string;
}

export interface OsmSyncStats {
  PENDING_CREATE: number;
  PENDING_UPDATE: number;
  PENDING_DELETE: number;
  CONFLICT: number;
  ERROR: number;
  REVIEW: number;
  MISSING_IN_OSM: number;
  total_pending: number;
}

export interface OsmPendingResponse {
  pending: PendingHidrant[];
  stats: OsmSyncStats | null;
}

/** Resultat de `POST /api/osm/push-selected` i `push-sync`. */
export interface OsmPushResult {
  synced: number;
  conflicts: number;
  errors: number;
  reviewed: number;
  details: Array<{
    id: string;
    osmId: number | null;
    status: "synced" | "conflict" | "error" | "review";
    message?: string;
  }>;
}

export interface OsmDiscardResult {
  discarded: number;
  deleted: number;
}

export interface OsmPurgeResult {
  deleted: number;
}

/** Resposta de `POST /api/hidrants/sync` (pull des d'OSM). */
export interface OsmPullSyncResult {
  success: boolean;
  message: string;
  total: number;
  skipped: number;
  conflicts: number;
}

export async function getOsmPending(
  adfId: number,
  signal?: AbortSignal,
): Promise<OsmPendingResponse> {
  const data = await request<OsmPendingResponse>("/api/osm/pending", {
    query: { adf: adfId },
    signal,
  });
  return { pending: data.pending ?? [], stats: data.stats ?? null };
}

export function pushToOsm(ids: string[]): Promise<OsmPushResult> {
  return request<OsmPushResult>("/api/osm/push-selected", { method: "POST", body: { ids } });
}

export function discardOsmChanges(ids: string[]): Promise<OsmDiscardResult> {
  return request<OsmDiscardResult>("/api/osm/discard-selected", {
    method: "POST",
    body: { ids },
  });
}

/** Aplica la versió d'OSM a un hidrant (sobreescriu les dades locals). */
export async function pullHydrantFromOsm(id: string): Promise<void> {
  await request<unknown>("/api/osm/pull-hydrant", { method: "POST", body: { id } });
}

export function purgeMissingFromOsm(adfId: number, ids?: string[]): Promise<OsmPurgeResult> {
  return request<OsmPurgeResult>("/api/osm/missing/purge", {
    method: "POST",
    body: ids && ids.length > 0 ? { adf_id: adfId, ids } : { adf_id: adfId },
  });
}

/** Baixa d'OSM els hidrants sincronitzats de l'ADF; els canvis locals es mantenen. */
export function syncAdfFromOsm(
  adfId: number,
  options?: { force?: boolean },
): Promise<OsmPullSyncResult> {
  return request<OsmPullSyncResult>("/api/hidrants/sync", {
    method: "POST",
    query: { adf: adfId },
    body: options?.force ? { force: true } : {},
  });
}
