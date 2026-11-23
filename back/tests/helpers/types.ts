/**
 * Formes mínimes de les respostes que llegeixen els tests. Viuen aquí perquè
 * diverses suites comparteixen les mateixes; cada camp opcional és un camp que
 * algun test comprova que hi és o que no hi és, mai una resposta sencera.
 */

/** Cos d'error de l'API: `{ error: "..." }`. */
export type ErrorBody = { error: string };

/** Hidrant a `GET /api/hidrants` (FeatureCollection). */
export type HidrantFeature = {
  id: string;
  properties: {
    private_tags?: Record<string, string>;
    notes?: string;
    sync_status?: string;
    osm_tags?: Record<string, string>;
  };
};

export type HidrantFeatures = { features: HidrantFeature[] };
