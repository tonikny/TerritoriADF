import type { Position } from "@territoriadf/contracts/tracking";
import { useEffect, useMemo, useState } from "react";

/** Es considera connectat qui ha publicat posició en els últims 15 minuts. */
const CONNECTED_MS = 15 * 60 * 1000;

/** Usuaris amb posició recent, del més nou al més antic. Es refresca sol. */
export function useConnectedUsers(positions: Record<string, Position>) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  return useMemo(() => {
    return Object.entries(positions)
      .map(([username, pos]) => ({ username, ts: pos.receivedAt || pos.timestamp }))
      .filter((p) => now - p.ts < CONNECTED_MS)
      .sort((a, b) => b.ts - a.ts);
  }, [positions, now]);
}
