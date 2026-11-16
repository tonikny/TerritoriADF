import type { EngineCapabilities, EngineId } from "./types";

export const ENGINE_CAPABILITIES: Record<EngineId, EngineCapabilities> = {
  leaflet: { webgl: false, pitch: false, terrain: false },
  maplibre: { webgl: true, pitch: true, terrain: true },
};

export const ENGINE_LABELS: Record<EngineId, string> = {
  leaflet: "Leaflet",
  maplibre: "MapLibre",
};
