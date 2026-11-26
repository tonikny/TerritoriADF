// Constructors de les especificacions que reben els motors de mapa.
//
// Són funcions pures: no llegeixen estat, no criden hooks i no toquen el DOM.
// Així la composició de marcadors, polígons i línies es pot provar sense muntar
// cap mapa (vegeu `builders.test.ts`) i `MapPanel` només decideix *què* es pinta.
import type { HidrantFeature } from "@territoriadf/contracts/hidrants";
import type { IncidenciaFeature } from "@territoriadf/contracts/incidencies";
import type { Position } from "@territoriadf/contracts/tracking";
import type { MultiPolygon, Polygon } from "geojson";
import type { ReactNode } from "react";

import { clampToMaxDistance, fromLngLat } from "./geometry";
import type { LatLon, MapMarkerSpec, MapPolygonSpec, MapPolylineSpec } from "./types";
import {
  CREATE_ICON,
  USER_ICON,
  ageColor,
  hidrantIcon,
  incidenciaIcon,
  trackingPin,
} from "@/map/shared/markerIcons";

const HIDRANT_RING = "hydrant-ring";
const INCIDENCIA_RING = "incidencia-ring";

/** Radi de moviment permès mentre s'arrossega un hidrant. */
const MOVE_RADIUS_STYLE = { color: "#eab308", fillOpacity: 0.08, weight: 1 } as const;

export interface HidrantMarkerOptions {
  selectedId: string | null;
  /** Hidrant en edició: només aquest es pot arrossegar. */
  editingId: string | null;
  draftPosition: LatLon | null;
  /** Límit de moviment; `null` mentre no arriba la configuració del backend. */
  maxMoveMeters: number | null;
  onSelect: (feature: HidrantFeature) => void;
  onDrag: (feature: HidrantFeature, position: LatLon) => void;
}

/**
 * Marcadors d'hidrants. Mentre se n'arrossega un, la resta deixen de ser
 * clicables: el clic podria canviar la selecció i perdre el moviment en curs.
 */
export function hidrantMarkers(
  features: readonly HidrantFeature[],
  { selectedId, editingId, draftPosition, maxMoveMeters, onSelect, onDrag }: HidrantMarkerOptions,
): MapMarkerSpec[] {
  return features.map((feature) => {
    const origin = fromLngLat(feature.geometry.coordinates[0], feature.geometry.coordinates[1]);
    const maxMeters = maxMoveMeters !== null && editingId === feature.id ? maxMoveMeters : null;
    return {
      id: `hydrant-${feature.id}`,
      position: maxMeters !== null && draftPosition !== null ? draftPosition : origin,
      icon: hidrantIcon(feature),
      selected: selectedId === feature.id,
      ringClassName: HIDRANT_RING,
      draggable: maxMeters !== null,
      circle: maxMeters !== null ? { radiusMeters: maxMeters, ...MOVE_RADIUS_STYLE } : undefined,
      onClick: maxMeters !== null ? undefined : () => onSelect(feature),
      onDragEnd:
        maxMeters !== null
          ? (next) => onDrag(feature, clampToMaxDistance(origin, next, maxMeters))
          : undefined,
    };
  });
}

export interface IncidenciaMarkerOptions {
  selectedId: string | null;
  onSelect: (feature: IncidenciaFeature) => void;
}

export function incidenciaMarkers(
  features: readonly IncidenciaFeature[],
  { selectedId, onSelect }: IncidenciaMarkerOptions,
): MapMarkerSpec[] {
  return features.map((feature) => ({
    id: `incidencia-${feature.id}`,
    position: fromLngLat(feature.geometry.coordinates[0], feature.geometry.coordinates[1]),
    icon: incidenciaIcon(feature),
    selected: selectedId === feature.id,
    ringClassName: INCIDENCIA_RING,
    onClick: () => onSelect(feature),
  }));
}

/**
 * Marcadors OwnTracks. El popup el pinta qui crida (és JSX i no ha de viure a
 * `map/core`); el color de l'etiqueta surt de l'antiguitat de la posició.
 */
export function trackingMarkers(
  positions: Record<string, Position>,
  renderPopup: (username: string, position: Position) => ReactNode,
): MapMarkerSpec[] {
  return Object.entries(positions).map(([username, tracked]) => ({
    id: `tracking-${username}`,
    position: { lat: tracked.lat, lon: tracked.lon },
    icon: trackingPin(username, ageColor(tracked.receivedAt || tracked.timestamp * 1000)),
    // Per sota dels controls de la UI (z-990); vegeu `MapMarkerSpec.zIndex`.
    zIndex: 10,
    popup: renderPopup(username, tracked),
  }));
}

export function userMarker(
  position: LatLon,
  accuracy: number | null,
  onCreate?: () => void,
): MapMarkerSpec {
  return {
    id: "user-position",
    position,
    icon: USER_ICON,
    zIndex: 20,
    circle: accuracy
      ? { radiusMeters: accuracy, color: "#014a1e", fillOpacity: 0.2, weight: 1 }
      : undefined,
    onClick: onCreate,
  };
}

/** Punt on es crearà el node mentre es tria el tipus. */
export function createMarker(position: LatLon): MapMarkerSpec {
  return {
    id: "create-position",
    position,
    icon: CREATE_ICON,
    interactive: false,
    zIndex: 30,
  };
}

export type BoundaryGeometry = {
  mask: Polygon | MultiPolygon | null;
  boundary: Polygon | MultiPolygon | null;
};

/**
 * Polígons de l'ADF: la màscara enfosqueix el que queda fora del límit o, amb
 * una capa tècnica activa, es dibuixa només la frontera discontínua.
 */
export function boundaryPolygons(
  area: BoundaryGeometry,
  { adfId, technicalLayerActive }: { adfId: number | null; technicalLayerActive: boolean },
): MapPolygonSpec[] {
  const suffix = adfId ?? "none";

  if (!technicalLayerActive && area.mask) {
    return [
      {
        id: `adf-mask-${suffix}`,
        geometry: area.mask,
        style: {
          fillColor: "#000000",
          fillOpacity: 0.6,
          color: "transparent",
          weight: 0,
          opacity: 0,
        },
      },
    ];
  }

  if (technicalLayerActive && area.boundary) {
    return [
      {
        id: `adf-boundary-${suffix}`,
        geometry: area.boundary,
        style: {
          fillColor: "transparent",
          fillOpacity: 0,
          color: "#333333",
          weight: 3,
          opacity: 0.6,
          dashArray: "5, 10",
        },
      },
    ];
  }

  return [];
}

export type RouteLine = {
  coordinates: [number, number][];
  distanceKm: number;
  durationMin: number;
};

/** Dues línies per donar profunditat a la ruta, amb la durada a la principal. */
export function routePolylines(route: RouteLine | null): MapPolylineSpec[] {
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
      style: { color: "#014a1e", weight: 6, opacity: 0.9 },
      label: {
        text: `${Math.round(route.durationMin)} min – ${route.distanceKm.toFixed(1)} km`,
      },
    },
  ];
}
