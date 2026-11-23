import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { useAdf } from "@/contexts/AdfContext";
import { useAuth } from "@/contexts/AuthContext";
import { createHidrant, type HidrantCreateInput } from "@/shared/api/hidrants";
import { invalidateOsmPending } from "@/shared/query/invalidate";
import { queryKeys, viewerKey } from "@/shared/query/keys";

/** Què queda vell quan canvia un hidrant: la seva llista i els pendents d'OSM. */
export async function invalidateHidrantQueries(
  queryClient: QueryClient,
  adfId: number | null,
  viewer: string,
): Promise<void> {
  await Promise.all([
    adfId === null
      ? Promise.resolve()
      : queryClient.invalidateQueries({ queryKey: queryKeys.hidrants(adfId, viewer) }),
    invalidateOsmPending(queryClient),
  ]);
}

export function useCreateHidrant() {
  const queryClient = useQueryClient();
  const { activeAdf } = useAdf();
  const { user } = useAuth();
  const adfId = activeAdf?.id ?? null;
  const viewer = viewerKey(user);

  return useMutation({
    mutationFn: (input: HidrantCreateInput) => createHidrant(adfId!, input),
    onSuccess: () => invalidateHidrantQueries(queryClient, adfId, viewer),
  });
}
