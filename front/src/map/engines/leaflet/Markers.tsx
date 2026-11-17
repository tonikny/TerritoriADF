import type L from "leaflet";
import { Circle, Marker, Popup } from "react-leaflet";
import type { MapMarkerSpec } from "../../core/types";
import { ringIcon, toLeafletIcon } from "./icons";

export function LeafletMarker({ spec }: { spec: MapMarkerSpec }) {
  const position: [number, number] = [spec.position.lat, spec.position.lon];

  return (
    <>
      {spec.circle && (
        <Circle
          center={position}
          radius={spec.circle.radiusMeters}
          interactive={false}
          pathOptions={{
            color: spec.circle.color,
            weight: spec.circle.weight ?? 1,
            fillColor: spec.circle.color,
            fillOpacity: spec.circle.fillOpacity ?? 0.08,
          }}
        />
      )}
      {spec.selected && spec.ringClassName && (
        <Marker position={position} icon={ringIcon(spec.ringClassName)} interactive={false} />
      )}
      <Marker
        position={position}
        icon={toLeafletIcon(spec.icon)}
        draggable={Boolean(spec.draggable)}
        interactive={spec.interactive !== false}
        zIndexOffset={spec.zIndex ?? 0}
        eventHandlers={{
          click: () => {
            if (spec.interactive !== false) {
              spec.onClick?.();
            }
          },
          dragend: (event) => {
            const marker = event.target as L.Marker;
            const latlng = marker.getLatLng();
            spec.onDragEnd?.({ lat: latlng.lat, lon: latlng.lng });
          },
        }}
      >
        {spec.popup ? <Popup offset={[0, 0]}>{spec.popup}</Popup> : null}
      </Marker>
    </>
  );
}
