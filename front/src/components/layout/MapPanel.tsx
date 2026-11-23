import { useCallback, useMemo, useRef, useState } from "react";
import { can } from "@territoriadf/contracts/permissions";
import type { Position } from "@territoriadf/contracts/tracking";

import { MapCanvas } from "@/components/layout/MapCanvas";
import { Panel, type BottomSheetHandle } from "@/components/layout/Panel";
import { TrackingPopup } from "@/features/tracking/TrackingPopup";
import { buildNodeSheet } from "@/components/layout/buildNodeSheet";
import { buildTabs } from "@/components/panel/PanelTabs";
import { useAdf } from "@/contexts/AdfContext";
import { useAppConfig } from "@/contexts/AppConfigContext";
import { useAuth } from "@/contexts/AuthContext";
import { useMapDeepLinks } from "@/hooks/map/useMapDeepLinks";
import { useMapEngine } from "@/hooks/map/useMapEngine";
import { useMapFocus } from "@/hooks/map/useMapFocus";
import { useMapLayers } from "@/hooks/map/useMapLayers";
import { useMapMarkers } from "@/hooks/map/useMapMarkers";
import { useMapRoute } from "@/hooks/map/useMapRoute";
import { useMapSheet } from "@/hooks/map/useMapSheet";
import { useMapTracking } from "@/features/tracking/useMapTracking";
import { useHidrantData } from "@/hooks/useHidrantData";
import { useIncidencies } from "@/features/incidencies/useIncidencies";
import { boundaryPolygons, routePolylines } from "@/map/core/builders";
import { fromLngLat } from "@/map/core/geometry";
import { isRecentLongPress } from "@/map/shared/longPress";
import { useMaskedArea } from "@/map/shared/useMaskedArea";
import { getQueryParam } from "@/utils/urlParams";

export function MapPanel() {
  const { isLoading } = useAdf();

  if (isLoading) {
    return <div className="flex justify-center items-center h-screen">Carregant...</div>;
  }

  return <MapPanelView />;
}

/**
 * Composició del mapa. El comportament viu als hooks (`hooks/map`), les
 * especificacions als builders (`map/core`) i la pintura a `MapCanvas`; aquí
 * només es connecten les dades amb els panells.
 */
