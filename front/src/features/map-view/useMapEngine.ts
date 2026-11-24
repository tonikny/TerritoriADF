import { useCallback, useState } from "react";

import { ENGINE_CAPABILITIES } from "@/map/core/capabilities";
import {
  clearEngineFailure,
  markEngineFailure,
  readEnginePreference,
  resolveEngine,
  storeEnginePreference,
  type EnginePreference,
} from "@/map/core/engineSelection";
import type { EngineId, FocusCommand, ViewState } from "@/map/core/types";

/**
 * Motor de mapa: preferència, selecció i fallback davant d'un error fatal.
 *
 * En canviar de motor el mapa es remunta amb la vista inicial desada, així que
 * es torna a centrar a la vista actual per no perdre el punt de treball.
 */
export function useMapEngine({
  view,
  requestFocus,
  clearFocus,
}: {
  view: ViewState | null;
  requestFocus: (command: FocusCommand) => void;
  clearFocus: () => void;
}) {
  const [preference, setPreference] = useState<EnginePreference>(() => readEnginePreference());
  const [engine, setEngine] = useState<EngineId>(() => resolveEngine());
  const capabilities = ENGINE_CAPABILITIES[engine];

  const changeEngine = useCallback(
    (next: EnginePreference) => {
      clearEngineFailure();
      setPreference(next);
      storeEnginePreference(next);
      clearFocus();
      setEngine(resolveEngine(next));
      if (view) {
        requestFocus({ kind: "point", position: view.center, zoom: view.zoom });
      }
    },
    [clearFocus, requestFocus, view],
  );

  const handleFatalError = useCallback(() => {
    markEngineFailure();
    clearFocus();
    setEngine("leaflet");
    if (view) {
      requestFocus({ kind: "point", position: view.center, zoom: view.zoom });
    }
  }, [clearFocus, requestFocus, view]);

  return { engine, preference, capabilities, changeEngine, handleFatalError };
}
