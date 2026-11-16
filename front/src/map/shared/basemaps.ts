import type { MapRasterSpec } from "../core/types";

export type Basemap = {
  /** L'id és el nom històric desat a localStorage: no canviar-lo. */
  id: string;
  label: string;
  raster: MapRasterSpec;
};

export const BASEMAPS: Basemap[] = [
  {
    id: "OpenStreetMap",
    label: "OpenStreetMap",
    raster: {
      id: "osm",
      tiles: ["/tiles/osm/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxZoom: 18,
      attribution: "© OpenStreetMap contributors",
    },
  },
  {
    id: "OpenTopoMap",
    label: "OpenTopoMap",
    raster: {
      id: "opentopo",
      tiles: ["/tiles/opentopo/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxZoom: 17,
      attribution: "© OpenStreetMap contributors",
    },
  },
  {
    id: "Raster IGN",
    label: "Raster IGN",
    raster: {
      id: "ign-raster",
      tiles: ["/tiles/ign-raster/{z}/{x}/{y}.jpeg"],
      scheme: "tms",
      tileSize: 256,
      maxZoom: 17,
      attribution: "© IGN",
    },
  },
  {
    id: "Ortoimagen IGN",
    label: "Ortoimagen IGN",
    raster: {
      id: "ign-orto",
      tiles: ["/tiles/ign-orto/{z}/{x}/{y}.jpeg"],
      scheme: "tms",
      tileSize: 256,
      maxZoom: 18,
      attribution: "© IGN",
    },
  },
];

export const DEFAULT_BASEMAP_ID = BASEMAPS[0].id;

export function getBasemap(id: string): Basemap {
  return BASEMAPS.find((basemap) => basemap.id === id) ?? BASEMAPS[0];
}
