import { useEffect } from "react";
import { useMap } from "@vis.gl/react-maplibre";
import { TERRAIN_ATTRIBUTION } from "../../shared/attribution";

// El servei de l'ICGC publica tessel·les entre z6 i z14. La ruta és local perquè
// el Nginx del host les cachegi; en desenvolupament la proxya Vite.
const DEM_TILE_URL = "/tiles/icgc-terrain/{z}/{x}/{y}.png";

const DEM_SOURCE = "terrain-dem";
const HILLSHADE_SOURCE = "hillshade-dem";
export const HILLSHADE_LAYER = "terrain-hillshade";
const TERRAIN_PITCH = 55;
const BASE_TERRAIN_EXAGGERATION = 1.3;

export function MaplibreTerrain({
  enabled,
  exaggeration = 1,
}: {
  enabled: boolean;
  exaggeration?: number;
}) {
  const { current: map } = useMap();

  useEffect(() => {
    const native = map?.getMap();
    if (!native) {
      return;
    }
    let cancelled = false;

    const ensureDemSource = (id: string) => {
      if (native.getSource(id)) {
        return;
      }
      native.addSource(id, {
        type: "raster-dem",
        tiles: [DEM_TILE_URL],
        encoding: "mapbox",
        tileSize: 512,
        minzoom: 6,
        maxzoom: 14,
        attribution: TERRAIN_ATTRIBUTION,
      });
    };

    const apply = () => {
      if (cancelled) {
        return;
      }
      if (enabled) {
        // MapLibre recomana una font per al terreny i una altra per al
        // hillshade; compartir-les empitjora la qualitat del relleu.
        ensureDemSource(DEM_SOURCE);
        ensureDemSource(HILLSHADE_SOURCE);
        if (!native.getLayer(HILLSHADE_LAYER)) {
          const beforeId = native
            .getStyle()
            ?.layers?.find(
              (layer) => layer.id.startsWith("polygon-") || layer.id.startsWith("polyline-"),
            )?.id;
          native.addLayer(
            {
              id: HILLSHADE_LAYER,
              type: "hillshade",
              source: HILLSHADE_SOURCE,
              paint: { "hillshade-exaggeration": 0.35 },
            },
            beforeId,
          );
        }
        native.setTerrain({
          source: DEM_SOURCE,
          exaggeration: BASE_TERRAIN_EXAGGERATION * exaggeration,
        });
        native.easeTo({ pitch: TERRAIN_PITCH, duration: 600 });
        return;
      }

      native.setTerrain(null);
      if (native.getLayer(HILLSHADE_LAYER)) {
        native.removeLayer(HILLSHADE_LAYER);
      }
      if (native.getSource(DEM_SOURCE)) {
        native.removeSource(DEM_SOURCE);
      }
      if (native.getSource(HILLSHADE_SOURCE)) {
        native.removeSource(HILLSHADE_SOURCE);
      }
      native.easeTo({ pitch: 0, duration: 600 });
    };

    if (native.isStyleLoaded()) {
      apply();
    } else {
      native.once("load", apply);
    }

    return () => {
      cancelled = true;
      native.off("load", apply);
    };
  }, [map, enabled, exaggeration]);

  return null;
}
