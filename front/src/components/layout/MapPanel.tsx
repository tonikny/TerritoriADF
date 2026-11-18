import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-toastify";
import { MapSurface } from "../../map/MapSurface";
import { ENGINE_CAPABILITIES } from "../../map/core/capabilities";
import {
  clearEngineFailure,
  markEngineFailure,
  readEnginePreference,
  resolveEngine,
  storeEnginePreference,
  type EnginePreference,
} from "../../map/core/engineSelection";
import {
  DEFAULT_VIEW,
  bboxToBounds,
  clampToMaxDistance,
  fromLngLat,
  viewForAdf,
} from "../../map/core/geometry";
import type {
  EngineId,
  GeoBounds,
  LatLon,
  MapFocus,
  MapMarkerSpec,
  MapPolygonSpec,
  MapPolylineSpec,
  ViewState,
} from "../../map/core/types";
import { DEFAULT_BASEMAP_ID, getBasemap } from "../../map/shared/basemaps";
import { TERRAIN_ATTRIBUTION, uniqueAttributions } from "../../map/shared/attribution";
import {
  CREATE_ICON,
  USER_ICON,
  ageColor,
  hydrantIcon,
  incidenciaIcon,
  trackingPin,
} from "../../map/shared/markerIcons";
import { technicalLayers } from "../../map/shared/overlays";
import { useMaskedArea } from "../../map/shared/useMaskedArea";
import { clearSavedView, useMapViewPersistence } from "../../map/shared/useMapViewPersistence";
import { useRoute } from "../../map/shared/useRoute";
import { getBottomSheetInset } from "../../map/shared/uiInset";
import { isRecentLongPress } from "../../map/shared/longPress";
import { LayersPanel } from "../../map/ui/LayersPanel";
import { useAdf, type AdfData } from "../../contexts/AdfContext";
import { useAuth } from "../../contexts/AuthContext";
import { Panel, type BottomSheetHandle } from "./Panel";
import { buildTabs } from "../panel/PanelTabs";
import { useHydrantData } from "../../hooks/useHidrantData";
import type { HidrantFeature } from "../../hooks/useHidrantData";
import { useIncidencies } from "../../hooks/useIncidencies";
import { useAppConfig } from "../../hooks/useAppConfig";
import { useGeolocationTracking } from "../../hooks/useGeolocationTracking";
import {
  POSITIONS_POLL_ACTIVE_MS,
  POSITIONS_POLL_IDLE_MS,
  TRACKING_STORAGE_KEY,
} from "../../hooks/usePositionPolling";
import { usePositions } from "../../hooks/usePositions";
import { useLocalStorage } from "../../utils/useLocalStorage";
import { storageKey } from "../../utils/storageKeys";
import { NodeInfo } from "../hidrants/NodeInfo";
import { CreateNodePanel } from "../panel/CreateNodePanel";
import { createTitle } from "../panel/createTitle";
import { IncidenciaInfo } from "../incidencies/IncidenciaInfo";
import { isPointInBoundary } from "../../utils/geo";
import { emojiPrioritatIncidencia } from "../../utils/incidenciaConstants";
import { getQueryParam, setNodeUrlParam } from "../../utils/urlParams";
import { timeAgo } from "../../utils/time";
import { MapUIOverlays } from "../controls/MapUIOverlays";
import type { CreateType, IncidenciaFeature } from "../../types";

type FocusCommand =
  | {
      kind: "point";
      position: LatLon;
      zoom?: number;
      keepZoom?: boolean;
      insetBottom?: number;
    }
  | { kind: "bounds"; bounds: GeoBounds; padding?: number };

/** Comptador de mòdul: només cal que el token sigui únic i creixent. */
let focusSequence = 0;

function focusForAdf(adf: AdfData | null): FocusCommand {
  if (adf?.bbox) {
    return { kind: "bounds", bounds: bboxToBounds(adf.bbox), padding: 0 };
  }
  if (adf?.center) {
    return { kind: "point", position: { lat: adf.center[0], lon: adf.center[1] }, zoom: 14 };
  }
  return {
    kind: "point",
    position: DEFAULT_VIEW.center,
    zoom: DEFAULT_VIEW.zoom,
  };
}

export function MapPanel() {
  const { isLoading } = useAdf();

  if (isLoading) {
    return <div className="flex justify-center items-center h-screen">Carregant...</div>;
  }

  return <MapPanelView />;
}

