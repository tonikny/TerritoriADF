// Feed de posicions: intenta el stream SSE (/api/tracking/stream) i, si no està
// disponible, cau al polling de sempre. El hook de polling es manté intacte com a xarxa
// de seguretat (navegadors antics, proxies que tallen, servidor sense suport d'stream).
import { useEffect, useState } from "react";
import { usePositionPolling, type Position } from "./usePositionPolling";

type Mode = "sse" | "polling";

/** Si no arriba cap esdeveniment (ni el heartbeat de 25 s) en aquest temps, es considera
 *  la connexió morta i es passa a polling. */
const SSE_STALE_MS = 30_000;
const SSE_WATCHDOG_MS = 5_000;

export function usePositions({
  enabled,
  intervalMs,
}: {
  enabled: boolean;
  intervalMs?: number;
}): Record<string, Position> {
  const [mode, setMode] = useState<Mode>(() =>
    typeof EventSource === "undefined" ? "polling" : "sse",
  );
  const [streamed, setStreamed] = useState<Record<string, Position>>({});

  useEffect(() => {
    if (!enabled || mode !== "sse") {
      return;
    }

    const source = new EventSource("/api/tracking/stream");
    let lastSeen = Date.now();

    // Qualsevol esdeveniment (posicions, heartbeat o obertura) compta com a senyal de vida.
    const alive = () => {
      lastSeen = Date.now();
    };

    const onPositions = (event: Event) => {
      alive();
      try {
        const data = JSON.parse((event as MessageEvent<string>).data) as {
          positions?: Record<string, Position>;
        };
        setStreamed(data.positions ?? {});
      } catch {
        /* payload no vàlid: s'ignora */
      }
    };

    const fallback = () => {
      source.close();
      setMode("polling");
    };

    source.addEventListener("positions", onPositions);
    source.addEventListener("ping", alive);
    source.onopen = alive;
    source.onerror = () => {
      // CLOSED = error fatal (401, 404, content-type incorrecte); CONNECTING = reintent
      // automàtic, que és el que passa quan el servidor tanca la connexió cada 5 minuts.
      if (source.readyState === EventSource.CLOSED) {
        fallback();
      }
    };

    const watchdog = setInterval(() => {
      if (Date.now() - lastSeen > SSE_STALE_MS) {
        fallback();
      }
    }, SSE_WATCHDOG_MS);

    return () => {
      clearInterval(watchdog);
      source.close();
    };
  }, [enabled, mode]);

  const polled = usePositionPolling({
    enabled: enabled && mode === "polling",
    intervalMs,
  });

  return mode === "sse" ? streamed : polled;
}
