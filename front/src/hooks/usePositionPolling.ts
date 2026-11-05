// Hook que polla GET /api/tracking/positions cada intervalMs i retorna les posicions.
import { useState, useEffect, useRef } from "react";
import { storageKey } from "../utils/storageKeys";

export interface Position {
  lat: number;
  lon: number;
  accuracy: number;
  timestamp: number;
  battery: number;
  receivedAt: number;
}

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

  const [positions, setPositions] = useState<Record<string, Position>>({});
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const poll = async () => {
      try {
        const res = await fetch(`/api/tracking/positions?_=${Date.now()}`, {
          credentials: "same-origin",
        });
        if (res.ok) {
          const data = await res.json();
          setPositions(data.positions || {});
        }
      } catch {
        /* ignore */
      }
    };
    void poll();
    intervalRef.current = setInterval(() => {
      void poll();
    }, intervalMs);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [enabled, intervalMs]);

  return positions;
}