function MapPanelView() {
  const { activeAdf, boundaryGeojson } = useAdf();
  const { user } = useAuth();

  const [selectedNode, setSelectedNode] = useState<HidrantFeature | null>(null);
  const [selectedIncidencia, setSelectedIncidencia] = useState<IncidenciaFeature | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftPosition, setDraftPosition] = useState<LatLon | null>(null);
  const [createPos, setCreatePos] = useState<LatLon | null>(null);
  const [createForm, setCreateForm] = useState<CreateType>(null);
  const [showRoute, setShowRoute] = useState(false);
  const [nodeInfoKey, setNodeInfoKey] = useState(0);
  // Avís d'ADF sense hidrants: es tanca per ADF i no torna a sortir fins a canviar-ne.
  const [emptyNoticeDismissedFor, setEmptyNoticeDismissedFor] = useState<number | null>(null);
  const sheetRef = useRef<BottomSheetHandle>(null);

  const {
    features,
    loading: loadingHidrants,
    loaded: hidrantsLoaded,
    error: hidrantsError,
    mutate: refreshHidrants,
  } = useHydrantData();

  const { features: incidenciaFeatures, refresh: refreshIncidencies } = useIncidencies();

  const { maxHydrantMoveMeters } = useAppConfig();
  const { tracking, toggleTracking, position, accuracy } = useGeolocationTracking();

  const [trackingChecked, setTrackingChecked] = useLocalStorage<boolean>(
    TRACKING_STORAGE_KEY,
    false,
  );
  const positions = usePositions({
    enabled: !!user,
    intervalMs: trackingChecked ? POSITIONS_POLL_ACTIVE_MS : POSITIONS_POLL_IDLE_MS,
  });

  const [baseLayer, setBaseLayer] = useLocalStorage<string>(
    storageKey("base_layer"),
    DEFAULT_BASEMAP_ID,
  );
  const [activeTechnicalLayer, setActiveTechnicalLayer] = useLocalStorage<string | null>(
    storageKey("technical_layer"),
    null,
  );
  const [hydrantsVisible, setHydrantsVisible] = useLocalStorage<boolean>(
    storageKey("hydrants_visible"),
    true,
  );
  const [incidenciesVisible, setIncidenciesVisible] = useLocalStorage<boolean>(
    storageKey("incidencies_visible"),
    true,
  );
  const [terrain3d, setTerrain3d] = useLocalStorage<boolean>(storageKey("terrain_3d"), false);
  const [terrainX2, setTerrainX2] = useLocalStorage<boolean>(storageKey("terrain_x2"), false);

  const [enginePreference, setEnginePreference] = useState<EnginePreference>(() =>
    readEnginePreference(),
  );
  const [engine, setEngine] = useState<EngineId>(() => resolveEngine());
  const capabilities = ENGINE_CAPABILITIES[engine];

  const deepLinkNodeId = useMemo(() => getQueryParam("node"), []);
  const hasDeepLink = deepLinkNodeId !== null;
  const { initialView, hasSavedView, saveView } = useMapViewPersistence({
    adfId: activeAdf?.id ?? null,
    fallbackView: viewForAdf(activeAdf),
    ignoreSaved: hasDeepLink,
  });

  const [view, setView] = useState<ViewState | null>(null);
  const [focus, setFocus] = useState<MapFocus | null>(null);

  const sendFocus = useCallback((command: FocusCommand) => {
    focusSequence += 1;
    setFocus({ ...command, token: focusSequence } as MapFocus);
  }, []);

  const handleViewChange = useCallback(
    (next: ViewState) => {
      setView(next);
      saveView(next);
    },
    [saveView],
  );

  const centerOn = useCallback(
    (target: LatLon, options?: { keepZoom?: boolean }) => {
      window.setTimeout(() => {
        sendFocus({
          kind: "point",
          position: target,
          zoom: 15,
          keepZoom: options?.keepZoom ?? false,
          insetBottom: getBottomSheetInset(),
        });
      }, 400);
    },
    [sendFocus],
  );

  // Encanvi d'ADF: es descarta la vista desada i s'ajusta al nou límit.
  const adfId = activeAdf?.id ?? null;
  const bboxKey = activeAdf?.bbox ? activeAdf.bbox.join(",") : "";
  const lastAdfRef = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    if (lastAdfRef.current === undefined) {
      lastAdfRef.current = adfId;
      if (!hasSavedView && !hasDeepLink) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- la càmera del mapa és un sistema extern
        sendFocus(focusForAdf(activeAdf));
      }
      return;
    }
    if (lastAdfRef.current !== adfId) {
      lastAdfRef.current = adfId;
      clearSavedView();
      sendFocus(focusForAdf(activeAdf));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bboxKey cobreix canvis de límits
  }, [adfId, bboxKey, hasDeepLink, hasSavedView, sendFocus]);

  const handleSelectNode = useCallback(
    (feature: HidrantFeature) => {
      setNodeUrlParam(feature.id);
      setSelectedNode(feature);
      setSelectedIncidencia(null);
      setEditing(false);
      setDraftPosition(null);
      setCreatePos(null);
      setCreateForm(null);
      centerOn(fromLngLat(feature.geometry.coordinates[0], feature.geometry.coordinates[1]));
    },
    [centerOn],
  );

  const handleSelectIncidencia = useCallback(
    (feature: IncidenciaFeature) => {
      setNodeUrlParam(feature.id);
      setSelectedIncidencia(feature);
      setSelectedNode(null);
      setEditing(false);
      setDraftPosition(null);
      setCreatePos(null);
      setCreateForm(null);
      centerOn(fromLngLat(feature.geometry.coordinates[0], feature.geometry.coordinates[1]));
    },
    [centerOn],
  );

  // `?node=` s'obre un sol cop, quan les dades de l'ADF ja són disponibles.
  const deepLinkHandled = useRef<string | null>(null);
  useEffect(() => {
    if (!deepLinkNodeId || deepLinkHandled.current === deepLinkNodeId) {
      return;
    }
    const hydrant = features.find((feature) => feature.id === deepLinkNodeId);
    if (hydrant) {
      deepLinkHandled.current = deepLinkNodeId;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- selecció inicial des de la URL
      handleSelectNode(hydrant);
      return;
    }
    const incidencia = incidenciaFeatures.find((feature) => feature.id === deepLinkNodeId);
    if (incidencia) {
      deepLinkHandled.current = deepLinkNodeId;
      handleSelectIncidencia(incidencia);
    }
  }, [deepLinkNodeId, features, incidenciaFeatures, handleSelectNode, handleSelectIncidencia]);

  const handleDeselectNode = () => {
    setNodeUrlParam(null);
    setSelectedNode(null);
    setEditing(false);
    setDraftPosition(null);
  };

  const handleDeselectIncidencia = () => {
    setNodeUrlParam(null);
    setSelectedIncidencia(null);
    setEditing(false);
    setDraftPosition(null);
  };

  const handleCenterCoordinates = useCallback(
    (coords: [number, number]) => {
      sendFocus({
        kind: "point",
        position: fromLngLat(coords[0], coords[1]),
        zoom: 15,
        insetBottom: getBottomSheetInset(),
      });
    },
    [sendFocus],
  );

  const openCreate = useCallback(
    (target: LatLon) => {
      if (!user) {
        return;
      }
      // Només es pot crear a l'ADF pròpia (l'admin pot crear a qualsevol ADF).
      if (user.role !== "admin" && user.adf_id && activeAdf && activeAdf.id !== user.adf_id) {
        toast.warning("Només pots crear hidrants i incidències a la teva ADF");
        return;
      }
      if (!isPointInBoundary(target.lat, target.lon, boundaryGeojson)) {
        toast.warning("Coordenades fora del límit de l'ADF");
        return;
      }
      setNodeUrlParam(null);
      setSelectedNode(null);
      setSelectedIncidencia(null);
      setEditing(false);
      setDraftPosition(null);
      setCreatePos(target);
      setCreateForm("selection");
      window.setTimeout(() => {
        sendFocus({
          kind: "point",
          position: target,
          keepZoom: true,
          insetBottom: getBottomSheetInset(),
        });
      }, 400);
    },
    [activeAdf, boundaryGeojson, sendFocus, user],
  );

  const handleMapClick = useCallback(() => {
    if (isRecentLongPress()) {
      return;
    }
    sheetRef.current?.close();
  }, []);

  const closeCreate = () => {
    setCreatePos(null);
    setCreateForm(null);
  };

  // En sortir del mode edició es descarta la posició arrossegada però no desada.
  const toggleEditing = () => {
    if (editing) {
      setDraftPosition(null);
    }
    setEditing(!editing);
  };

  // Actualitzar selectedNode quan features canvia (després de refreshHidrants)
  /* eslint-disable react-hooks/set-state-in-effect -- actualització necessària quan canvien les dades */
  useEffect(() => {
    if (selectedNode) {
      const updatedFeature = features.find((feature) => feature.id === selectedNode.id);
      if (updatedFeature && updatedFeature !== selectedNode) {
        setSelectedNode(updatedFeature);
      }
    }
  }, [features, selectedNode]);

  const handleEngineChange = useCallback(
    (preference: EnginePreference) => {
      clearEngineFailure();
      setEnginePreference(preference);
      storeEnginePreference(preference);
      setFocus(null);
      setEngine(resolveEngine(preference));
      if (view) {
        // El nou motor es munta amb la vista inicial desada: hi tornem a centrar.
        sendFocus({ kind: "point", position: view.center, zoom: view.zoom });
      }
    },
    [sendFocus, view],
  );

  const handleEngineFatal = useCallback(() => {
    markEngineFailure();
    setFocus(null);
    setEngine("leaflet");
    if (view) {
      sendFocus({ kind: "point", position: view.center, zoom: view.zoom });
    }
  }, [sendFocus, view]);

  const routeTarget: LatLon | null = selectedNode
    ? fromLngLat(selectedNode.geometry.coordinates[0], selectedNode.geometry.coordinates[1])
    : selectedIncidencia
      ? fromLngLat(
          selectedIncidencia.geometry.coordinates[0],
          selectedIncidencia.geometry.coordinates[1],
        )
      : null;

  const route = useRoute({
    enabled: showRoute && position !== null && routeTarget !== null,
    from: position,
    to: routeTarget,
  });

  const lastRouteFit = useRef<string | null>(null);
  useEffect(() => {
    if (!route) {
      lastRouteFit.current = null;
      return;
    }
    if (lastRouteFit.current === route.destKey) {
      return;
    }
    lastRouteFit.current = route.destKey;
    sendFocus({ kind: "bounds", bounds: route.bounds, padding: 50 });
  }, [route, sendFocus]);

  const followedRef = useRef(false);
  useEffect(() => {
    if (!tracking) {
      followedRef.current = false;
      return;
    }
    if (!position || followedRef.current) {
      return;
    }
    followedRef.current = true;
    sendFocus({
      kind: "point",
      position,
      zoom: 17,
      insetBottom: getBottomSheetInset(),
    });
  }, [tracking, position, sendFocus]);

  const markers = useMemo<MapMarkerSpec[]>(() => {
    const list: MapMarkerSpec[] = [];

    if (hydrantsVisible) {
      for (const feature of features) {
        const featurePosition = fromLngLat(
          feature.geometry.coordinates[0],
          feature.geometry.coordinates[1],
        );
        const isEditingThis = editing && selectedNode?.id === feature.id;
        const maxMeters = isEditingThis ? maxHydrantMoveMeters : null;

        list.push({
          id: `hydrant-${feature.id}`,
          position: maxMeters !== null && draftPosition ? draftPosition : featurePosition,
          icon: hydrantIcon(feature),
          selected: selectedNode?.id === feature.id,
          ringClassName: "hydrant-ring",
          draggable: maxMeters !== null,
          circle:
            maxMeters !== null
              ? {
                  radiusMeters: maxMeters,
                  color: "#eab308",
                  fillOpacity: 0.08,
                  weight: 1,
                }
              : undefined,
          onClick: maxMeters !== null ? undefined : () => handleSelectNode(feature),
          onDragEnd:
            maxMeters !== null
              ? (next) => setDraftPosition(clampToMaxDistance(featurePosition, next, maxMeters))
              : undefined,
        });
      }
    }

    if (incidenciesVisible) {
      for (const feature of incidenciaFeatures) {
        list.push({
          id: `incidencia-${feature.id}`,
          position: fromLngLat(feature.geometry.coordinates[0], feature.geometry.coordinates[1]),
          icon: incidenciaIcon(feature),
          selected: selectedIncidencia?.id === feature.id,
          ringClassName: "incidencia-ring",
          onClick: () => handleSelectIncidencia(feature),
        });
      }
    }

    if (user && trackingChecked) {
      for (const [username, tracked] of Object.entries(positions)) {
        list.push({
          id: `tracking-${username}`,
          position: { lat: tracked.lat, lon: tracked.lon },
          icon: trackingPin(username, ageColor(tracked.receivedAt || tracked.timestamp * 1000)),
          // Ordre entre marcadors. MapLibre l'aplica com a z-index absolut, així
          // que cal quedar per sota dels controls de la UI (z-990).
          zIndex: 10,
          popup: (
            <div className="whitespace-nowrap text-[0.8rem] leading-[1.3]">
              <strong>{username}</strong>
              <br />
              bateria: {tracked.battery}%<br />
              precisió: {tracked.accuracy}m<br />
              {timeAgo(tracked.receivedAt || tracked.timestamp * 1000)}
            </div>
          ),
        });
      }
    }

    if (position) {
      list.push({
        id: "user-position",
        position,
        icon: USER_ICON,
        zIndex: 20,
        circle: accuracy
          ? { radiusMeters: accuracy, color: "#3388ff", fillOpacity: 0.2, weight: 1 }
          : undefined,
        onClick: user ? () => openCreate(position) : undefined,
      });
    }

    if (createPos) {
      list.push({
        id: "create-position",
        position: createPos,
        icon: CREATE_ICON,
        interactive: false,
        zIndex: 30,
      });
    }

    return list;
  }, [
    accuracy,
    createPos,
    draftPosition,
    editing,
    features,
    handleSelectIncidencia,
    handleSelectNode,
    hydrantsVisible,
    incidenciaFeatures,
    incidenciesVisible,
    maxHydrantMoveMeters,
    openCreate,
    position,
    positions,
    selectedIncidencia?.id,
    selectedNode?.id,
    trackingChecked,
    user,
  ]);

  const masked = useMaskedArea(boundaryGeojson);

  const polygons = useMemo<MapPolygonSpec[]>(() => {
    const list: MapPolygonSpec[] = [];
    const suffix = activeAdf?.id ?? "none";

    if (!activeTechnicalLayer && masked.mask) {
      list.push({
        id: `adf-mask-${suffix}`,
        geometry: masked.mask,
        style: {
          fillColor: "#000000",
          fillOpacity: 0.6,
          color: "transparent",
          weight: 0,
          opacity: 0,
        },
      });
    }

    if (activeTechnicalLayer && masked.boundary) {
      list.push({
        id: `adf-boundary-${suffix}`,
        geometry: masked.boundary,
        style: {
          fillColor: "transparent",
          fillOpacity: 0,
          color: "#333333",
          weight: 3,
          opacity: 0.6,
          dashArray: "5, 10",
        },
      });
    }

    return list;
  }, [activeAdf?.id, activeTechnicalLayer, masked]);

  const polylines = useMemo<MapPolylineSpec[]>(() => {
    if (!route) {
      return [];
    }
    return [
      {
        id: "route-shadow",
        coordinates: route.coordinates,
        style: { color: "#666666", weight: 10, opacity: 0.3 },
      },
      {
        id: "route-main",
        coordinates: route.coordinates,
        style: { color: "#0077ff", weight: 6, opacity: 0.9 },
        label: {
          text: `${Math.round(route.durationMin)} min – ${route.distanceKm.toFixed(1)} km`,
        },
      },
    ];
  }, [route]);

  const baseRaster = useMemo(() => getBasemap(baseLayer).raster, [baseLayer]);
  const overlayRasters = useMemo(() => {
    const active = technicalLayers().find((layer) => layer.id === activeTechnicalLayer);
    return active ? [active.overlay] : [];
  }, [activeTechnicalLayer]);

  const terrainEnabled = terrain3d && capabilities.terrain;
  const attributionLines =
    engine === "maplibre"
      ? uniqueAttributions([
          baseRaster.attribution,
          ...overlayRasters.map((layer) => layer.attribution),
          terrainEnabled ? TERRAIN_ATTRIBUTION : null,
        ])
      : undefined;

  const handleSelectHydrantById = (id: string) => {
    const feature = features.find((candidate) => candidate.id === id);
    if (feature) {
      handleSelectNode(feature);
    }
  };

  const canEdit = !!user && (user.role === "admin" || user.adf_id === activeAdf?.id);

  return (
    <Panel
      sheetRef={sheetRef}
      map={
        <>
          <MapSurface
            engine={engine}
            initialView={initialView}
            baseRaster={baseRaster}
            overlayRasters={overlayRasters}
            polygons={polygons}
            polylines={polylines}
            markers={markers}
            focus={focus}
            terrain={terrainEnabled}
            terrainExaggeration={terrainX2 ? 2 : 1}
            onMapClick={handleMapClick}
            onMapContextMenu={openCreate}
            onMapLongPress={openCreate}
            onViewChange={handleViewChange}
            onFatalError={handleEngineFatal}
          />
          <MapUIOverlays
            layers={
              <LayersPanel
                baseLayerId={baseLayer}
                onBaseLayerChange={setBaseLayer}
                technicalLayers={technicalLayers()}
                activeTechnicalLayer={activeTechnicalLayer}
                onTechnicalLayerChange={setActiveTechnicalLayer}
                hydrantsVisible={hydrantsVisible}
                onHydrantsVisibleChange={setHydrantsVisible}
                incidenciesVisible={incidenciesVisible}
                onIncidenciesVisibleChange={setIncidenciesVisible}
                trackingVisible={trackingChecked}
                onTrackingVisibleChange={setTrackingChecked}
                canTrack={!!user}
                terrainEnabled={terrain3d}
                onTerrainEnabledChange={setTerrain3d}
                terrainX2={terrainX2}
                onTerrainX2Change={setTerrainX2}
                canTerrain={capabilities.terrain}
              />
            }
            center={(view ?? initialView).center}
            zoom={view?.zoom ?? initialView.zoom}
            tracking={tracking}
            onToggleTracking={toggleTracking}
            loadingHidrants={loadingHidrants}
            hidrantsError={hidrantsError}
            hidrantsEmpty={
              hydrantsVisible &&
              hidrantsLoaded &&
              features.length === 0 &&
              emptyNoticeDismissedFor !== (activeAdf?.id ?? null)
            }
            canSyncFromOsm={(user?.permissions ?? []).includes("sync_osm")}
            onDismissEmptyHidrants={() => setEmptyNoticeDismissedFor(activeAdf?.id ?? null)}
            attributionLines={attributionLines}
          />
        </>
      }
      tabs={buildTabs({
        features,
        incidenciaFeatures,
        positions,
        onSelectNode: handleSelectNode,
        onSelectIncidencia: handleSelectIncidencia,
        onSelectHydrantById: handleSelectHydrantById,
        onRefreshHidrants: () => {
          void refreshHidrants().then(() => setNodeInfoKey((prev) => prev + 1));
        },
        onCenterCoordinates: handleCenterCoordinates,
        engine,
        enginePreference,
        onEngineChange: handleEngineChange,
      })}
      node={
        selectedNode
          ? {
              id: selectedNode.id,
              content: (
                <NodeInfo
                  key={nodeInfoKey}
                  feature={selectedNode}
                  canEdit={canEdit}
                  editing={editing}
                  setEditing={setEditing}
                  draftPosition={draftPosition}
                  setDraftPosition={setDraftPosition}
                  refreshHidrants={() => refreshHidrants()}
                  showRoute={showRoute}
                  setShowRoute={setShowRoute}
                  hasLocation={!!position}
                />
              ),
              onClose: handleDeselectNode,
              onEdit: canEdit ? toggleEditing : undefined,
              editing,
            }
          : selectedIncidencia
            ? {
                id: selectedIncidencia.id,
                title: `${emojiPrioritatIncidencia(selectedIncidencia.properties.prioritat)} ${selectedIncidencia.properties.titol}`,
                content: (
                  <IncidenciaInfo
                    key={selectedIncidencia.id}
                    incidencia={selectedIncidencia}
                    canEdit={canEdit}
                    editing={editing}
                    setEditing={setEditing}
                    showRoute={showRoute}
                    setShowRoute={setShowRoute}
                    refreshIncidencies={() => {
                      void refreshIncidencies();
                    }}
                    hasLocation={!!position}
                  />
                ),
                onClose: handleDeselectIncidencia,
                onEdit: canEdit ? () => setEditing((prev) => !prev) : undefined,
                editing,
              }
            : createPos && createForm && user
              ? {
                  id: "create",
                  title: createTitle(createForm),
                  content: (
                    <CreateNodePanel
                      form={createForm}
                      position={createPos}
                      setForm={setCreateForm}
                      onClose={closeCreate}
                      setNewNodePosition={setCreatePos}
                      refreshHidrants={() => {
                        void refreshHidrants();
                      }}
                      refreshIncidencies={() => {
                        void refreshIncidencies();
                      }}
                    />
                  ),
                  onClose: closeCreate,
                }
              : null
      }
    />
  );
}
