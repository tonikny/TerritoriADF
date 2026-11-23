import { useEffect, useRef, useState } from "react";
import { toast } from "react-toastify";
import { logError } from "@/utils/log";
import type { GeoBounds, LatLon } from "@/map/core/types";
import { boundsFromCoordinates, distanceMeters } from "@/map/core/geometry";

export type RouteData = {
  coordinates: [number, number][];
  bounds: GeoBounds;
  destKey: string;
  distanceKm: number;
  durationMin: number;
};

type GraphHopperResponse = {
  paths?: Array<{
    points: { coordinates: [number, number][] };
    distance: number;
    time: number;
  }>;
  error?: string;
};

const REFETCH_METERS = 20;

export function useRoute({
  enabled,
  from,
  to,
}: {
  enabled: boolean;
  from: LatLon | null;
  to: LatLon | null;
}): RouteData | null {
  const [route, setRoute] = useState<RouteData | null>(null);
  const lastFetchPosition = useRef<LatLon | null>(null);
  const lastDestination = useRef<string>("");

  const fromLat = from?.lat ?? null;
  const fromLon = from?.lon ?? null;
  const toLat = to?.lat ?? null;
  const toLon = to?.lon ?? null;

  useEffect(() => {
    if (!enabled || fromLat === null || fromLon === null || toLat === null || toLon === null) {
      lastFetchPosition.current = null;
      lastDestination.current = "";
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sincronitza amb una font externa (ruta desactivada)
      setRoute(null);
      return;
    }

    const destination = `${toLat},${toLon}`;
    const nextFrom = { lat: fromLat, lon: fromLon };

    if (lastDestination.current !== destination) {
      lastDestination.current = destination;
      setRoute(null);
    }

    const shouldFetch =
      !lastFetchPosition.current ||
      lastDestination.current !== destination ||
      distanceMeters(lastFetchPosition.current, nextFrom) > REFETCH_METERS;

    if (!shouldFetch) {
      return;
    }

    let cancelled = false;
    const url = `/api/route?from=${fromLat},${fromLon}&to=${toLat},${toLon}`;

    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw new Error("Error al servidor de rutes");
        }
        return response.json() as Promise<GraphHopperResponse>;
      })
      .then((data) => {
        if (cancelled) {
          return;
        }
        const path = data.paths?.[0];
        if (!path) {
          if (data.error) {
            throw new Error(data.error);
          }
          return;
        }
        const coordinates = path.points.coordinates;
        const bounds = boundsFromCoordinates(coordinates);
        if (!bounds) {
          return;
        }
        setRoute({
          coordinates,
          bounds,
          destKey: destination,
          distanceKm: path.distance / 1000,
          durationMin: path.time / 60000,
        });
        lastFetchPosition.current = nextFrom;
        lastDestination.current = destination;
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        logError("Error carregant ruta", error);
        toast.error("No s’ha pogut calcular la ruta.");
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, fromLat, fromLon, toLat, toLon]);

  return route;
}
