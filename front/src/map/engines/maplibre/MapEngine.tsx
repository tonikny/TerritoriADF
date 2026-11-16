import { useEffect } from "react";
import Map, { NavigationControl, useMap } from "@vis.gl/react-maplibre";
import * as maplibregl from "maplibre-gl";
import type { MapMouseEvent, StyleSpecification } from "maplibre-gl";
import type { MapEngineProps, MapFocus, ViewState } from "../../core/types";
import { toEngineZoom, toNeutralZoom } from "../../core/zoom";
import { attachLongPress, isRecentLongPress } from "../../shared/longPress";
import { MaplibreMarker } from "./Markers";
import { MaplibreRaster } from "./Rasters";
import { MaplibrePolygon, MaplibrePolyline } from "./Shapes";
import { HILLSHADE_LAYER, MaplibreTerrain } from "./Terrain";
import "./setup";

const EMPTY_STYLE: StyleSpecification = {
  version: 8,
  sources: {},
  layers: [
    {
      id: "background",
      type: "background",
      paint: { "background-color": "#e9e5df" },
    },
  ],
};

function useFocus(map: ReturnType<typeof useMap>["current"], focus?: MapFocus | null): void {
  useEffect(() => {
    const native = map?.getMap();
    if (!native || !focus) {
      return;
    }

    const apply = () => {
      if (focus.kind === "bounds") {
        native.fitBounds(
          [
            [focus.bounds.west, focus.bounds.south],
            [focus.bounds.east, focus.bounds.north],
          ],
          { padding: focus.padding ?? 20, animate: false },
        );
        return;
      }

      const zoom = focus.keepZoom
        ? native.getZoom()
        : focus.zoom !== undefined
          ? toEngineZoom(focus.zoom)
          : native.getZoom();

      native.flyTo({
        center: [focus.position.lon, focus.position.lat],
        zoom,
        offset: focus.insetBottom ? [0, -Math.round(focus.insetBottom / 2)] : [0, 0],
        animate: true,
        duration: 1.2,
      });
    };

    // La càmera no depèn de l'estil. Si esperéssim `isStyleLoaded()`, un focus
    // que arriba amb tessel·les encara pendents (per exemple en activar el GPS)
    // quedava registrat a `load`, que ja no es torna a disparar, i l'ordre es
    // perdia. S'aplica de seguida i es repeteix si el mapa encara no ha carregat.
    apply();
    if (!native.loaded()) {
      native.once("load", apply);
    }

    return () => {
      native.off("load", apply);
    };
  }, [map, focus]);
}

function useViewReporter(
  map: ReturnType<typeof useMap>["current"],
  onViewChange?: (view: ViewState) => void,
): void {
  useEffect(() => {
    const native = map?.getMap();
    if (!native || !onViewChange) {
      return;
    }
    const report = () => {
      const center = native.getCenter();
      onViewChange({
        center: { lat: center.lat, lon: center.lng },
        zoom: toNeutralZoom(native.getZoom()),
        pitch: native.getPitch(),
        bearing: native.getBearing(),
      });
    };
    native.on("moveend", report);
    // El primer `moveend` pot haver passat abans de muntar aquest efecte
    // (per exemple, el `fitBounds` inicial): sembrem la vista actual.
    const frame = requestAnimationFrame(report);

    return () => {
      cancelAnimationFrame(frame);
      native.off("moveend", report);
    };
  }, [map, onViewChange]);
}

/** Fora del mode 3D el mapa només pot rotar: sense pitch ni controls de perspectiva. */
function usePitchLock(
  map: ReturnType<typeof useMap>["current"],
  terrain: boolean | undefined,
): void {
  useEffect(() => {
    const native = map?.getMap();
    if (!native) {
      return;
    }
    native.setMaxPitch(terrain ? 85 : 0);
    if (!terrain && native.getPitch() !== 0) {
      native.setPitch(0);
    }
  }, [map, terrain]);
}

/**
 * React-maplibre munta cada capa nova al capdamunt. En canviar el mapa base,
 * la raster nova tapava el mask de l'ADF; també podia quedar-hi per sobre el
 * hillshade. Fixem l'ordre: ràsters, relleu i, al final, vectors de l'aplicació.
 */
