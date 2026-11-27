import { Suspense, type ReactNode } from "react";
import type { EngineId, MapEngineProps } from "./core/types";
import { ENGINE_COMPONENTS } from "./engines/registry";
import { MapErrorBoundary } from "./ui/MapErrorBoundary";

/**
 * `loadingFallback` arriba de qui munta el mapa: aquesta capa no pot importar
 * `shared/` (ho imposa ESLint), així que qui sí que pot hi passa el spinner de
 * l'app i, si no n'hi ha, es queda el text de sempre.
 */
export function MapSurface({
  engine,
  loadingFallback,
  ...props
}: MapEngineProps & { engine: EngineId; loadingFallback?: ReactNode }) {
  const Engine = ENGINE_COMPONENTS[engine];

  return (
    <MapErrorBoundary key={engine} onError={props.onFatalError}>
      <Suspense fallback={loadingFallback ?? <div className="map-loading">Carregant el mapa…</div>}>
        <Engine {...props} />
      </Suspense>
    </MapErrorBoundary>
  );
}
