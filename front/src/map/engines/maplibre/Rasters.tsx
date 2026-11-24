import { Layer, Source } from "@vis.gl/react-maplibre";
import type { RasterLayerSpecification } from "maplibre-gl";
import type { MapRasterSpec, WmsSpec } from "@/map/core/types";

const RASTER_PAINT: RasterLayerSpecification["paint"] = {
  "raster-opacity": 1,
};

function wmsTileUrl(wms: WmsSpec): string {
  const params = new URLSearchParams({
    service: "WMS",
    request: "GetMap",
    version: wms.version ?? "1.1.1",
    layers: wms.layers,
    styles: "",
    format: wms.format ?? "image/png",
    transparent: String(wms.transparent ?? true),
    srs: "EPSG:3857",
    width: "256",
    height: "256",
  });
  const time = wms.time ? `&time=${encodeURIComponent(wms.time)}` : "";
  return `${wms.url}?${params.toString()}&bbox={bbox-epsg-3857}${time}`;
}

export function MaplibreRaster({ spec }: { spec: MapRasterSpec }) {
  const sourceId = `raster-${spec.id}`;
  const tiles = spec.wms ? [wmsTileUrl(spec.wms)] : (spec.tiles ?? []);

  return (
    <Source
      id={sourceId}
      type="raster"
      tiles={tiles}
      tileSize={spec.tileSize ?? 256}
      scheme={spec.wms ? "xyz" : spec.scheme}
      minzoom={spec.minZoom}
      maxzoom={spec.maxZoom}
      attribution={spec.attribution}
    >
      <Layer
        id={sourceId}
        type="raster"
        paint={{ ...RASTER_PAINT, "raster-opacity": spec.opacity ?? 1 }}
      />
    </Source>
  );
}
