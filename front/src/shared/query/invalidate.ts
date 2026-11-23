import type { QueryClient } from "@tanstack/react-query";

import { osmPendingKeyPrefix } from "./keys";

/**
 * Què queda vell quan es crea, edita, mou o esborra un hidrant: els pendents
 * d'OSM, perquè l'estat de sync pot passar de SYNCED a PENDING_*.
 *
 * La llista d'hidrants s'invalida al costat (`invalidateHidrantQueries`), perquè
 * depèn de l'ADF i del visor; així cada mutació declara tot el que deixa vell.
 */
export async function invalidateOsmPending(queryClient: QueryClient): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: osmPendingKeyPrefix });
}
