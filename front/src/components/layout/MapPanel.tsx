import { useCallback, useMemo, useRef, useState } from "react";
import type { HidrantFeature } from "@territoriadf/contracts/hidrants";
import { can } from "@territoriadf/contracts/permissions";

import { MapCanvas } from "@/components/layout/MapCanvas";
import { Panel, type BottomSheetHandle } from "@/components/layout/Panel";
import { TrackingPopup } from "@/components/layout/TrackingPopup";
import { buildNodeSheet } from "@/components/layout/buildNodeSheet";
import { buildTabs } from "@/components/panel/PanelTabs";
import { useAdf } from "@/contexts/AdfContext";
import { useAuth } from "@/contexts/AuthContext";
import { useMapCreation } from "@/hooks/map/useMapCreation";
import { useMapDeepLinks } from "@/hooks/map/useMapDeepLinks";
import { useMapEngine } from "@/hooks/map/useMapEngine";
import { useMapFocus } from "@/hooks/map/useMapFocus";
import { useMapLayers } from "@/hooks/map/useMapLayers";
import { useMapMarkers } from "@/hooks/map/useMapMarkers";
import { useMapRoute } from "@/hooks/map/useMapRoute";
import { useMapSelection } from "@/hooks/map/useMapSelection";
import { useMapTracking } from "@/hooks/map/useMapTracking";
import { useAppConfig } from "@/hooks/useAppConfig";
import { useHidrantData } from "@/hooks/useHidrantData";
import { useIncidencies } from "@/hooks/useIncidencies";
import { boundaryPolygons, routePolylines } from "@/map/core/builders";
import { fromLngLat } from "@/map/core/geometry";
import type { LatLon } from "@/map/core/types";
import { isRecentLongPress } from "@/map/shared/longPress";
import { useMaskedArea } from "@/map/shared/useMaskedArea";
import type { IncidenciaFeature } from "@/types";
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
    mutate: refreshHidrants,
  } = useHidrantData();
  const { features: incidenciaFeatures, refresh: refreshIncidencies } = useIncidencies();

  const selection = useMapSelection({ features, onFocus: focus.centerOn });
  const creation = useMapCreation({
    user,
    activeAdf,
    boundaryGeojson,
    requestFocus: focus.requestFocus,
    onStart: selection.clearSelection,
  });

  // Seleccionar una altra cosa tanca la creació: el panell només en mostra una.
  const closeCreation = creation.close;
  const { selectNode, selectIncidencia, selectNodeById } = selection;
  const select = useMemo(
    () => ({
      node: (feature: HidrantFeature) => {
        closeCreation();
        selectNode(feature);
      },
      incidencia: (feature: IncidenciaFeature) => {
        closeCreation();
        selectIncidencia(feature);
      },
      nodeById: (id: string) => {
        closeCreation();
        selectNodeById(id);
      },
    }),
    [closeCreation, selectIncidencia, selectNode, selectNodeById],
  );

  useMapDeepLinks({
    nodeId: deepLinkNodeId,
    incidenciaId: deepLinkIncidenciaId,
    features,
    incidenciaFeatures,
    selectNode: select.node,
    selectIncidencia: select.incidencia,
  });

  const [showRoute, setShowRoute] = useState(false);
  const [nodeInfoKey, setNodeInfoKey] = useState(0);
  // Avís d'ADF sense hidrants: es tanca per ADF i no torna a sortir fins a canviar-ne.
  const [emptyNoticeDismissedFor, setEmptyNoticeDismissedFor] = useState<number | null>(null);
  const sheetRef = useRef<BottomSheetHandle>(null);

  const routeTarget: LatLon | null = selection.selectedNode
    ? fromLngLat(
        selection.selectedNode.geometry.coordinates[0],
        selection.selectedNode.geometry.coordinates[1],
      )
    : selection.selectedIncidencia
      ? fromLngLat(
          selection.selectedIncidencia.geometry.coordinates[0],
          selection.selectedIncidencia.geometry.coordinates[1],
        )
      : null;

  const route = useMapRoute({
    enabled: !!user && showRoute && tracking.position !== null && routeTarget !== null,
    from: tracking.position,
    to: routeTarget,
    requestFocus: focus.requestFocus,
  });

  const masked = useMaskedArea(boundaryGeojson);

  const markers = useMapMarkers({
    features,
    incidenciaFeatures,
    positions: tracking.positions,
    ownPosition: tracking.position,
    accuracy: tracking.accuracy,
    maxMoveMeters: maxHidrantMoveMeters,
    selectedNodeId: selection.selectedNode?.id ?? null,
    selectedIncidenciaId: selection.selectedIncidencia?.id ?? null,
    editing: selection.editing,
    draftPosition: selection.draftPosition,
    creationPosition: creation.position,
    showHidrants: layers.hidrantsVisible,
    showIncidencies: layers.incidenciesVisible,
    showTracking: !!user && layers.trackingVisible,
    canCreate: !!user,
    onSelectNode: select.node,
    onSelectIncidencia: select.incidencia,
    onDragNode: selection.setDraftPosition,
    onOpenCreate: creation.open,
    renderTrackingPopup: (username, position) => (
      <TrackingPopup username={username} position={position} />
    ),
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
          onCreate={creation.open}
          onDismissEmpty={() => setEmptyNoticeDismissedFor(activeAdf?.id ?? null)}
        />
      }
      tabs={buildTabs({
        features,
        incidenciaFeatures,
        positions: tracking.positions,
        onSelectNode: select.node,
        onSelectIncidencia: select.incidencia,
        onSelectHidrantById: select.nodeById,
        onRefreshHidrants: () => {
          void refreshHidrants().then(() => setNodeInfoKey((prev) => prev + 1));
        },
        onCenterCoordinates: focus.centerOnCoordinates,
        engine: engine.engine,
        enginePreference: engine.preference,
        onEngineChange: engine.changeEngine,
      })}
      node={buildNodeSheet({
        selection,
        creation,
        canEdit,
        hasUser: !!user,
        hasLocation: !!tracking.position,
        nodeInfoKey,
        showRoute,
        setShowRoute,
        refreshHidrants,
        refreshIncidencies,
      })}
    />
  );
}
