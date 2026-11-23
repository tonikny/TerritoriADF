import { z } from "zod";

import type { SyncStatus } from "./sync.js";

/**
 * Camps del formulari d'hidrant. Tots són text; els que no arriben queden buits,
 * que és el que fa `ui2Osm`: esborrar un camp esborra també el tag d'OSM.
 *
 * L'esquema valida la frontera del backend i el tipus (`z.infer`) és el que
 * consumeix el frontend.
 */
export const hidrantUiFieldsSchema = z.object({
  position: z.string().max(100).default(""),
  type: z.string().max(100).default(""),
  couplings: z.string().max(100).default(""),
  diameters: z.string().max(100).default(""),
  pressure: z.string().max(100).default(""),
  street: z.string().max(200).default(""),
  num: z.string().max(50).default(""),
  barri: z.string().max(200).default(""),
  surveyDate: z.string().max(50).default(""),
  estat: z.string().max(50).default(""),
});

export type HidrantUiFields = z.infer<typeof hidrantUiFieldsSchema>;

export type HidrantOsmTags = Record<string, string>;

function fromOsmCouplings(value: string): string {
  if (!value) {
    return "";
  }
  return value
    .split(";")
    .map((v) => v.trim())
    .map((v) => v.replace(/mm/i, "").trim())
    .filter((v) => v !== "")
    .join(";");
}

function toOsmCouplings(diameters: string): string {
  if (!diameters) {
    return "";
  }
  return diameters
    .split(";")
    .filter((d) => d.trim() !== "")
    .map((d) => `${d.trim()} mm`)
    .join("; ");
}

export function osm2Ui(osmTags: HidrantOsmTags): HidrantUiFields {
  const isOperative = osmTags["emergency"] === "fire_hydrant";
  const isOutOfService = osmTags["disused:emergency"] === "fire_hydrant";

  return {
    position: osmTags["fire_hydrant:position"] || "",
    type: osmTags["fire_hydrant:type"] || "",
    couplings: osmTags["couplings"] || "",
    diameters: fromOsmCouplings(osmTags["couplings:diameters"] || ""),
    pressure: osmTags["fire_hydrant:pressure"] || "",
    street: osmTags["addr:street"] || "",
    num: osmTags["addr:housenumber"] || "",
    barri: osmTags["addr:neighbourhood"] || "",
    surveyDate: osmTags["survey:date"] || "",
    estat: isOperative ? "Operatiu" : isOutOfService ? "Fora de servei" : "Desconegut",
  };
}

/**
 * Tags OSM que es deriven dels camps del formulari.
 * Si el camp corresponent queda buit, el tag s'ha d'esborrar de la BD.
 */
const UI_MANAGED_OSM_TAGS = [
  "fire_hydrant:position",
  "fire_hydrant:type",
  "couplings",
  "couplings:diameters",
  "fire_hydrant:pressure",
  "addr:street",
  "addr:housenumber",
  "addr:neighbourhood",
  "survey:date",
] as const;

export function ui2Osm(uiFields: HidrantUiFields): HidrantOsmTags {
  const osmTags: HidrantOsmTags = {
    "fire_hydrant:position": uiFields.position,
    "fire_hydrant:type": uiFields.type,
    couplings: uiFields.couplings,
    "couplings:diameters": toOsmCouplings(uiFields.diameters),
    "fire_hydrant:pressure": uiFields.pressure,
    "addr:street": uiFields.street,
    "addr:housenumber": uiFields.num,
    "addr:neighbourhood": uiFields.barri,
  };

  if (uiFields.surveyDate) {
    osmTags["survey:date"] = uiFields.surveyDate;
  }

  if (uiFields.estat === "Fora de servei") {
    osmTags["disused:emergency"] = "fire_hydrant";
    // No afegim emergency per evitar tags buits
  } else {
    // Operatiu o desconegut: el marquem com a hidrant genèric
    osmTags["emergency"] = "fire_hydrant";
    // No afegim disused:emergency per evitar tags buits
  }

  // Filtre centralitzat: Eliminem tots els tags amb valor buit, null o undefined
  return Object.fromEntries(
    Object.entries(osmTags).filter(
      (entry) => entry[1] !== "" && entry[1] !== null && entry[1] !== undefined,
    ),
  ) as HidrantOsmTags;
}

