import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useAdf } from "@/contexts/AdfContext";
import { useAuth } from "@/contexts/AuthContext";
import { invalidateHidrantQueries } from "@/features/hidrants/mutations";
import {
  discardOsmChanges,
  pullHydrantFromOsm,
  purgeMissingFromOsm,
  pushToOsm,
  syncAdfFromOsm,
} from "@/shared/api/osm";
import { viewerKey } from "@/shared/query/keys";

/**
 * Accions d'OSM: canvien hidrants i el seu estat de sync, així que invaliden la
 * llista d'hidrants de l'ADF i els pendents. Els components no han de refrescar
 * res a mà.
 */
export function useOsmMutations() {
  const queryClient = useQueryClient();
  const { activeAdf } = useAdf();
  const { user } = useAuth();
  const adfId = activeAdf?.id ?? null;
  const viewer = viewerKey(user);

  const invalidate = () => invalidateHidrantQueries(queryClient, adfId, viewer);

  const push = useMutation({ mutationFn: pushToOsm, onSuccess: invalidate });
  const discard = useMutation({ mutationFn: discardOsmChanges, onSuccess: invalidate });
  const pull = useMutation({ mutationFn: pullHydrantFromOsm, onSuccess: invalidate });
  const purge = useMutation({
    mutationFn: (ids?: string[]) => purgeMissingFromOsm(adfId!, ids),
    onSuccess: invalidate,
  });
  const pullSync = useMutation({
    mutationFn: () => syncAdfFromOsm(adfId!),
    onSuccess: invalidate,
  });

  return {
    push,
    discard,
    pull,
    purge,
    pullSync,
    isPending:
      push.isPending ||
      discard.isPending ||
      pull.isPending ||
      purge.isPending ||
      pullSync.isPending,
  };
}
