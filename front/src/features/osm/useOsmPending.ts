import { useQuery } from "@tanstack/react-query";
import type { OsmPendingResponse, OsmSyncStats, PendingHidrant } from "@territoriadf/contracts/osm";

import { useAuth } from "@/contexts/AuthContext";
import { apiErrorMessage } from "@/shared/api/client";
import { queryKeys, viewerKey } from "@/shared/query/keys";
import { getOsmPending } from "./api";
import { EMPTY_SYNC_STATS } from "./osmSections";

/**
 * Pendents d'OSM de l'ADF activa. La clau porta el visor («veure com») perquè
 * la resposta en depèn; sense ADF no es demana res.
 */
export function useOsmPending(adfId: number | null): {
  pending: PendingHidrant[];
  stats: OsmSyncStats | null;
  isFetching: boolean;
  loadError: string | null;
} {
  const { user } = useAuth();
  const viewer = viewerKey(user);

  const pendingQuery = useQuery({
    queryKey: queryKeys.osmPending(adfId, viewer),
    queryFn: ({ signal }): Promise<OsmPendingResponse> =>
      adfId === null
        ? Promise.resolve({ pending: [], stats: EMPTY_SYNC_STATS })
        : getOsmPending(adfId, signal),
    enabled: adfId !== null,
  });

  return {
    pending: pendingQuery.data?.pending ?? [],
    stats: pendingQuery.data?.stats ?? null,
    isFetching: pendingQuery.isFetching,
    loadError: pendingQuery.error
      ? apiErrorMessage(pendingQuery.error, "Error carregant canvis pendents")
      : null,
  };
}
