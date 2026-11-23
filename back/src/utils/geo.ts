// Distancia màxima que es pot arrossegar un hidrant respecte a la seva posició actual.
// Única font de veritat: el frontend la consulta a GET /api/config (routes/appConfig.ts).
export const MAX_HYDRANT_MOVE_METERS = 50;

/** `bbox` d'una ADF tal com es desa a la BD: `[minLat, minLon, maxLat, maxLon]`. */
export type AdfBbox = [number, number, number, number];

/** `center` d'una ADF tal com es desa a la BD: `[lat, lon]`. */
export type AdfCenter = [number, number];

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

// Tolerància (en graus) per considerar dues coordenades iguals: ~11 cm de latitud. Mateix criteri que
// osmConflictResolver; OSM només desa 7 decimals, així que diferències menors no són canvis reals.
export const COORD_TOLERANCE_DEG = 0.000001;

/**
 * Indica si la posició sol·licitada difereix de l'actual més enllà de COORD_TOLERANCE_DEG.
 * Evita comparar amb `!==` nombres de coma flotant (arrodoniments del client, soroll numèric,
 * arrossegar i tornar a l'origen), que generarien un PENDING_UPDATE i un push a OSM sense canvi real.
 */
export function hasPositionChanged(
  currentLat: number,
  currentLon: number,
  lat?: number,
  lon?: number,
): boolean {
  return (
    (lat !== undefined && Math.abs(lat - currentLat) > COORD_TOLERANCE_DEG) ||
    (lon !== undefined && Math.abs(lon - currentLon) > COORD_TOLERANCE_DEG)
  );
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export function clampToMaxDistance(
  origLat: number,
  origLon: number,
  targetLat: number,
  targetLon: number,
  maxMeters: number,
): { lat: number; lon: number } {
  const dist = haversineMeters(origLat, origLon, targetLat, targetLon);
  if (dist <= maxMeters) {
    return { lat: targetLat, lon: targetLon };
  }
  const ratio = maxMeters / dist;
  return {
    lat: origLat + (targetLat - origLat) * ratio,
    lon: origLon + (targetLon - origLon) * ratio,
  };
}

function pointInRing(lat: number, lon: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    // Un vèrtex incomplet no és un polígon vàlid: se salta en lloc de calcular amb `undefined`.
    const xi = ring[i]?.[0],
      yi = ring[i]?.[1];
    const xj = ring[j]?.[0],
      yj = ring[j]?.[1];
    if (xi === undefined || yi === undefined || xj === undefined || yj === undefined) {
      continue;
    }
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function isPointInBoundary(
  lat: number,
  lon: number,
  boundaryGeojson: string | null,
): boolean {
  if (!boundaryGeojson) {
    return true;
  }
  const geom = (JSON.parse(boundaryGeojson) as { geometry?: BoundaryGeometry }).geometry;
  if (!geom) {
    return true;
  }
  if (geom.type === "Polygon") {
    const ring = geom.coordinates[0];
    return ring ? pointInRing(lat, lon, ring) : true;
  }
  if (geom.type === "MultiPolygon") {
    return geom.coordinates.some((p) => {
      const ring = p[0];
      return ring ? pointInRing(lat, lon, ring) : false;
    });
  }
  return true;
}
