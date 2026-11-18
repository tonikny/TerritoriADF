import { v4 as uuidv4 } from "uuid";
import { HidrantsRepository } from "../db/repositories/hidrantsRepository.js";
import { syncAdfFromOSM } from "./osmSync.js";
import { NotFoundError, BadRequestError } from "../errors.js";
import {
  osm2Ui,
  ui2Osm,
  mergeUiFieldsIntoTags,
  sameOsmTags,
  type HydrantUiFields,
} from "../utils/osmConversion.js";
import { clampToMaxDistance, hasPositionChanged, MAX_HYDRANT_MOVE_METERS } from "../utils/geo.js";
import { assertPointInAdf } from "./adfArea.js";
/**
 * Parseja un camp de text que hauria de contenir un objecte JSON.
 * Retorna {} si és buit o malmès perquè una fila defectuosa no faci
 * fallar la llista sencera de l'ADF.
 */
function parseJsonObject<T extends Record<string, unknown>>(value: string | null | undefined): T {
  if (!value) {
    return {} as T;
  }
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as T;
    }
  } catch {
    /* valor no JSON: ignorem el contingut */
  }
  return {} as T;
}

/**
 * `sync_error` pot contenir JSON (conflictes/revisions) o text pla (estat ERROR).
 * Si no és JSON vàlid el retornem tal qual perquè el frontend el pugui mostrar.
 */
