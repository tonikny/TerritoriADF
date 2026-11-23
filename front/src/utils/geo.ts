import type { BoundaryGeometry } from "@territoriadf/contracts/adfs";

function pointInRing(lat: number, lon: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0],
      yi = ring[i][1];
    const xj = ring[j][0],
      yj = ring[j][1];
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
  try {
    const geom = (JSON.parse(boundaryGeojson) as { geometry?: BoundaryGeometry }).geometry;
    if (!geom) {
      return true;
    }
    if (geom.type === "Polygon") {
      const ring = geom.coordinates[0];
      return ring ? pointInRing(lat, lon, ring) : true;
    }
    if (geom.type === "MultiPolygon") {
      return geom.coordinates.some((polygon) => {
        const ring = polygon[0];
        return ring ? pointInRing(lat, lon, ring) : false;
      });
    }
  } catch {
    /* ignore parse errors */
  }
  return true;
}
