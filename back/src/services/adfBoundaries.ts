import { db } from "../db/index.js";
import { adfs } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "../utils/logger.js";
import { AppError } from "../errors.js";
import { APP_NAME } from "../utils/appInfo.js";

const log = logger.child({ module: "adf", operation: "boundaries" });

// Nominatim demana com a molt una petició per segon des del mateix client.
const NOMINATIM_DELAY_MS = 1100;
const NOMINATIM_TIMEOUT_MS = 20_000;

type NominatimPlace = {
  geojson?: unknown;
  boundingbox?: [string, string, string, string];
};

export class BoundaryUpdateError extends AppError {
  constructor(message: string, statusCode = 502) {
    super(message, statusCode);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPlace(osmRelation: string): Promise<NominatimPlace> {
  const url =
    "https://nominatim.openstreetmap.org/lookup?" +
    new URLSearchParams({
      osm_ids: osmRelation,
      format: "jsonv2",
      polygon_geojson: "1",
    });

  const response = await fetch(url, {
    headers: { "User-Agent": `${APP_NAME}/1.0` },
    signal: AbortSignal.timeout(NOMINATIM_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Nominatim error ${response.status}`);
  }
  const data = (await response.json()) as NominatimPlace[];
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error(`No data for ${osmRelation}`);
  }
  const place = data[0];
  if (!place.geojson || !place.boundingbox) {
    throw new Error(`Resposta incompleta per ${osmRelation}`);
  }
  return place;
}

/**
 * Baixa el límit de les relacions OSM de l'ADF i desa `bbox`, `center` i
 * `boundary_geojson`. Només desa si ha pogut baixar TOTES les relacions, perquè
 * un límit parcial faria que el mapa masking retallés zones vàlides.
 */
async function computeAndSave(adfId: number): Promise<void> {
  const adf = db.select().from(adfs).where(eq(adfs.id, adfId)).get();
  if (!adf) {
    throw new BoundaryUpdateError("ADF no trobada", 404);
  }

  const relations = JSON.parse(adf.osm_relations) as string[];
  if (relations.length === 0) {
    throw new BoundaryUpdateError("L'ADF no té cap relació OSM", 400);
  }

  let combinedGeoJson: unknown = null;
  let minLat = 90;
  let minLon = 180;
  let maxLat = -90;
  let maxLon = -180;
  let successCount = 0;

  for (const [index, relation] of relations.entries()) {
    if (index > 0) {
      await sleep(NOMINATIM_DELAY_MS);
    }

    try {
      const place = await fetchPlace(relation);
      if (!combinedGeoJson) {
        combinedGeoJson = {
          type: "Feature",
          properties: { adf_id: adf.id, name: adf.nom },
          geometry: place.geojson,
        };
      }

      const b = place.boundingbox!; // boundingbox: [minlat, maxlat, minlon, maxlon]
      minLat = Math.min(minLat, parseFloat(b[0]));
      maxLat = Math.max(maxLat, parseFloat(b[1]));
      minLon = Math.min(minLon, parseFloat(b[2]));
      maxLon = Math.max(maxLon, parseFloat(b[3]));
      successCount++;
    } catch (err) {
      log.warn(
        {
          adfId,
          relation,
          error: err instanceof Error ? err.message : err,
        },
        "Error descarregant la relació OSM",
      );
    }
  }

  if (successCount !== relations.length || !combinedGeoJson) {
    throw new BoundaryUpdateError(
      `No s'han pogut descarregar totes les relacions OSM (${successCount}/${relations.length}). Torna-ho a provar més tard.`,
    );
  }

  const bbox = [minLat, minLon, maxLat, maxLon];
  const center = [(minLat + maxLat) / 2, (minLon + maxLon) / 2];

  db.update(adfs)
    .set({
      bbox: JSON.stringify(bbox),
      center: JSON.stringify(center),
      boundary_geojson: JSON.stringify(combinedGeoJson),
    })
    .where(eq(adfs.id, adf.id))
    .run();
}

// Evita que dos clics simultanis facin la mateixa ronda de peticions a Nominatim.
const inFlight = new Map<number, Promise<void>>();

export function updateAdfBoundaries(adfId: number): Promise<void> {
  const running = inFlight.get(adfId);
  if (running) {
    return running;
  }
  const task = computeAndSave(adfId).finally(() => inFlight.delete(adfId));
  inFlight.set(adfId, task);
  return task;
}
