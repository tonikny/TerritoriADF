import { useEffect } from "react";
import L from "leaflet";
import type { Map as LeafletMap } from "leaflet";
import { MapContainer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./leaflet.css";
import type { MapEngineProps, MapFocus, ViewState } from "@/map/core/types";
import { useLeafletEvents } from "./Events";
import { LeafletMarker } from "./Markers";
import { LeafletRaster } from "./Rasters";
import { LeafletPolygon, LeafletPolyline } from "./Shapes";

function useLeafletResize(map: LeafletMap): void {
  useEffect(() => {
    const container = map.getContainer();
    const observer = new ResizeObserver(() => {
      map.invalidateSize();
    });
    observer.observe(container);
    const timer = window.setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      window.clearTimeout(timer);
      observer.disconnect();
    };
  }, [map]);
}

function useLeafletViewReporter(map: LeafletMap, onViewChange?: (view: ViewState) => void): void {
  useEffect(() => {
    if (!onViewChange) {
      return;
    }
    const report = () => {
      const center = map.getCenter();
      onViewChange({ center: { lat: center.lat, lon: center.lng }, zoom: map.getZoom() });
    };
    map.on("moveend", report);
    map.on("zoomend", report);

    return () => {
      map.off("moveend", report);
      map.off("zoomend", report);
    };
  }, [map, onViewChange]);
}

function useLeafletFocus(map: LeafletMap, focus: MapFocus | null | undefined): void {
  useEffect(() => {
    if (!focus) {
      return;
    }
    map.whenReady(() => {
      if (!map.getContainer()) {
        return;
      }

      if (focus.kind === "bounds") {
        const { south, west, north, east } = focus.bounds;
        map.fitBounds(
          [
            [south, west],
            [north, east],
          ],
          { padding: [focus.padding ?? 20, focus.padding ?? 20], animate: false },
        );
        return;
      }

      const zoom = focus.keepZoom ? map.getZoom() : (focus.zoom ?? map.getZoom());
      if (focus.insetBottom) {
        const target = map
          .project([focus.position.lat, focus.position.lon], zoom)
          .add(L.point(0, Math.round(focus.insetBottom / 2)));
        map.flyTo(map.unproject(target, zoom), zoom, { animate: true, duration: 1.2 });
        return;
      }
      map.flyTo([focus.position.lat, focus.position.lon], zoom, {
        animate: true,
        duration: 1.2,
      });
    });
  }, [map, focus]);
}

function LeafletRuntime(props: MapEngineProps) {
  const map = useMap();

  useLeafletEvents(map, {
    onClick: props.onMapClick,
    onContextMenu: props.onMapContextMenu,
    onLongPress: props.onMapLongPress,
  });
  useLeafletResize(map);
  useLeafletViewReporter(map, props.onViewChange);
  useLeafletFocus(map, props.focus);

  return (
    <>
      {props.baseRaster && <LeafletRaster key={props.baseRaster.id} spec={props.baseRaster} />}
      {props.overlayRasters.map((spec) => (
        <LeafletRaster key={spec.id} spec={spec} />
      ))}
      {props.polygons.map((spec) => (
        <LeafletPolygon key={spec.id} spec={spec} />
      ))}
      {props.polylines.map((spec) => (
        <LeafletPolyline key={spec.id} spec={spec} />
      ))}
      {props.markers.map((spec) => (
        <LeafletMarker key={spec.id} spec={spec} />
      ))}
    </>
  );
}

export default function LeafletMapEngine(props: MapEngineProps) {
  return (
    <MapContainer
      center={[props.initialView.center.lat, props.initialView.center.lon]}
      zoom={props.initialView.zoom}
      className="map-surface"
    >
      <LeafletRuntime {...props} />
    </MapContainer>
  );
}
