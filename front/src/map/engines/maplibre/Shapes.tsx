import { Layer, Popup, Source } from "@vis.gl/react-maplibre";
import type { LineLayerSpecification } from "maplibre-gl";
import type { MapPolygonSpec, MapPolylineSpec } from "@/map/core/types";

function parseDashArray(value: string): number[] {
  return value
    .split(/[\s,]+/)
    .map((part) => Number(part))
    .filter((part) => Number.isFinite(part));
}

function linePaint(style: MapPolylineSpec["style"]): LineLayerSpecification["paint"] {
  return {
    "line-color": style.color ?? "#0077ff",
    "line-width": style.weight ?? 4,
    "line-opacity": style.opacity ?? 1,
    ...(style.dashArray ? { "line-dasharray": parseDashArray(style.dashArray) } : {}),
  };
}

export function MaplibrePolygon({ spec }: { spec: MapPolygonSpec }) {
  const sourceId = `polygon-${spec.id}`;
  const hasFill = (spec.style.fillOpacity ?? 0) > 0;
  const hasStroke = (spec.style.weight ?? 0) > 0;

  return (
    <Source
      id={sourceId}
      type="geojson"
      data={{ type: "Feature", properties: {}, geometry: spec.geometry }}
    >
      {hasFill && (
        <Layer
          id={`${sourceId}-fill`}
          type="fill"
          paint={{
            "fill-color": spec.style.fillColor ?? "#000000",
            "fill-opacity": spec.style.fillOpacity ?? 0.5,
          }}
        />
      )}
      {hasStroke && (
        <Layer
          id={`${sourceId}-line`}
          type="line"
          paint={linePaint({
            color: spec.style.color,
            weight: spec.style.weight,
            opacity: spec.style.opacity,
            dashArray: spec.style.dashArray,
          })}
        />
      )}
    </Source>
  );
}

export function MaplibrePolyline({ spec }: { spec: MapPolylineSpec }) {
  const sourceId = `polyline-${spec.id}`;
  const midpoint =
    spec.coordinates.length > 0 ? spec.coordinates[Math.floor(spec.coordinates.length / 2)] : null;

  return (
    <>
      <Source
        id={sourceId}
        type="geojson"
        data={{
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: spec.coordinates },
        }}
      >
        <Layer
          id={sourceId}
          type="line"
          layout={{ "line-cap": "round", "line-join": "round" }}
          paint={linePaint(spec.style)}
        />
      </Source>
      {spec.label && midpoint && (
        <Popup
          longitude={midpoint[0]}
          latitude={midpoint[1]}
          anchor="bottom"
          offset={10}
          closeButton={false}
          closeOnClick={false}
        >
          <span className="text-[0.75rem] font-semibold whitespace-nowrap">{spec.label.text}</span>
        </Popup>
      )}
    </>
  );
}
