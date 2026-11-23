import type { QueryClient } from "@tanstack/react-query";

import { queryKeyPrefix } from "./keys";

/**
 * Què queda vell quan es crea, edita, mou o esborra un hidrant: la llista de
 * l'ADF (i la de qualsevol visor) i els pendents d'OSM, perquè l'estat de sync
 * pot passar de SYNCED a PENDING_UPDATE/CREATE/DELETE.
 */
export async function invalidateHidrantData(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeyPrefix.hidrants }),
    queryClient.invalidateQueries({ queryKey: queryKeyPrefix.osmPending }),
  ]);
}
