import { Suspense } from "react";
import type { EngineId, MapEngineProps } from "./core/types";
import { ENGINE_COMPONENTS } from "./engines/registry";
import { MapErrorBoundary } from "./ui/MapErrorBoundary";

export function MapSurface({ engine, ...props }: MapEngineProps & { engine: EngineId }) {
  const Engine = ENGINE_COMPONENTS[engine];

  return (
    <MapErrorBoundary key={engine} onError={props.onFatalError}>
      <Suspense fallback={<div className="map-loading">Carregant el mapa…</div>}>
        <Engine {...props} />
      </Suspense>
    </MapErrorBoundary>
  );
}
