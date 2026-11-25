// Formulari d'ADF i càlcul de límits: res d'això depèn de React, així que viu
// fora del component i es pot provar sol.
import turfArea from "@turf/area";

export type AdfDraft = {
  numero: string;
  nom: string;
  relations: string;
};

export type DraftMode = "create" | "edit";

export const EMPTY_ADF_DRAFT: AdfDraft = { numero: "", nom: "", relations: "" };

export const draftFrom = (adf: { id: number; nom: string; osm_relations: string[] }): AdfDraft => ({
  numero: String(adf.id),
  nom: adf.nom,
  relations: adf.osm_relations.join(", "),
});

/** "R345695, 345699" → ["R345695", "R345699"] (sense duplicats). */
export function parseRelations(value: string): string[] {
  const relations = value
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((r) => {
      const t = r.trim().toUpperCase();
      return /^\d+$/.test(t) ? `R${t}` : t;
    });
  return [...new Set(relations)];
}

/** URL d'OSM d'una relació, way o node; null si el format no encaixa. */
export function osmRelationUrl(relation: string): string | null {
  const m = /^([RWN])(\d+)$/.exec(relation);
  if (!m) {
    return null;
  }
  const kind = m[1] === "R" ? "relation" : m[1] === "W" ? "way" : "node";
  return `https://www.openstreetmap.org/${kind}/${m[2]}`;
}

/** Superfície (km²) del límit territorial guardat, o null si encara no s'ha calculat. */
export function boundaryAreaKm2(boundaryGeojson: string | null): number | null {
  if (!boundaryGeojson) {
    return null;
  }
  try {
    return turfArea(JSON.parse(boundaryGeojson) as Parameters<typeof turfArea>[0]) / 1_000_000;
  } catch {
    return null;
  }
}

export const KM2_FORMAT = new Intl.NumberFormat("ca-ES", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
