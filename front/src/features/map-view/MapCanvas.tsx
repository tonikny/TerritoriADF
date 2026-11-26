import type { ComponentProps } from "react";

import { MapUIOverlays } from "./MapUIOverlays";
import type { useMapEngine } from "./useMapEngine";
import type { useMapFocus } from "./useMapFocus";
import type { useMapLayers } from "./useMapLayers";
import { MapSurface } from "@/map/MapSurface";
import type { LatLon, MapMarkerSpec, MapPolygonSpec, MapPolylineSpec } from "@/map/core/types";
import { TERRAIN_ATTRIBUTION, uniqueAttributions } from "@/map/shared/attribution";
import { LayersPanel } from "@/map/ui/LayersPanel";
import { Glyph } from "@/shared/ui/Glyphs";

type EngineState = ReturnType<typeof useMapEngine>;
type FocusState = ReturnType<typeof useMapFocus>;
type LayersState = ReturnType<typeof useMapLayers>;

/**
 * El mapa i els seus controls. És presentacional: tot l'estat i els
 * esdeveniments arriben de `MapPanel` a través dels hooks.
 */
export function MapCanvas({
  engine,
  focus,
  layers,
  tracking,
  onToggleTracking,
  markers,
  polygons,
  polylines,
  loadingHidrants,
  hidrantsError,
  hidrantsEmpty,
  canSyncFromOsm,
  canTrack,
  onMapClick,
  onCreate,
  onDismissEmpty,
}: {
  engine: EngineState;
  focus: FocusState;
  layers: LayersState;
  tracking: boolean;
  onToggleTracking: () => void;
  markers: MapMarkerSpec[];
  polygons: MapPolygonSpec[];
  polylines: MapPolylineSpec[];
  loadingHidrants: boolean;
  hidrantsError: ComponentProps<typeof MapUIOverlays>["hidrantsError"];
  hidrantsEmpty: boolean;
  canSyncFromOsm: boolean;
  canTrack: boolean;
  onMapClick: () => void;
  onCreate: (position: LatLon) => void;
  onDismissEmpty: () => void;
}) {
  const terrainEnabled = layers.terrain3d && engine.capabilities.terrain;
  const attributionLines =
    engine.engine === "maplibre"
      ? uniqueAttributions([
          layers.baseRaster.attribution,
          ...layers.overlayRasters.map((raster) => raster.attribution),
          terrainEnabled ? TERRAIN_ATTRIBUTION : null,
        ])
      : undefined;
  const view = focus.view ?? focus.initialView;

  return (
    <>
      <MapSurface
        engine={engine.engine}
        initialView={focus.initialView}
        baseRaster={layers.baseRaster}
        overlayRasters={layers.overlayRasters}
        polygons={polygons}
        polylines={polylines}
        markers={markers}
        focus={focus.focus}
        terrain={terrainEnabled}
        terrainExaggeration={layers.terrainX2 ? 2 : 1}
        onMapClick={onMapClick}
        onMapContextMenu={onCreate}
        onMapLongPress={onCreate}
        onViewChange={focus.handleViewChange}
        onFatalError={engine.handleFatalError}
      />
      <MapUIOverlays
        layers={
          <LayersPanel
            buttonIcon={<Glyph name="layers" size={20} strokeWidth={2.1} />}
            baseLayerId={layers.baseLayer}
            onBaseLayerChange={layers.setBaseLayer}
            technicalLayers={layers.technicalLayerList}
            activeTechnicalLayer={layers.activeTechnicalLayer}
            onTechnicalLayerChange={layers.setActiveTechnicalLayer}
            hidrantsVisible={layers.hidrantsVisible}
            onHidrantsVisibleChange={layers.setHidrantsVisible}
            incidenciesVisible={layers.incidenciesVisible}
            onIncidenciesVisibleChange={layers.setIncidenciesVisible}
            trackingVisible={layers.trackingVisible}
            onTrackingVisibleChange={layers.setTrackingVisible}
            canTrack={canTrack}
            terrainEnabled={layers.terrain3d}
            onTerrainEnabledChange={layers.setTerrain3d}
            terrainX2={layers.terrainX2}
            onTerrainX2Change={layers.setTerrainX2}
            canTerrain={engine.capabilities.terrain}
          />
        }
        center={view.center}
        zoom={view.zoom}
        tracking={tracking}
        onToggleTracking={onToggleTracking}
        loadingHidrants={loadingHidrants}
        hidrantsError={hidrantsError}
        hidrantsEmpty={hidrantsEmpty}
        canSyncFromOsm={canSyncFromOsm}
        onDismissEmptyHidrants={onDismissEmpty}
        attributionLines={attributionLines}
      />
    </>
  );
}
