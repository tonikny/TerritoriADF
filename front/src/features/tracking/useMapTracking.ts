import { useEffect, useRef } from "react";

import type { Position } from "@territoriadf/contracts/tracking";

import { useGeolocationTracking } from "./useGeolocationTracking";
import { POSITIONS_POLL_ACTIVE_MS, POSITIONS_POLL_IDLE_MS } from "./usePositionPolling";
import { usePositions } from "./usePositions";
import { getBottomSheetInset } from "@/map/shared/uiInset";

import type { FocusCommand } from "@/hooks/map/useMapFocus";

/**
 * Posició pròpia (GPS) i posicions OwnTracks de la resta d'unitats.
 *
 * El polling va més de pressa quan el seguiment és visible. En activar el GPS,
 * la càmera segueix la posició un sol cop: després l'usuari pot moure el mapa
 * sense que cada lectura el torni a centrar.
 */
export function useMapTracking({
  enabled,
  trackingVisible,
  requestFocus,
}: {
  enabled: boolean;
  trackingVisible: boolean;
  requestFocus: (command: FocusCommand) => void;
}): {
  tracking: boolean;
  toggleTracking: () => void;
  position: { lat: number; lon: number } | null;
  accuracy: number | null;
  positions: Record<string, Position>;
} {
  const { tracking, toggleTracking, position, accuracy } = useGeolocationTracking();
  const positions = usePositions({
    enabled,
    intervalMs: trackingVisible ? POSITIONS_POLL_ACTIVE_MS : POSITIONS_POLL_IDLE_MS,
  });

  const followed = useRef(false);

  useEffect(() => {
    if (!tracking) {
      followed.current = false;
      return;
    }
    if (!position || followed.current) {
      return;
    }
    followed.current = true;
    requestFocus({
      kind: "point",
      position,
      zoom: 17,
      insetBottom: getBottomSheetInset(),
    });
  }, [tracking, position, requestFocus]);

  return { tracking, toggleTracking, position, accuracy, positions };
}
