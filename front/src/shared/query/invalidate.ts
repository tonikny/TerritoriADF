import type { QueryClient } from "@tanstack/react-query";

import { osmPendingKeyPrefix, queryKeys } from "./keys";

/**
 * Què queda vell quan es crea, edita, mou o esborra un hidrant: els pendents
 * d'OSM, perquè l'estat de sync pot passar de SYNCED a PENDING_*.
 */
export async function invalidateOsmPending(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: osmPendingKeyPrefix });
}

/**
 * Què queda vell quan canvia un hidrant: la seva llista (per ADF i visor) i els
 * pendents d'OSM. Viu aquí perquè també la fan servir les mutacions d'OSM, que
 * no poden dependre de la feature d'hidrants.
 */
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
