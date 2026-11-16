import { lazy } from "react";
import type { ComponentType, LazyExoticComponent } from "react";
import type { EngineId, MapEngineProps } from "../core/types";

export type MapEngineComponent = ComponentType<MapEngineProps>;

export const ENGINE_LOADERS: Record<EngineId, () => Promise<{ default: MapEngineComponent }>> = {
  leaflet: () => import("./leaflet/MapEngine"),
  maplibre: () => import("./maplibre/MapEngine"),
};

export const ENGINE_COMPONENTS: Record<EngineId, LazyExoticComponent<MapEngineComponent>> = {
  leaflet: lazy(ENGINE_LOADERS.leaflet),
  maplibre: lazy(ENGINE_LOADERS.maplibre),
};