function useLayerOrder(map: ReturnType<typeof useMap>["current"], props: MapEngineProps): void {
  const { baseRaster, overlayRasters, polygons, polylines, terrain } = props;

  useEffect(() => {
    const native = map?.getMap();
    if (!native) {
      return;
    }

    const rasterLayers = [
      ...(baseRaster ? [`raster-${baseRaster.id}`] : []),
      ...overlayRasters.map((spec) => `raster-${spec.id}`),
    ];
    const ids = [
      ...rasterLayers,
      HILLSHADE_LAYER,
      ...polygons.flatMap((spec) => [`polygon-${spec.id}-fill`, `polygon-${spec.id}-line`]),
      ...polylines.map((spec) => `polyline-${spec.id}`),
    ];

    let adjusting = false;
    const reorder = () => {
      if (adjusting || !native.isStyleLoaded()) {
        return;
      }
      const current = native.getStyle()?.layers?.map((layer) => layer.id) ?? [];
      const present = ids.filter((id) => current.includes(id));
      const positions = present.map((id) => current.indexOf(id));
      if (positions.every((position, index) => index === 0 || position > positions[index - 1])) {
        return;
      }

      adjusting = true;
      for (const id of present) {
        if (native.getLayer(id)) {
          native.moveLayer(id);
        }
      }
      adjusting = false;
    };

    // `styledata` no sempre arriba després de muntar una capa; `idle` i el
    // primer frame cobreixen la càrrega inicial i els canvis de raster.
    const frame = requestAnimationFrame(reorder);
    native.on("styledata", reorder);
    native.on("idle", reorder);
    return () => {
      cancelAnimationFrame(frame);
      native.off("styledata", reorder);
      native.off("idle", reorder);
    };
  }, [map, baseRaster, overlayRasters, polygons, polylines, terrain]);
}

function useMapEvents(map: ReturnType<typeof useMap>["current"], props: MapEngineProps): void {
  const { onMapClick, onMapContextMenu, onMapLongPress } = props;

  useEffect(() => {
    const native = map?.getMap();
    if (!native) {
      return;
    }

    const comesFromMarker = (event: MapMouseEvent): boolean => {
      const target = event.originalEvent?.target;
      return target instanceof Element && target.closest(".maplibregl-marker") !== null;
    };

    const handleClick = (event: MapMouseEvent) => {
      // Els marcadors són DOM dins del contenidor del mapa: el clic també
      // arriba aquí i trencaria la selecció que acaba de fer el marcador.
      if (comesFromMarker(event)) {
        return;
      }
      onMapClick?.({ lat: event.lngLat.lat, lon: event.lngLat.lng });
    };
    const handleContextMenu = (event: MapMouseEvent) => {
      event.originalEvent?.preventDefault();
      if (isRecentLongPress() || comesFromMarker(event)) {
        return;
      }
      onMapContextMenu?.({ lat: event.lngLat.lat, lon: event.lngLat.lng });
    };

    native.on("click", handleClick);
    native.on("contextmenu", handleContextMenu);

    const detachLongPress = attachLongPress(native.getCanvasContainer(), (clientX, clientY) => {
      const target = native.getCanvasContainer().ownerDocument.elementFromPoint(clientX, clientY);
      if (target?.closest(".maplibregl-marker")) {
        return;
      }
      const lngLat = native.unproject([clientX, clientY]);
      onMapLongPress?.({ lat: lngLat.lat, lon: lngLat.lng });
    });

    return () => {
      native.off("click", handleClick);
      native.off("contextmenu", handleContextMenu);
      detachLongPress();
    };
  }, [map, onMapClick, onMapContextMenu, onMapLongPress]);
}

function MaplibreRuntime(props: MapEngineProps) {
  const { current: map } = useMap();

  useFocus(map, props.focus);
  useViewReporter(map, props.onViewChange);
  usePitchLock(map, props.terrain);
  useMapEvents(map, props);
  useLayerOrder(map, props);

  return (
    <>
      {props.baseRaster && <MaplibreRaster key={props.baseRaster.id} spec={props.baseRaster} />}
      {props.overlayRasters.map((spec) => (
        <MaplibreRaster key={spec.id} spec={spec} />
      ))}
      {props.polygons.map((spec) => (
        <MaplibrePolygon key={spec.id} spec={spec} />
      ))}
      {props.polylines.map((spec) => (
        <MaplibrePolyline key={spec.id} spec={spec} />
      ))}
      {props.markers.map((spec) => (
        <MaplibreMarker key={spec.id} spec={spec} />
      ))}
      <MaplibreTerrain
        enabled={Boolean(props.terrain)}
        exaggeration={props.terrainExaggeration ?? 1}
      />
    </>
  );
}

export default function MaplibreMapEngine(props: MapEngineProps) {
  const handleError = (event: { error?: Error }) => {
    const message = event.error?.message ?? "";
    if (/webgl|gpu|context/i.test(message)) {
      props.onFatalError?.(event.error);
    }
  };

  return (
    <Map
      mapLib={maplibregl}
      initialViewState={{
        longitude: props.initialView.center.lon,
        latitude: props.initialView.center.lat,
        zoom: toEngineZoom(props.initialView.zoom),
        pitch: props.initialView.pitch ?? 0,
        bearing: props.initialView.bearing ?? 0,
      }}
      mapStyle={EMPTY_STYLE}
      style={{ width: "100%", height: "100%" }}
      maxPitch={props.terrain ? 85 : 0}
      attributionControl={false}
      onError={handleError}
    >
      <NavigationControl position="top-left" visualizePitch />
      <MaplibreRuntime {...props} />
    </Map>
  );
}
