import { useEffect, useMemo, useRef, useState } from "react";
import * as turf from "@turf/turf";
import { Layer, Marker, Popup, Source } from "@vis.gl/react-maplibre";
import type { Marker as MaplibreMarkerInstance, Popup as MaplibrePopupInstance } from "maplibre-gl";
import type { MapMarkerSpec, MarkerIcon } from "../../core/types";

function MarkerContent({ icon }: { icon: MarkerIcon }) {
  if (icon.kind === "image") {
    return (
      <span
        style={{
          position: "relative",
          display: "block",
          width: icon.size[0],
          height: icon.size[1],
        }}
      >
        {icon.shadowUrl && (
          <img
            src={icon.shadowUrl}
            alt=""
            draggable={false}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: icon.shadowSize?.[0] ?? 41,
              height: icon.shadowSize?.[1] ?? 41,
              pointerEvents: "none",
            }}
          />
        )}
        <img
          src={icon.url}
          alt=""
          draggable={false}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: icon.size[0],
            height: icon.size[1],
            pointerEvents: "none",
          }}
        />
      </span>
    );
  }

  return (
    <div
      className={icon.className ?? ""}
      style={{ width: icon.size[0], height: icon.size[1], pointerEvents: "none" }}
      dangerouslySetInnerHTML={{ __html: icon.html }}
    />
  );
}

function CircleShape({ spec }: { spec: MapMarkerSpec }) {
  const circle = spec.circle;
  const polygon = useMemo(() => {
    if (!circle) {
      return null;
    }
    return turf.circle([spec.position.lon, spec.position.lat], circle.radiusMeters / 1000, {
      steps: 48,
      units: "kilometers",
    });
  }, [circle, spec.position.lat, spec.position.lon]);

  if (!circle || !polygon) {
    return null;
  }

  const sourceId = `circle-${spec.id}`;
  return (
    <Source id={sourceId} type="geojson" data={polygon}>
      <Layer
        id={`${sourceId}-fill`}
        type="fill"
        paint={{
          "fill-color": circle.color,
          "fill-opacity": circle.fillOpacity ?? 0.08,
        }}
      />
      <Layer
        id={`${sourceId}-line`}
        type="line"
        paint={{ "line-color": circle.color, "line-width": circle.weight ?? 1 }}
      />
    </Source>
  );
}

export function MaplibreMarker({ spec }: { spec: MapMarkerSpec }) {
  const [popupOpen, setPopupOpen] = useState(false);
  const markerRef = useRef<MaplibreMarkerInstance>(null);
  const popupRef = useRef<MaplibrePopupInstance>(null);
  const icon = spec.icon;
  // MapLibre només admet ancoratges centrats; desplacem el marcador perquè
  // qualsevol `icon.anchor` (com la punta de la cua d'OwnTracks) quedi al punt.
  const offset: [number, number] = [
    icon.size[0] / 2 - icon.anchor[0],
    icon.size[1] / 2 - icon.anchor[1],
  ];

  // Clic fora del popup (i del seu marcador) per tancar-lo. MapLibre té
  // `closeOnClick`, però el clic del mateix marcador també arriba al mapa i el
  // tancaria tot just obrir-lo.
  useEffect(() => {
    if (!popupOpen) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (popupRef.current?.getElement()?.contains(target)) {
        return;
      }
      if (markerRef.current?.getElement()?.contains(target)) {
        return;
      }
      setPopupOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [popupOpen]);

  return (
    <>
      <CircleShape spec={spec} />
      {spec.selected && spec.ringClassName && (
        <Marker
          longitude={spec.position.lon}
          latitude={spec.position.lat}
          anchor="center"
          style={{ pointerEvents: "none", zIndex: (spec.zIndex ?? 0) + 1 }}
        >
          <div
            className={spec.ringClassName}
            style={{ width: 44, height: 44, pointerEvents: "none" }}
          />
        </Marker>
      )}
      <Marker
        ref={markerRef}
        longitude={spec.position.lon}
        latitude={spec.position.lat}
        anchor="center"
        offset={offset}
        draggable={Boolean(spec.draggable)}
        style={{ zIndex: spec.zIndex }}
        onClick={() => {
          if (spec.interactive === false) {
            return;
          }
          spec.onClick?.();
          if (spec.popup) {
            setPopupOpen(true);
          }
        }}
        onDragEnd={(event) => {
          spec.onDragEnd?.({ lat: event.lngLat.lat, lon: event.lngLat.lng });
        }}
      >
        <MarkerContent icon={icon} />
      </Marker>
      {spec.popup && popupOpen && (
        <Popup
          ref={popupRef}
          longitude={spec.position.lon}
          latitude={spec.position.lat}
          anchor="bottom"
          offset={icon.popupAnchor ?? [0, -(icon.size[1] + 2)]}
          closeButton
          closeOnClick={false}
          onClose={() => setPopupOpen(false)}
        >
          {spec.popup}
        </Popup>
      )}
    </>
  );
}
