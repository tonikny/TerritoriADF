import { HidrantsRepository, type HidrantData } from "../db/repositories/hidrantsRepository.js";
import * as osmApi from "./osmApi.js";
import { buildOscXml } from "./osmXml.js";
import { parseOsmTags } from "./osmPushSync.js";
import { computeDiffStrings } from "./osmDiff.js";
import { APP_NAME } from "../utils/appInfo.js";

export type ConflictDetail = {
  hidrant: HidrantData;
  osmVersion: number;
  osmLat: number;
  osmLon: number;
  osmTags: Record<string, string>;
  diffFields: string[];
};

/**
 * Llistar tots els conflictes pendents.
 */
export function getConflicts(): ConflictDetail[] {
  const rows = HidrantsRepository.findConflicts();
  return rows.map((h) => {
    const errorData = parseConflictError(h.sync_error);
    const localTags = parseOsmTags(h.osm_tags);
    const diffFields = computeDiffStrings(
      h.lat,
      h.lon,
      localTags,
      errorData.osmLat,
      errorData.osmLon,
      errorData.osmTags,
    );

    return {
      hidrant: h,
      osmVersion: errorData.osmVersion,
      osmLat: errorData.osmLat,
      osmLon: errorData.osmLon,
      osmTags: errorData.osmTags,
      diffFields,
    };
  });
}

/**
 * Intentar resoldre automàticament un conflicte.
 *
 * Estratègia:
 * - Obtenir l'estat actual d'OSM
 * - Comparar camp per camp
 * - Si lat/lon difereixen → conflicte d'ubicació → no es pot resoldre automàticament
 * - Si només tags difereixen → merge intelligenty (prioritzar local tret que estigui buit)
 * - Si el merge és net → publicar i marcar SYNCED
 */
export async function tryAutoResolve(h: HidrantData): Promise<boolean> {
  if (!h.osm_id) {
    return false;
  }

  // Obtenir estat actual d'OSM
  const current = await osmApi.getNode(h.osm_id);
  if (!current) {
    return false;
  }

  const localTags = parseOsmTags(h.osm_tags);
  const posChanged =
    Math.abs(h.lat - current.lat) > 0.000001 || Math.abs(h.lon - current.lon) > 0.000001;

  // Si la posició ha canviat a OSM → conflicte d'ubicació → no resoluble automàticament
  if (posChanged) {
    return false;
  }

  // Merge de tags: prioritzar local tret que estigui buit
  const mergedTags = { ...current.tags };
  let hasChanges = false;

  for (const [k, v] of Object.entries(localTags)) {
    if (v && v !== "") {
      if (mergedTags[k] !== v) {
        mergedTags[k] = v;
        hasChanges = true;
      }
    }
  }

  if (!hasChanges) {
    // No hi ha canvis reals → marcar com a synced
    HidrantsRepository.resolveConflict(h.id, {
      osmVersion: current.version,
      lat: current.lat,
      lon: current.lon,
      osmTags: JSON.stringify(mergedTags),
    });
    return true;
  }

  // Publicar el merge
  const changesetId = await osmApi.createChangeset(
    `${APP_NAME} — Resolució automàtica conflicte ${h.osm_id}`,
  );

  const r = await osmApi.updateNode(
    h.osm_id,
    current.version,
    current.lat,
    current.lon,
    mergedTags,
    changesetId,
  );

  await osmApi.closeChangeset(changesetId);

  if (r.ok) {
    const newVersion = Number(r.data) || current.version + 1;
    HidrantsRepository.resolveConflict(h.id, {
      osmVersion: newVersion,
      lat: current.lat,
      lon: current.lon,
      osmTags: JSON.stringify(mergedTags),
    });
    return true;
  }

  return false;
}

/**
 * Resoldre un conflicte després de JOSM.
 * Torna a descarregar l'objecte des d'OSM i actualitza la BD.
 */
export async function resolveAfterJOSM(id: string): Promise<boolean> {
  const h = HidrantsRepository.findBySyncStatus(["CONFLICT"]).find((row) => row.id === id);
  if (!h || !h.osm_id) {
    return false;
  }

  const current = await osmApi.getNode(h.osm_id);
  if (!current) {
    return false;
  }

  HidrantsRepository.resolveConflict(h.id, {
    osmVersion: current.version,
    lat: current.lat,
    lon: current.lon,
    osmTags: JSON.stringify(current.tags),
  });

  return true;
}

/**
 * Generar un únic fitxer .osc amb tots els conflictes.
 * Retorna el contingut XML del fitxer.
 */
export function generateOscFile(): string | null {
  const conflicts = HidrantsRepository.findConflicts();
  if (conflicts.length === 0) {
    return null;
  }

  const operations = conflicts.map((h) => {
    const errorData = parseConflictError(h.sync_error);
    return {
      action: "modify" as const,
      osmId: h.osm_id || undefined,
      version: errorData.osmVersion,
      lat: h.lat,
      lon: h.lon,
      tags: parseOsmTags(h.osm_tags),
      changesetId: 0, // Placeholder — JOSM assignarà el seu propi changeset
    };
  });

  return buildOscXml(operations);
}

// --- Helpers ---

function parseConflictError(syncError: string | null | undefined): {
  osmVersion: number;
  osmLat: number;
  osmLon: number;
  osmTags: Record<string, string>;
} {
  try {
    const data = JSON.parse(syncError || "{}");
    return {
      osmVersion: data.osmVersion || 0,
      osmLat: data.osmLat || 0,
      osmLon: data.osmLon || 0,
      osmTags: data.osmTags || {},
    };
  } catch {
    return { osmVersion: 0, osmLat: 0, osmLon: 0, osmTags: {} };
  }
}
