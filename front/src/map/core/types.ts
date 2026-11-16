import type { ReactNode } from "react";
import type { MultiPolygon, Polygon } from "geojson";

/** Coordenada d'interfície: ordre humà (lat/lon). Les dades GeoJSON van en [lon, lat]. */
export type LatLon = { lat: number; lon: number };

export type GeoBounds = { south: number; west: number; north: number; east: number };

/**
 * Vista del mapa. El zoom segueix la convenció de Leaflet (món = 256·2^zoom px)
 * perquè és la que ja hi ha desada a localStorage. L'adaptador MapLibre fa +1/-1.
 */
export type ViewState = {
  center: LatLon;
  zoom: number;
  pitch?: number;
  bearing?: number;
};

export type EngineId = "leaflet" | "maplibre";

export type EngineCapabilities = {
  webgl: boolean;
  pitch: boolean;
  terrain: boolean;
};

export type MarkerIcon =
  | {
      kind: "image";
      url: string;
      size: [number, number];
      anchor: [number, number];
      shadowUrl?: string;
      shadowSize?: [number, number];
    }
  | {
      kind: "html";
      html: string;
      size: [number, number];
      anchor: [number, number];
      className?: string;
    };

export type MarkerCircle = {
  radiusMeters: number;
  color: string;
  fillOpacity?: number;
  weight?: number;
};

export type MapMarkerSpec = {
  id: string;
  position: LatLon;
  icon: MarkerIcon;
  /** Anell de selecció dibuixat sota el marcador (classe CSS pròpia). */
  selected?: boolean;
  ringClassName?: string;
  /** `false` per marcadors decoratius (anells, etc.). */
  interactive?: boolean;
  draggable?: boolean;
  circle?: MarkerCircle;
  popup?: ReactNode;
  zIndex?: number;
  onClick?: () => void;
  onDragEnd?: (position: LatLon) => void;
};

export type ShapeStyle = {
  fillColor?: string;
  fillOpacity?: number;
  color?: string;
  weight?: number;
  opacity?: number;
  dashArray?: string;
};

export type MapPolygonSpec = {
  id: string;
  geometry: Polygon | MultiPolygon;
  style: ShapeStyle;
};

export type MapPolylineSpec = {
  id: string;
  coordinates: [number, number][];
  style: ShapeStyle;
  label?: { text: string };
};

export type WmsSpec = {
  url: string;
  layers: string;
  format?: string;
  version?: string;
  transparent?: boolean;
  time?: string;
};

export type MapRasterSpec = {
  id: string;
  /** Plantilla XYZ/TMS. No s'usa si hi ha `wms`. */
  tiles?: string[];
  scheme?: "xyz" | "tms";
  wms?: WmsSpec;
  tileSize?: 256 | 512;
  minZoom?: number;
  maxZoom?: number;
  opacity?: number;
  attribution?: string;
};

/** Ordre de càmera. `insetBottom` són els píxels tapats pel bottomsheet. */
export type MapFocus =
  | {
      kind: "point";
      position: LatLon;
      zoom?: number;
      keepZoom?: boolean;
      insetBottom?: number;
      token: number;
    }
  | { kind: "bounds"; bounds: GeoBounds; padding?: number; token: number };

export type MapEngineProps = {
  initialView: ViewState;
  baseRaster: MapRasterSpec | null;
  overlayRasters: MapRasterSpec[];
  polygons: MapPolygonSpec[];
  polylines: MapPolylineSpec[];
  markers: MapMarkerSpec[];
  focus?: MapFocus | null;
  terrain?: boolean;
  /** Multiplicador de l'exageració base del terreny (1.3). 2 = x2. */
  terrainExaggeration?: number;
  onMapClick?: (position: LatLon) => void;
  onMapContextMenu?: (position: LatLon) => void;
  onMapLongPress?: (position: LatLon) => void;
  onViewChange?: (view: ViewState) => void;
  /** Error irrecuperable del motor (WebGL, context perdut): cal canviar de motor. */
  onFatalError?: (error: unknown) => void;
};
