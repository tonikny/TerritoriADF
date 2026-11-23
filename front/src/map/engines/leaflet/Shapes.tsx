import { GeoJSON, Polyline, Tooltip } from "react-leaflet";
import type { Feature, MultiPolygon, Polygon } from "geojson";
import type { MapPolygonSpec, MapPolylineSpec } from "@/map/core/types";

export function LeafletPolygon({ spec }: { spec: MapPolygonSpec }) {
  const data: Feature<Polygon | MultiPolygon> = {
    type: "Feature",
    properties: {},
    geometry: spec.geometry,
  };

  return (
    <GeoJSON
      key={spec.id}
      data={data}
      style={{
        fillColor: spec.style.fillColor ?? "transparent",
        fillOpacity: spec.style.fillOpacity ?? 0,
        color: spec.style.color ?? "none",
        weight: spec.style.weight ?? 0,
        opacity: spec.style.opacity ?? 1,
        dashArray: spec.style.dashArray,
      }}
    />
  );
}

export function LeafletPolyline({ spec }: { spec: MapPolylineSpec }) {
  return (
    <Polyline
      key={spec.id}
      positions={spec.coordinates.map(([lon, lat]) => [lat, lon])}
      pathOptions={{
        color: spec.style.color ?? "#0077ff",
        weight: spec.style.weight ?? 4,
        opacity: spec.style.opacity ?? 1,
        dashArray: spec.style.dashArray,
      }}
    >
      {spec.label && (
        <Tooltip permanent direction="top" offset={[0, -10]}>
          {spec.label.text}
        </Tooltip>
      )}
    </Polyline>
  );
}
