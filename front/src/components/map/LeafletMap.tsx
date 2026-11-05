import { useState, useEffect } from "react";
import { MapContainer, Marker, useMap, useMapEvents } from "react-leaflet";
import type { LatLng } from "leaflet";
import L from "leaflet";
import { MapClickHandler } from "./MapClickHandler";
import MapRightClickHandler from "./MapRightClickHandler";
import { Layers } from "./Layers";
import MaskedAreaMap from "./MaskedAreaMap";
import { RouteLayer } from "./RouteLayer";
import { useAdf } from "../../contexts/AdfContext";
import { useAuth } from "../../contexts/AuthContext";
import { HydrantMarkerList } from "./markers/HydrantMarkerList";
import { MapUrlHandler } from "./MapUrlHandler";
import { MapViewPersist } from "./MapViewPersist";
import { MapUIOverlays } from "../controls/MapUIOverlays";
import { LocationMarker } from "./LocationMarker";
import { useLocalStorage } from "../../utils/useLocalStorage";
import { storageKey } from "../../utils/storageKeys";

import { IncidenciaMarkerList } from "./markers/IncidenciaMarkerList";
import type { HidrantFeature } from "../../hooks/useHidrantData";
import type { IncidenciaFeature, CreateType } from "../../types";

// ✅ Centra el mapa en el node seleccionat amb un sol moviment,
// tenint en compte el bottomsheet obert (espai visible més petit).
function MapNodeCenter() {
  const map = useMap();

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (
        e as CustomEvent<{ geometry: { coordinates: [number, number] }; keepZoom?: boolean }>
      ).detail;
      const [lon, lat] = detail.geometry.coordinates;
      const size = map.getSize();
      if (size.y === 0) {
        return;
      }

      const sheet = document.querySelector('[class*="z-1000"]');
      let targetY = size.y / 2;
      if (sheet && sheet.getBoundingClientRect().height > 0) {
        targetY = sheet.getBoundingClientRect().top / 2;
      }

      const delta = size.y / 2 - targetY;
      const zoom = detail.keepZoom ? map.getZoom() : 15;
      const nodePx = map.project([lat, lon], zoom);
      const center = map.unproject(nodePx.add(L.point(0, delta)), zoom);
      map.flyTo(center, zoom, { animate: true, duration: 1.2 });
    };

    window.addEventListener("map-center-node", handler);
    return () => window.removeEventListener("map-center-node", handler);
  }, [map]);

  return null;
}

// ✅ Component per escoltar clics al mapa i informar al pare
function MapStateListener({ onMapClick }: { onMapClick?: () => void }) {
  useMapEvents({
    click: () => {
      onMapClick?.();
    },
  });

  return null;
}

