// Accés a l'API pròpia: totes les crides a `/api/*` passen per aquí.
//
// La injecció de les capçaleres del mode "veure com" viu ara a
// `shared/api/client.ts`, que també ofereix `request<T>()` per a les crides
// tipades. Aquest mòdul es queda per als llocs que encara treballen amb el
// `Response` cru; el codi nou ha d'usar `request` i un mòdul de feature.
import { getViewAsHeaders, rawRequest } from "../shared/api/client";

export { getViewAsHeaders };

/** `fetch` amb les capçaleres de "veure com". Mateixa signatura que `fetch`. */
export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return rawRequest(input, init);
}
