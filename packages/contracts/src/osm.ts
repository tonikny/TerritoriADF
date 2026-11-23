/**
 * Formes de resposta de les rutes OSM (`back/src/routes/osm.ts` i el pull de
 * `POST /api/hidrants/sync`).
 */
import type { SyncStatus } from "./sync.js";

/** Fila de `GET /api/osm/pending`: el backend no parseja `sync_error`. */
export interface PendingHidrant {
  id: string;
  osm_id?: number | null;
  lat: number;
  lon: number;
  /** El filtre SQL de `GET /api/osm/pending` exclou `SYNCED`. */
  sync_status: Exclude<SyncStatus, "SYNCED">;
  sync_error?: string | null;
  street: string;
  num: string;
}

/** Comptadors per estat de sincronització d'una ADF. */
export interface OsmSyncStats {
  SYNCED: number;
  MISSING_IN_OSM: number;
  PENDING_CREATE: number;
  PENDING_UPDATE: number;
  PENDING_DELETE: number;
  CONFLICT: number;
  ERROR: number;
  REVIEW: number;
  total_pending: number;
}

/** Resposta de `GET /api/osm/pending?adf=ID`. */
export interface OsmPendingResponse {
  pending: PendingHidrant[];
  stats: OsmSyncStats;
}

/** Resposta de `POST /api/osm/discard-selected`. */
export interface OsmDiscardResult {
  discarded: number;
  deleted: number;
}

/** Resposta de `POST /api/osm/missing/purge`. */
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

/** Diff entre les dades locals i les d'OSM d'un hidrant (`GET /api/osm/diff/:id`). */
export interface OsmDiff {
  /** Etiquetes locals (el backend les anomena `osmTags`). */
  osmTags: Record<string, string>;
  /** Etiquetes remotes d'OSM (el backend les anomena `remoteOsmTags`). */
  remoteOsmTags: Record<string, string>;
  localLat: number;
  localLon: number;
  /** Poden faltar si el conflicte desat no portava les coordenades remotes. */
  remoteLat?: number;
  remoteLon?: number;
}