function parseSyncError(value: string | null | undefined): unknown {
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export const HidrantsService = {
  async forceSync(adfId: number, force = false) {
    const result = await syncAdfFromOSM(adfId, force);
    return result;
  },

  async getGeoJson(adfId: number, options: { includePrivateTags?: boolean } = {}) {
    // Lectura pura: aquí no es fa cap pull d'OSM. Baixar els hidrants és una acció
    // explícita (panell OSM → "Baixar d'OSM", o POST /api/hidrants/sync), de manera
    // que una recàrrega de la pàgina no depèn de cap servei extern ni es queda
    // esperant Overpass.
    const rows = HidrantsRepository.findActiveByAdf(adfId);

    const features = rows.map((row) => {
      const osm_tags = parseJsonObject<Record<string, string>>(row.osm_tags);
      const ui_fields = osm2Ui(osm_tags);

      return {
        type: "Feature",
        id: row.id,
        geometry: {
          type: "Point",
          coordinates: [row.lon, row.lat],
        },
        properties: {
          id: row.id,
          osm_id: row.osm_id,
          osm_tags, // Ara van en el seu propi objecte, no escampats
          ui_fields,
          // Les observacions privades només surten amb sessió iniciada (de qualsevol
          // ADF). La resposta anònima manté la mateixa URL perquè la caché offline
          // del service worker segueixi funcionant.
          ...(options.includePrivateTags
            ? { private_tags: parseJsonObject(row.private_tags) }
            : {}),
          sync_status: row.sync_status,
          sync_error: parseSyncError(row.sync_error),
          synced_at: row.synced_at,
          remote_osm_tags: row.remote_osm_tags ? parseJsonObject(row.remote_osm_tags) : null,
          remote_lat: row.remote_lat,
          remote_lon: row.remote_lon,
          updated_at: row.updated_at,
        },
      };
    });

    return {
      type: "FeatureCollection",
      features,
    };
  },

  createLocal(
    adfId: number,
    lat: number,
    lon: number,
    ui_fields?: HydrantUiFields,
    private_tags?: Record<string, unknown>,
  ) {
    if (!lat || !lon) {
      throw new BadRequestError("Missing lat or lon");
    }

    assertPointInAdf(adfId, lat, lon);

    const osm_tags = ui_fields ? ui2Osm(ui_fields) : {};
    const id = uuidv4();

    HidrantsRepository.create({
      id,
      adf_id: adfId,
      lat,
      lon,
      osm_tags: JSON.stringify(osm_tags),
      private_tags: JSON.stringify(private_tags || {}),
      sync_status: "PENDING_CREATE",
    });

    return { id, sync_status: "PENDING_CREATE" };
  },

  updateLocal(
    id: string,
    adfId: number,
    lat?: number,
    lon?: number,
    ui_fields?: HydrantUiFields,
    private_tags?: Record<string, unknown>,
  ) {
    if (!id) {
      throw new BadRequestError("Missing hydrant ID");
    }

    const current = HidrantsRepository.findByIdAndAdf(id, adfId);
    if (!current) {
      throw new NotFoundError("Hydrant not found");
    }

    // Limitem el desplaçament respecte a la posició actual (defensa en profunditat,
    // el frontend ja fa el mateix clamp visualment durant el drag).
    if (lat !== undefined || lon !== undefined) {
      const clamped = clampToMaxDistance(
        current.lat,
        current.lon,
        lat ?? current.lat,
        lon ?? current.lon,
        MAX_HYDRANT_MOVE_METERS,
      );
      lat = clamped.lat;
      lon = clamped.lon;
    }

    // Determinem si hi ha canvis que afecten OSM (lat, lon, osm_tags)
    let hasOsmChanges = false;

    // Comprovar canvis de posició (amb tolerància: no es comparen floats amb `!==`)
    const positionChanged = hasPositionChanged(current.lat, current.lon, lat, lon);
    if (positionChanged) {
      hasOsmChanges = true;
    } else {
      // Sense canvi real: no desem el soroll numèric, la posició guardada es manté intacta.
      lat = undefined;
      lon = undefined;
    }

    if (positionChanged) {
      const finalLat = lat ?? current.lat;
      const finalLon = lon ?? current.lon;
      assertPointInAdf(adfId, finalLat, finalLon);
    }

    // Comprovar canvis en osm_tags
    let osm_tags = undefined;
    if (ui_fields) {
      const currentOsmTags = JSON.parse(current.osm_tags || "{}");

      if (ui_fields.estat) {
        delete currentOsmTags["emergency"];
        delete currentOsmTags["disused:emergency"];
      }

      // Esborrar un camp del formulari esborra també el tag (clau i valor):
      // els tags gestionats que queden buits no es tornen a afegir.
      osm_tags = mergeUiFieldsIntoTags(currentOsmTags, ui_fields);

      // Comparar si realment han canviat els tags
      if (JSON.stringify(osm_tags) !== JSON.stringify(JSON.parse(current.osm_tags || "{}"))) {
        hasOsmChanges = true;
      }
    }

    // Canvi de sync_status només si hi ha canvis en camps OSM (lat/lon/etiquetes d'OSM),
    // sense tenir en compte camps privats (observacions, etc.)
    //
    // Si tenim la darrera versió coneguda d'OSM (remote_*), l'estat reflecteix si
    // les dades locals difereixen d'OSM i no si hi ha hagut cap edició: així,
    // deixar un hidrant igual que a OSM el torna a marcar com a SYNCED i no es
    // mostra un push pendent sense cap diferència real.
    let newSyncStatus = current.sync_status;
    const canAdjustSyncStatus =
      current.sync_status === "PENDING_UPDATE" ||
      (current.sync_status === "SYNCED" && hasOsmChanges);

    if (canAdjustSyncStatus) {
      const remoteOsmTags = current.remote_osm_tags
        ? parseJsonObject<Record<string, string>>(current.remote_osm_tags)
        : null;

      if (remoteOsmTags) {
        const localOsmTags = osm_tags ?? parseJsonObject<Record<string, string>>(current.osm_tags);
        const finalLat = lat ?? current.lat;
        const finalLon = lon ?? current.lon;
        const positionMatchesRemote =
          typeof current.remote_lat === "number" && typeof current.remote_lon === "number"
            ? !hasPositionChanged(current.remote_lat, current.remote_lon, finalLat, finalLon)
            : !positionChanged;

        newSyncStatus =
          sameOsmTags(localOsmTags, remoteOsmTags) && positionMatchesRemote
            ? "SYNCED"
            : "PENDING_UPDATE";
      } else if (current.sync_status === "SYNCED") {
        newSyncStatus = "PENDING_UPDATE";
      }
    }

    HidrantsRepository.update(id, adfId, {
      lat,
      lon,
      osm_tags: osm_tags ? JSON.stringify(osm_tags) : undefined,
      private_tags: private_tags ? JSON.stringify(private_tags) : undefined,
      sync_status: newSyncStatus,
    });

    return { success: true, sync_status: newSyncStatus };
  },

  deleteLocal(id: string, adfId: number) {
    if (!id) {
      throw new BadRequestError("Missing hydrant ID");
    }

    const current = HidrantsRepository.findByIdAndAdf(id, adfId);
    if (!current) {
      throw new NotFoundError("Hydrant not found");
    }

    // PENDING_CREATE: mai publicat a OSM. MISSING_IN_OSM: ja no és a OSM, així que no
    // hi ha res a esborrar allà. En tots dos casos la fila desapareix directament de la
    // BD; marcar-lo PENDING_DELETE faria que el push intentés esborrar a OSM un node
    // inexistent i el deixés en ERROR.
    if (current.sync_status === "PENDING_CREATE" || current.sync_status === "MISSING_IN_OSM") {
      HidrantsRepository.delete(id);
    } else {
      HidrantsRepository.markForDeletion(id);
    }

    return { success: true };
  },

  getSyncStats(adfId: number) {
    return HidrantsRepository.getSyncStats(adfId);
  },
};
