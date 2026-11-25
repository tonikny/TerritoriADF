import { randomUUID } from "node:crypto";
import { HidrantsRepository } from "../db/repositories/hidrantsRepository.js";
import { syncAdfFromOSM } from "./osmSync.js";
import { NotFoundError, BadRequestError } from "../errors.js";
import {
  osm2Ui,
  ui2Osm,
  mergeUiFieldsIntoTags,
  sameOsmTags,
  type HidrantServiceTags,
  type HidrantUiFields,
} from "@territoriadf/contracts/hidrants";
import { clampToMaxDistance, hasPositionChanged, MAX_HYDRANT_MOVE_METERS } from "../utils/geo.js";
import { parseOsmTags, parseServiceTags, parseSyncError } from "../utils/jsonColumns.js";
import { assertPointInAdf } from "./adfArea.js";

export const HidrantsService = {
  async forceSync(adfId: number, force = false) {
    const result = await syncAdfFromOSM(adfId, force);
    return result;
  },

  async getGeoJson(adfId: number, options: { includeServiceTags?: boolean } = {}) {
    // Lectura pura: aquí no es fa cap pull d'OSM. Baixar els hidrants és una acció
    // explícita (panell OSM → "Baixar d'OSM", o POST /api/hidrants/sync), de manera
    // que una recàrrega de la pàgina no depèn de cap servei extern ni es queda
    // esperant Overpass.
    const rows = HidrantsRepository.findActiveByAdf(adfId);

    const features = rows.map((row) => {
      const osm_tags = parseOsmTags(row.osm_tags, row.id) ?? {};
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
          // Informació de servei de l'hidrant (observacions, accessos...). No és
          // privada d'una ADF: surt per a qualsevol sessió, de qualsevol ADF
          // (ADR 0005). La resposta anònima manté la mateixa URL perquè la caché
          // offline del service worker segueixi funcionant.
          ...(options.includeServiceTags
            ? { service_tags: parseServiceTags(row.service_tags, row.id) ?? {} }
            : {}),
          sync_status: row.sync_status,
          sync_error: parseSyncError(row.sync_error, row.id),
          synced_at: row.synced_at,
          remote_osm_tags: parseOsmTags(row.remote_osm_tags, row.id, "remote_osm_tags"),
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
    ui_fields?: HidrantUiFields,
    service_tags?: HidrantServiceTags,
  ) {
    if (!lat || !lon) {
      throw new BadRequestError("Missing lat or lon");
    }

    assertPointInAdf(adfId, lat, lon);

    const osm_tags = ui_fields ? ui2Osm(ui_fields) : {};
    const id = randomUUID();

    HidrantsRepository.create({
      id,
      adf_id: adfId,
      lat,
      lon,
      osm_tags,
      service_tags: service_tags ?? {},
      sync_status: "PENDING_CREATE",
    });

    return { id, sync_status: "PENDING_CREATE" };
  },

  updateLocal(
    id: string,
    adfId: number,
    lat?: number,
    lon?: number,
    ui_fields?: HidrantUiFields,
    service_tags?: HidrantServiceTags,
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
      const currentOsmTags = { ...(current.osm_tags ?? {}) };

      if (ui_fields.estat) {
        delete currentOsmTags["emergency"];
        delete currentOsmTags["disused:emergency"];
      }

      // Esborrar un camp del formulari esborra també el tag (clau i valor):
      // els tags gestionats que queden buits no es tornen a afegir.
      osm_tags = mergeUiFieldsIntoTags(currentOsmTags, ui_fields);

      // Comparar si realment han canviat els tags
      if (JSON.stringify(osm_tags) !== JSON.stringify(current.osm_tags ?? {})) {
        hasOsmChanges = true;
      }
    }

    // Canvi de sync_status només si hi ha canvis en camps OSM (lat/lon/etiquetes d'OSM),
    // sense tenir en compte els tags de servei (observacions, etc.)
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
      const remoteOsmTags = parseOsmTags(current.remote_osm_tags, current.id, "remote_osm_tags");

      if (remoteOsmTags) {
        const localOsmTags = osm_tags ?? parseOsmTags(current.osm_tags, current.id) ?? {};
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
      osm_tags: osm_tags ?? undefined,
      service_tags: service_tags ?? undefined,
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

  getSyncStats(adfId?: number) {
    return HidrantsRepository.getSyncStats(adfId);
  },
};
