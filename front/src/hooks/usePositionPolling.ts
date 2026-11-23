// Polling de posicions OwnTracks a través de la caché de TanStack Query: el
// `refetchInterval` fa la feina que abans feia un `setInterval` manual i el
// resultat es comparteix entre els consumidors del mateix visor.
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/contexts/AuthContext";
import type { Position } from "@territoriadf/contracts/tracking";

import { getTrackingPositions } from "@/shared/api/tracking";
import { queryKeys, viewerKey } from "@/shared/query/keys";
import { storageKey } from "@/utils/storageKeys";

export type { Position };

export const POSITIONS_POLL_ACTIVE_MS = 15_000;
export const POSITIONS_POLL_IDLE_MS = 5 * 60 * 1000;
export const TRACKING_STORAGE_KEY = storageKey("tracking_visible");

/** Hook reutilizable per obtenir posicions OwnTracks amb polling automàtic. */
export function usePositionPolling(
  arg: number | { enabled?: boolean; intervalMs?: number } = {},
): Record<string, Position> {
  const { enabled, intervalMs } =
    typeof arg === "number"
      ? { enabled: true, intervalMs: arg }
      : { enabled: arg.enabled ?? true, intervalMs: arg.intervalMs ?? POSITIONS_POLL_ACTIVE_MS };

  const { user } = useAuth();

  const query = useQuery({
    queryKey: queryKeys.trackingPositions(viewerKey(user)),
    queryFn: ({ signal }) => getTrackingPositions(signal),
    enabled,
    refetchInterval: enabled ? intervalMs : false,
    // Les posicions són efímeres: cada lectura ha de ser la més nova.
    staleTime: 0,
  });

  return query.data ?? {};
}
