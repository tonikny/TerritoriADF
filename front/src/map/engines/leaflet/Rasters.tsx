import type { FC } from "react";
import { TileLayer, WMSTileLayer } from "react-leaflet";
import type { WMSTileLayerProps } from "react-leaflet";
import type { MapRasterSpec } from "../../core/types";

/** react-leaflet encara no tipa el paràmetre `time` de WMS. */
const WmsTileLayer = WMSTileLayer as FC<WMSTileLayerProps & { time?: string }>;

export function LeafletRaster({ spec }: { spec: MapRasterSpec }) {
  if (spec.wms) {
    return (
      <WmsTileLayer
        url={spec.wms.url}
        layers={spec.wms.layers}
        format={spec.wms.format ?? "image/png"}
        version={spec.wms.version ?? "1.1.1"}
        transparent={spec.wms.transparent ?? true}
        time={spec.wms.time}
        opacity={spec.opacity ?? 1}
        attribution={spec.attribution}
        maxZoom={spec.maxZoom}
      />
    );
  }

  return (
    <TileLayer
      url={spec.tiles?.[0] ?? ""}
      opacity={spec.opacity ?? 1}
      minZoom={spec.minZoom}
      maxZoom={spec.maxZoom ?? 19}
      maxNativeZoom={spec.maxZoom ?? 19}
      tms={spec.scheme === "tms"}
      attribution={spec.attribution}
      tileSize={spec.tileSize ?? 256}
    />
  );
}
