import type { AdfBbox, AdfCenter } from "@territoriadf/contracts/adfs";
import type { GeoBounds, LatLon, ViewState } from "./types";

const EARTH_RADIUS_M = 6_371_008.8;
const DEG_TO_RAD = Math.PI / 180;

export const DEFAULT_VIEW: ViewState = {
  center: { lat: 41.56, lon: 1.72 },
  zoom: 11,
};

export const toLngLat = (position: LatLon): [number, number] => [position.lon, position.lat];

export const fromLngLat = (lng: number, lat: number): LatLon => ({ lat, lon: lng });

export function bboxToBounds(bbox: AdfBbox): GeoBounds {
  return { south: bbox[0], west: bbox[1], north: bbox[2], east: bbox[3] };
}

export function boundsFromCoordinates(coordinates: readonly [number, number][]): GeoBounds | null {
  if (coordinates.length === 0) {
    return null;
  }
  let south = coordinates[0][1];
  let north = coordinates[0][1];
  let west = coordinates[0][0];
  let east = coordinates[0][0];
  for (const [lon, lat] of coordinates) {
    south = Math.min(south, lat);
    north = Math.max(north, lat);
    west = Math.min(west, lon);
    east = Math.max(east, lon);
  }
  return { south, west, north, east };
}

export function distanceMeters(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * DEG_TO_RAD;
  const dLon = (b.lon - a.lon) * DEG_TO_RAD;
  const lat1 = a.lat * DEG_TO_RAD;
  const lat2 = b.lat * DEG_TO_RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Manté el comportament anterior: si el destí cau fora del radi, s'interpola
 * linealment en lat/lon (vàlid per a radis curts).
 */
export function clampToMaxDistance(original: LatLon, target: LatLon, maxMeters: number): LatLon {
  const distance = distanceMeters(original, target);
  if (distance <= maxMeters || distance === 0) {
    return target;
  }
  const ratio = maxMeters / distance;
  return {
    lat: original.lat + (target.lat - original.lat) * ratio,
    lon: original.lon + (target.lon - original.lon) * ratio,
  };
}

export function viewForAdf(
  adf: { bbox: AdfBbox | null; center: AdfCenter | null } | null,
): ViewState {
  if (adf?.center) {
    return { center: { lat: adf.center[0], lon: adf.center[1] }, zoom: 14 };
  }
  return DEFAULT_VIEW;
}
