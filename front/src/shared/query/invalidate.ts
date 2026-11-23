import type { QueryClient } from "@tanstack/react-query";

import { osmPendingKeyPrefix } from "./keys";

/**
 * Què queda vell quan es crea, edita, mou o esborra un hidrant: els pendents
 * d'OSM, perquè l'estat de sync pot passar de SYNCED a PENDING_*.
 *
 * La llista d'hidrants NO s'invalida aquí: cada mutació ja la refresca pel seu
 * camí (`refreshHidrants`), i fer-ho als dos llocs provocava dos refetch per
 * operació.
 */
export async function invalidateOsmPending(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: osmPendingKeyPrefix });
}
