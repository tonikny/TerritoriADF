import { useMemo } from "react";
import type { HidrantFeature } from "@territoriadf/contracts/hidrants";
import type { IncidenciaFeature } from "@territoriadf/contracts/incidencies";
import type { Position } from "@territoriadf/contracts/tracking";
import type { ReactNode } from "react";

import {
  createMarker,
  hidrantMarkers,
  incidenciaMarkers,
  trackingMarkers,
  userMarker,
} from "@/map/core/builders";
import type { LatLon, MapMarkerSpec } from "@/map/core/types";

/**
 * Marcadors del mapa: hidrants, incidències, unitats OwnTracks, posició pròpia
 * i el punt de creació.
 *
 * La composició viu aquí i no a `MapPanel` perquè depèn de nou fonts d'estat;
 * els *builders* de `map/core` fan la feina pura i aquest hook només decideix
 * quines capes estan actives. El popup arriba com a funció perquè els hooks no
 * poden importar components.
 */
export function useMapMarkers({
  features,
  incidenciaFeatures,
  positions,
  ownPosition,
  accuracy,
  maxMoveMeters,
  selectedNodeId,
  selectedIncidenciaId,
  editing,
  draftPosition,
  creationPosition,
  showHidrants,
  showIncidencies,
  showTracking,
  canCreate,
  onSelectNode,
  onSelectIncidencia,
  onDragNode,
  onOpenCreate,
  renderTrackingPopup,
}: {
  features: readonly HidrantFeature[];
  incidenciaFeatures: readonly IncidenciaFeature[];
  positions: Record<string, Position>;
  ownPosition: LatLon | null;
  accuracy: number | null;
  maxMoveMeters: number | null;
  selectedNodeId: string | null;
  selectedIncidenciaId: string | null;
  editing: boolean;
  draftPosition: LatLon | null;
  creationPosition: LatLon | null;
  showHidrants: boolean;
  showIncidencies: boolean;
  showTracking: boolean;
  canCreate: boolean;
  onSelectNode: (feature: HidrantFeature) => void;
  onSelectIncidencia: (feature: IncidenciaFeature) => void;
  onDragNode: (position: LatLon) => void;
  onOpenCreate: (position: LatLon) => void;
  renderTrackingPopup: (username: string, position: Position) => ReactNode;
}): MapMarkerSpec[] {
  return useMemo(() => {
    const markers: MapMarkerSpec[] = [];

    if (showHidrants) {
      markers.push(
        ...hidrantMarkers(features, {
          selectedId: selectedNodeId,
          editingId: editing ? selectedNodeId : null,
          draftPosition,
          maxMoveMeters,
          onSelect: onSelectNode,
          onDrag: (_feature, position) => onDragNode(position),
        }),
      );
    }

    if (showIncidencies) {
      markers.push(
        ...incidenciaMarkers(incidenciaFeatures, {
          selectedId: selectedIncidenciaId,
          onSelect: onSelectIncidencia,
        }),
      );
    }

    if (showTracking) {
      markers.push(...trackingMarkers(positions, renderTrackingPopup));
    }

    if (ownPosition) {
      markers.push(
        userMarker(ownPosition, accuracy, canCreate ? () => onOpenCreate(ownPosition) : undefined),
      );
    }

    if (creationPosition) {
      markers.push(createMarker(creationPosition));
    }

    return markers;
  }, [
    accuracy,
    canCreate,
    creationPosition,
    draftPosition,
    editing,
    features,
    incidenciaFeatures,
    maxMoveMeters,
    onDragNode,
    onOpenCreate,
    onSelectIncidencia,
    onSelectNode,
    ownPosition,
    positions,
    renderTrackingPopup,
    selectedIncidenciaId,
    selectedNodeId,
    showHidrants,
    showIncidencies,
    showTracking,
  ]);
}
