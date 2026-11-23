/**
 * Estats de sincronització d'un hidrant amb OpenStreetMap.
 *
 * - `SYNCED`: local i OSM coincideixen.
 * - `MISSING_IN_OSM`: existia a OSM i ja no hi és.
 * - `PENDING_CREATE` / `PENDING_UPDATE` / `PENDING_DELETE`: canvi local pendent de push.
 * - `CONFLICT`: local i remot han canviat tots dos.
 * - `ERROR`: la validació o l'API d'OSM ha fallat.
 * - `REVIEW`: es pot pujar, però té warnings (valors no estàndard, majúscules...).
 */
export const SYNC_STATUSES = [
  "SYNCED",
  "MISSING_IN_OSM",
  "PENDING_CREATE",
  "PENDING_UPDATE",
  "PENDING_DELETE",
  "CONFLICT",
  "ERROR",
  "REVIEW",
] as const;

export type SyncStatus = (typeof SYNC_STATUSES)[number];

/** Detall d'un hidrant al resultat d'un push a OSM. */
interface OsmPushDetail {
  id: string;
  osmId: number | null;
  status: "synced" | "conflict" | "error" | "review";
  message?: string;
}

/** Resultat de `POST /api/osm/push-selected` i `POST /api/osm/push-sync`. */
export interface OsmPushResult {
  synced: number;
  conflicts: number;
  errors: number;
  reviewed: number;
  details: OsmPushDetail[];
}