function MapPanelView() {
  const { activeAdf, boundaryGeojson } = useAdf();
  const { user } = useAuth();

  const deepLinkNodeId = useMemo(() => getQueryParam("node"), []);
  const deepLinkIncidenciaId = useMemo(() => getQueryParam("incidencia"), []);
  const hasDeepLink = deepLinkNodeId !== null || deepLinkIncidenciaId !== null;

  const focus = useMapFocus({ adf: activeAdf, hasDeepLink });
  const engine = useMapEngine({
    view: focus.view,
    requestFocus: focus.requestFocus,
    clearFocus: focus.clearFocus,
  });
  const layers = useMapLayers();
  const tracking = useMapTracking({
    enabled: !!user,
    trackingVisible: layers.trackingVisible,
    requestFocus: focus.requestFocus,
  });

  const { maxHidrantMoveMeters } = useAppConfig();
  const {
    features,
    loading: loadingHidrants,
    loaded: hidrantsLoaded,
    error: hidrantsError,
  } = useHidrantData();
  const { features: incidenciaFeatures } = useIncidencies();

  const sheet = useMapSheet({
    features,
    user,
    activeAdf,
    boundaryGeojson,
    onFocus: focus.centerOn,
    requestFocus: focus.requestFocus,
  });

  useMapDeepLinks({
    nodeId: deepLinkNodeId,
    incidenciaId: deepLinkIncidenciaId,
    features,
    incidenciaFeatures,
    selectNode: sheet.selectNode,
    selectIncidencia: sheet.selectIncidencia,
  });

  const [showRoute, setShowRoute] = useState(false);
  // Avís d'ADF sense hidrants: es tanca per ADF i no torna a sortir fins a canviar-ne.
  const [emptyNoticeDismissedFor, setEmptyNoticeDismissedFor] = useState<number | null>(null);
  const sheetRef = useRef<BottomSheetHandle>(null);

  const routeTargetFeature = sheet.selectedNode ?? sheet.selectedIncidencia;
  const routeTarget = routeTargetFeature
    ? fromLngLat(
        routeTargetFeature.geometry.coordinates[0],
        routeTargetFeature.geometry.coordinates[1],
      )
    : null;

  const route = useMapRoute({
    enabled: !!user && showRoute && tracking.position !== null && routeTarget !== null,
    from: tracking.position,
    to: routeTarget,
    requestFocus: focus.requestFocus,
  });

  const masked = useMaskedArea(boundaryGeojson);

  // Estable perquè la memo dels marcadors només es refaci quan canvia el que es pinta.
  const renderTrackingPopup = useCallback(
    (username: string, position: Position) => (
      <TrackingPopup username={username} position={position} />
    ),
    [],
  );

  const markers = useMapMarkers({
    features,
    incidenciaFeatures,
    positions: tracking.positions,
    ownPosition: tracking.position,
    accuracy: tracking.accuracy,
    maxMoveMeters: maxHidrantMoveMeters,
    selectedNodeId: sheet.selectedNode?.id ?? null,
    selectedIncidenciaId: sheet.selectedIncidencia?.id ?? null,
    editing: sheet.editing,
    draftPosition: sheet.draftPosition,
    creationPosition: sheet.creation.position,
    showHidrants: layers.hidrantsVisible,
    showIncidencies: layers.incidenciesVisible,
    showTracking: !!user && layers.trackingVisible,
    canCreate: !!user,
    onSelectNode: sheet.selectNode,
    onSelectIncidencia: sheet.selectIncidencia,
    onDragNode: sheet.setDraftPosition,
    onOpenCreate: sheet.creation.open,
    renderTrackingPopup,
  });

  const polygons = useMemo(
    () =>
      boundaryPolygons(masked, {
        adfId: activeAdf?.id ?? null,
        technicalLayerActive: layers.activeTechnicalLayer !== null,
      }),
    [masked, activeAdf?.id, layers.activeTechnicalLayer],
  );
  const polylines = useMemo(() => routePolylines(route), [route]);

  const handleMapClick = useCallback(() => {
    if (isRecentLongPress()) {
      return;
    }
    sheetRef.current?.close();
  }, []);

  const canEdit = !!user && (user.role === "admin" || user.adf_id === activeAdf?.id);

  return (
    <Panel
      sheetRef={sheetRef}
      map={
        <MapCanvas
          engine={engine}
          focus={focus}
          layers={layers}
          tracking={tracking}
          markers={markers}
          polygons={polygons}
          polylines={polylines}
          loadingHidrants={loadingHidrants}
          hidrantsError={hidrantsError}
          hidrantsEmpty={
            layers.hidrantsVisible &&
            hidrantsLoaded &&
            features.length === 0 &&
            emptyNoticeDismissedFor !== (activeAdf?.id ?? null)
          }
          canSyncFromOsm={can(user?.permissions, "sync_osm")}
          canTrack={!!user}
          onMapClick={handleMapClick}
          onCreate={sheet.creation.open}
          onDismissEmpty={() => setEmptyNoticeDismissedFor(activeAdf?.id ?? null)}
        />
      }
      tabs={buildTabs({
        features,
        incidenciaFeatures,
        positions: tracking.positions,
        onSelectNode: sheet.selectNode,
        onSelectIncidencia: sheet.selectIncidencia,
        onSelectHidrantById: sheet.selectNodeById,
        onCenterCoordinates: focus.centerOnCoordinates,
        engine: engine.engine,
        enginePreference: engine.preference,
        onEngineChange: engine.changeEngine,
      })}
      node={buildNodeSheet({
        sheet,
        canEdit,
        hasUser: !!user,
        hasLocation: !!tracking.position,
        showRoute,
        setShowRoute,
      })}
    />
  );
}
