import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import type { HidrantFeature } from "@territoriadf/contracts/hidrants";

import { useAdf } from "@/contexts/AdfContext";
import { useAuth } from "@/contexts/AuthContext";
import { apiErrorMessage } from "@/shared/api/client";
import { getHidrants } from "@/shared/api/hidrants";
import { queryKeys, viewerKey } from "@/shared/query/keys";
import { markDataSynced } from "@/utils/offlineData";

// La forma del GeoJSON ve del contracte compartit amb el backend.
export type { HidrantFeature };

/**
 * Hidrants de l'ADF activa.
 *
 * La clau de caché inclou l'id de l'ADF i el visor: en canviar d'ADF es fa una
 * altra consulta i la resposta lenta de l'anterior es queda a la seva entrada,
 * així que no pot trepitjar la de l'ADF actual. Les dades de l'ADF anterior no
 * es conserven com a `placeholder`: ensenyar hidrants d'una altra ADF (encara
 * que sigui un instant) és pitjor que ensenyar el mapa buit.
 */
export function useHidrantData() {
  const { activeAdf } = useAdf();
  const { user } = useAuth();
  const adfId = activeAdf?.id ?? null;
  const viewer = viewerKey(user);

  const query = useQuery({
    queryKey: queryKeys.hidrants(adfId, viewer),
    queryFn: ({ signal }) => (adfId === null ? Promise.resolve([]) : getHidrants(adfId, signal)),
    enabled: adfId !== null,
  });

  // Marca de frescor per a l'avís offline: només compta si la resposta ve de xarxa.
  useEffect(() => {
    if (adfId !== null && query.data) {
      markDataSynced(adfId);
    }
  }, [adfId, query.data]);

  return {
    features: adfId === null ? [] : (query.data ?? []),
    loading: adfId !== null && query.isFetching,
    // `loaded` vol dir que la primera càrrega d'aquesta ADF ja ha acabat (bé o malament).
    loaded: adfId !== null && !query.isPending,
    error: query.error ? apiErrorMessage(query.error, "Error desconegut") : null,
  };
}
