import { useEffect, useState } from "react";

import { logError } from "@/utils/log";
import { getOsmDiff } from "./api";
import { buildDiffFromConflict, diffFromBackend, type DiffData, type SyncError } from "./osmDiff";
import type { SyncStatus } from "./syncBadge";

/**
 * Diff del hidrant amb OSM. Si l'estat és CONFLICT ja el tenim a `sync_error`
 * (el va desar el pull); per a la resta d'estats no sincronitzats amb node a
 * OSM es demana a `GET /api/osm/diff/:id`.
 */
export function useHidrantDiff({
  id,
  syncStatus,
  syncError,
  osmId,
}: {
  id: string;
  syncStatus: SyncStatus;
  syncError: SyncError;
  osmId?: number | null;
}): { diff: DiffData | null; diffLoading: boolean } {
  const [diffState, setDiffState] = useState<DiffData | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  const conflictDiff = syncStatus === "CONFLICT" ? buildDiffFromConflict(syncError) : null;

  useEffect(() => {
    if (syncStatus === "CONFLICT" || syncStatus === "SYNCED" || !osmId || osmId <= 0) {
      return;
    }
    let cancelled = false;
    const load = async () => {
      setDiffLoading(true);
      try {
        const backendDiff = await getOsmDiff(id);
        if (cancelled) {
          return;
        }
        setDiffState(backendDiff ? diffFromBackend(backendDiff) : null);
      } catch (err) {
        logError("Error carregant diff OSM", err);
      } finally {
        if (!cancelled) {
          setDiffLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [id, syncStatus, osmId]);

  return { diff: conflictDiff ?? diffState, diffLoading };
}
