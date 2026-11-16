import { useMemo } from "react";
import * as turf from "@turf/turf";
import type { Feature, MultiPolygon, Polygon } from "geojson";

export type MaskedArea = {
  mask: Polygon | MultiPolygon | null;
  boundary: Polygon | MultiPolygon | null;
};

const EMPTY: MaskedArea = { mask: null, boundary: null };

type AreaFeature = Feature<Polygon | MultiPolygon>;

function extractArea(value: unknown): AreaFeature | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as {
    type?: string;
    features?: AreaFeature[];
  };
  if (record.type === "FeatureCollection") {
    return record.features?.[0] ?? null;
  }
  if (record.type === "Feature") {
    return value as AreaFeature;
  }
  return null;
}

/** No fa cap petició: el límit ja arriba del context de l'ADF. */
export function useMaskedArea(boundaryGeojson: string | null): MaskedArea {
  return useMemo(() => {
    if (!boundaryGeojson) {
      return EMPTY;
    }
    try {
      const area = extractArea(JSON.parse(boundaryGeojson));
      if (!area) {
        return EMPTY;
      }
      const world = turf.polygon([
        [
          [-180, -90],
          [180, -90],
          [180, 90],
          [-180, 90],
          [-180, -90],
        ],
      ]);
      const masked = turf.difference(turf.featureCollection([world, area]));
      return { mask: masked?.geometry ?? null, boundary: area.geometry };
    } catch {
      return EMPTY;
    }
  }, [boundaryGeojson]);
}
