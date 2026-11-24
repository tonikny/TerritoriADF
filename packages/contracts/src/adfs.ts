/**
 * Tipus de les ADF compartits per backend i frontend: la representació que
 * serialitza l'API, el límit territorial i les formes d'entrada de `POST`/`PUT`.
 *
 * `bbox`, `center` i `boundary_geojson` són de només lectura perquè són dades
 * calculades pel servidor (Nominatim), no estat editable pel client.
 */

/** `bbox` d'una ADF: `[minLat, minLon, maxLat, maxLon]`. */
export type AdfBbox = readonly [number, number, number, number];

/** `center` d'una ADF: `[lat, lon]`. */
export type AdfCenter = readonly [number, number];

/** Geometria del `boundary_geojson` desat (GeoJSON Polygon o MultiPolygon). */
export type BoundaryGeometry =
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

/** `boundary_geojson` desat: Feature amb la geometria agregada de l'ADF. */
export interface AdfBoundaryFeature {
  type: "Feature";
  properties: { adf_id: number; name: string };
  geometry: BoundaryGeometry;
}

/**
 * ADF tal com la serialitza `serializeAdf()` a `GET /api/adfs` i
 * `GET /api/adfs/:id`. `boundary_geojson` només viatja quan es demana el detall.
 */
export interface Adf {
  id: number;
  nom: string;
  osm_relations: string[];
  bbox: AdfBbox | null;
  center: AdfCenter | null;
  tracking_shared: boolean | null;
  created_at: string | null;
  boundary_geojson?: AdfBoundaryFeature | null;
}

/** Cos de `POST /api/adfs` (l'`id` viatja a part) i de `PUT /api/adfs/:id`. */
export interface AdfInput {
  nom: string;
  osm_relations: string[];
}

/** Resposta de `PUT /api/adfs/:id/tracking-sharing`. */
export interface TrackingSharingResult {
  adf_id: number;
  tracking_shared: boolean;
}

/** Resposta de `POST /api/adfs/:id/boundaries` (límits recalculats des d'OSM). */
export interface AdfBoundariesResult {
  success: boolean;
  adf_id: number;
  bbox: AdfBbox | null;
  center: AdfCenter | null;
}
