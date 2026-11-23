import { useEffect, useRef } from "react";

import { useRoute, type RouteData } from "@/map/shared/useRoute";
import type { LatLon } from "@/map/core/types";

import type { FocusCommand } from "./useMapFocus";

/**
 * Ruta a peu/cotxe fins al punt seleccionat i encuadre automàtic.
 *
 * Només s'encuadra quan canvia el destí (`destKey`): mentre l'usuari es mou, la
 * ruta es recalcula però la càmera no li roba el control.
 */
export function useMapRoute({
  enabled,
  from,
  to,
  requestFocus,
}: {
  enabled: boolean;
  from: LatLon | null;
  to: LatLon | null;
  requestFocus: (command: FocusCommand) => void;
}): RouteData | null {
  const route = useRoute({ enabled, from, to });
  const lastFit = useRef<string | null>(null);

  useEffect(() => {
    if (!route) {
      lastFit.current = null;
      return;
    }
    if (lastFit.current === route.destKey) {
      return;
    }
    lastFit.current = route.destKey;
    requestFocus({ kind: "bounds", bounds: route.bounds, padding: 50 });
  }, [route, requestFocus]);

  return route;
}
