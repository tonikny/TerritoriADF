// Diff entre la versió local i la d'OSM: dues fonts (el `sync_error` de la BD
// quan hi ha conflicte i `GET /api/osm/diff/:id` quan no) que s'han de veure
// igual al panell. Les conversions són pures i es proven.
import type { HidrantFeature } from "@territoriadf/contracts/hidrants";
import type { OsmDiff } from "@territoriadf/contracts/osm";

export type SyncError = HidrantFeature["properties"]["sync_error"];

export interface DiffData {
  localTags: Record<string, string>;
  osmTags: Record<string, string>;
  localLat?: number;
  localLon?: number;
  osmLat?: number;
  osmLon?: number;
}

/** Diff desat durant el pull, si el conflicte en porta les dades. */
export function buildDiffFromConflict(syncError: SyncError): DiffData | null {
  if (syncError?.kind !== "conflict") {
    return null;
  }
  const { localTags, osmTags } = syncError;
  if (!localTags || !osmTags) {
    return null;
  }
  return {
    localTags,
    osmTags,
    localLat: syncError.localLat,
    localLon: syncError.localLon,
    osmLat: syncError.osmLat,
    osmLon: syncError.osmLon,
  };
}

/**
 * Resposta del backend → forma del panell. El backend anomena `osmTags` les
 * etiquetes locals i `remoteOsmTags` les remotes.
 */
export function diffFromBackend(diff: OsmDiff): DiffData {
  return {
    localTags: diff.osmTags,
    osmTags: diff.remoteOsmTags,
    localLat: diff.localLat,
    localLon: diff.localLon,
    osmLat: diff.remoteLat,
    osmLon: diff.remoteLon,
  };
}

/** Només les etiquetes que difereixen; les absents es mostren com a «(buit)». */
export function diffRows(diff: DiffData): { key: string; local: string; osm: string }[] {
  const allKeys = new Set([...Object.keys(diff.localTags), ...Object.keys(diff.osmTags)]);
  const rows: { key: string; local: string; osm: string }[] = [];
  for (const key of allKeys) {
    const lv = diff.localTags[key] ?? "";
    const ov = diff.osmTags[key] ?? "";
    if (lv !== ov) {
      rows.push({ key, local: lv || "(buit)", osm: ov || "(buit)" });
    }
  }
  return rows;
}