// ✅ Component funcional que força el redibuix del mapa després de muntar-se
function FixMapSize() {
  const map = useMap();

  useEffect(() => {
    const timer = setTimeout(() => {
      map.whenReady(() => {
        if (map.getContainer()) {
          map.invalidateSize();
        }
      });
    }, 200);

    return () => clearTimeout(timer);
  }, [map]);

  return null;
}
export function LeafletMap({
  onSelectNode,
  onMapClick,
  selectedNodeId,
  features,
  loadingHidrants,
  hidrantsError,
  hidrantsEmpty,
  canSyncFromOsm,
  onDismissEmptyHidrants,
  refreshHidrants,
  incidenciaFeatures,
  loadingIncidencies,
  selectedIncidenciaId,
  positions,
  position,
  setPosition,
  showRoute,
  setShowRoute,
  createPos,
  createForm,
  onOpenCreate,
  onCloseCreate,
  onSelectIncidencia,
  trackingChecked,
  setTrackingChecked,
  editingNodeId,
  draftPosition,
  onNodeDrag,
  maxMoveMeters,
}: {
  onSelectNode: (f: HidrantFeature) => void;
  onMapClick?: () => void;
  selectedNodeId?: string | null;
  features: HidrantFeature[];
  loadingHidrants: boolean;
  hidrantsError: string | null;
  hidrantsEmpty?: boolean;
  canSyncFromOsm?: boolean;
  onDismissEmptyHidrants?: () => void;
  refreshHidrants: () => void;
  incidenciaFeatures: IncidenciaFeature[];
  loadingIncidencies: boolean;
  selectedIncidenciaId?: string | null;
  positions: Record<
    string,
    {
      lat: number;
      lon: number;
      accuracy: number;
      timestamp: number;
      battery: number;
      receivedAt: number;
    }
  >;
  position: L.LatLng | null;
  setPosition: (pos: L.LatLng | null) => void;
  showRoute: boolean;
  setShowRoute: (show: boolean) => void;
  createPos: L.LatLng | null;
  createForm: CreateType;
  onOpenCreate: (latlng: L.LatLng) => void;
  onCloseCreate: () => void;
  onSelectIncidencia: (f: IncidenciaFeature) => void;
  trackingChecked: boolean;
  setTrackingChecked: (v: boolean) => void;
  editingNodeId?: string | null;
  draftPosition?: L.LatLng | null;
  onNodeDrag?: (latlng: L.LatLng) => void;
  maxMoveMeters?: number | null;
}) {
  const { activeAdf, isLoading } = useAdf();
  const { user } = useAuth();
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
  const [baseLayer, setBaseLayer] = useLocalStorage<string>(
    storageKey("base_layer"),
    "OpenStreetMap",
  );

  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [poi, setPoi] = useState<LatLng | null>(null);

  const openFormAtPosition = (latlng: L.LatLng) => {
    onOpenCreate(latlng);
  };

  if (isLoading) {
    return <div className="loading">Carregant dades de l'ADF...</div>;
  }

  return (
    <>
      <MapContainer
        center={activeAdf?.center || [41.56, 1.72]}
        zoom={activeAdf ? 14 : 11}
        className="leaflet-map"
      >
        <FixMapSize />
        <MapNodeCenter />
        {/* Gestiona l'obertura de nodes via URL (?node=ID) */}
        <MapUrlHandler
          features={features}
          incidenciaFeatures={incidenciaFeatures}
          loadingHidrants={loadingHidrants}
          loadingIncidencies={loadingIncidencies}
          onSelectNode={onSelectNode}
          onSelectIncidencia={onSelectIncidencia}
        />
        <MapStateListener onMapClick={onMapClick} />
        <MapViewPersist />
        <MaskedAreaMap hidden={!!activeTechnicalLayer} />
        <Layers
          activeTechnicalLayer={activeTechnicalLayer}
          setActiveTechnicalLayer={setActiveTechnicalLayer}
          hydrantsVisible={hydrantsVisible}
          setHydrantsVisible={setHydrantsVisible}
          incidenciesVisible={incidenciesVisible}
          setIncidenciesVisible={setIncidenciesVisible}
          baseLayer={baseLayer}
          setBaseLayer={setBaseLayer}
          positions={positions}
          trackingChecked={trackingChecked}
          setTrackingChecked={setTrackingChecked}
        />
        <MapRightClickHandler onCreate={onOpenCreate} user={user} />
        {hydrantsVisible && (
          <HydrantMarkerList
            features={features}
            setPoi={setPoi}
            showRoute={showRoute}
            setShowRoute={setShowRoute}
            refreshHidrants={refreshHidrants}
            hasLocation={!!position}
            onSelectNode={onSelectNode}
            selectedNodeId={selectedNodeId}
            editingNodeId={editingNodeId}
            draftPosition={draftPosition}
            onNodeDrag={onNodeDrag}
            maxMoveMeters={maxMoveMeters}
          />
        )}
        {incidenciesVisible && (
          <IncidenciaMarkerList
            features={incidenciaFeatures}
            setPoi={setPoi}
            onSelectIncidencia={onSelectIncidencia}
            selectedIncidenciaId={selectedIncidenciaId}
          />
        )}
        {user && (
          <MapClickHandler onClick={onOpenCreate} onCancel={onCloseCreate} isActive={!!createPos} />
        )}
        {createPos && createForm && (
          <Marker
            position={createPos}
            icon={L.icon({
              iconUrl: "/images/icons/marker-icon-gold.png",
              iconSize: [25, 41],
              iconAnchor: [12, 41],
              popupAnchor: [0, -41],
            })}
          />
        )}
        {poi && position && showRoute && <RouteLayer from={position} to={poi} />}
        <LocationMarker
          position={position}
          accuracy={accuracy}
          onEdit={user ? openFormAtPosition : undefined}
        />

        <MapUIOverlays
          loadingHidrants={loadingHidrants}
          hidrantsError={hidrantsError}
          emptyHidrants={hidrantsEmpty}
          canSyncFromOsm={canSyncFromOsm}
          onDismissEmptyHidrants={onDismissEmptyHidrants}
          setLocatePosition={setPosition}
          setLocateAccuracy={setAccuracy}
        />
      </MapContainer>
    </>
  );
}