/**
 * Fusiona els camps del formulari amb els tags existents.
 *
 * Els tags gestionats pel formulari esborrats a la UI (camp buit) s'eliminen
 * del resultat, de manera que esborrar un camp també esborra la clau i el valor
 * a la BD (i, per tant, a OSM en el proper push). La resta de tags que no prove
 * del formulari es mantenen intactes.
 */
export function mergeUiFieldsIntoTags(
  currentTags: HidrantOsmTags,
  uiFields: HidrantUiFields,
): HidrantOsmTags {
  const newTags = ui2Osm(uiFields);
  const merged = { ...currentTags };

  // Esborrem els tags gestionats que ja no tenen valor al formulari
  for (const tag of UI_MANAGED_OSM_TAGS) {
    if (!(tag in newTags)) {
      delete merged[tag];
    }
  }

  // Actualitzem in situ els valors existents (manté l'ordre de les claus, perquè
  // la comparació amb els tags desats sigui estable) i afegim els nous al final
  for (const [tag, value] of Object.entries(newTags)) {
    merged[tag] = value;
  }

  return merged;
}

/**
 * Compara dos conjunts de tags OSM pel contingut, sense tenir en compte
 * l'ordre de les claus (l'ordre en què OSM retorna els tags no és estable).
 */
export function sameOsmTags(a: HidrantOsmTags, b: HidrantOsmTags): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) {
    return false;
  }
  return aKeys.every((key) => a[key] === b[key]);
}

// --- Resposta de l'API: `GET /api/hidrants` (FeatureCollection GeoJSON) ---

/**
 * Detall d'un conflicte entre la versió local i la d'OSM. El guarda
 * `HidrantsRepository.markConflict()` quan el push rep un 409 o quan un pull
 * troba canvis als dos costats.
 */
export interface HidrantSyncConflict {
  localVersion?: number | null;
  osmVersion?: number;
  osmLat?: number;
  osmLon?: number;
  localLat?: number;
  localLon?: number;
  localTags?: Record<string, string>;
  osmTags?: Record<string, string>;
  diffFields?: string[];
  /** Algun error desat com a JSON pot portar el missatge en aquest camp. */
  message?: string;
}

/** Un problema de la validació prèvia al push (estat `REVIEW`). */
export interface HidrantSyncIssue {
  tag: string;
  level: "warning" | "error";
  message: string;
}

/**
 * `sync_error` no té una sola forma, perquè guarda coses diferents segons
 * l'estat: el JSON d'un conflicte, la llista de warnings d'una revisió, o el
 * text pla d'un error inesperat. Buit quan no hi ha res a dir.
 */
type HidrantSyncError = HidrantSyncConflict | HidrantSyncIssue[] | string | null;

/** Observacions privades: només surten amb la sessió iniciada. */
export type HidrantPrivateTags = Record<string, unknown> & { observacions?: string };

/**
 * Un hidrant tal com el retorna `GET /api/hidrants`.
 *
 * `sync_status` no pot ser `null`: la columna `hidrants.sync_status` és
 * `NOT NULL DEFAULT 'SYNCED'` (migració `0011`). Això importa perquè les
 * consultes amb `NOT IN` i `!=` descarten les files NULL en silenci: un hidrant
 * sense estat desapareixeria del mapa, del panell OSM i del push alhora.
 */
export interface HidrantFeature {
  type: "Feature";
  id: string;
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    id: string;
    osm_id: number | null;
    osm_tags: Record<string, string>;
    ui_fields: HidrantUiFields;
    private_tags?: HidrantPrivateTags;
    sync_status: SyncStatus;
    sync_error: HidrantSyncError;
    synced_at: string | null;
    remote_osm_tags: Record<string, string> | null;
    remote_lat: number | null;
    remote_lon: number | null;
    updated_at: string | null;
  };
}
