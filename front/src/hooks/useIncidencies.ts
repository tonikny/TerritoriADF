import { useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAdf } from "../contexts/AdfContext";
import { useAuth } from "../contexts/AuthContext";
import { apiErrorMessage } from "../shared/api/client";
import {
  addIncidenciaEvent,
  createIncidencia as createIncidenciaRequest,
  getIncidencia as getIncidenciaRequest,
  getIncidencies,
  type CreateIncidenciaInput,
} from "../shared/api/incidencies";
import { queryKeys, viewerKey } from "../shared/query/keys";
import { markDataSynced } from "../utils/offlineData";

/**
 * Incidències de l'ADF activa i les seves mutacions.
 *
 * Abans, canviar d'ADF mentre volava una petició podia deixar a la pantalla les
 * incidències de l'ADF anterior. Ara la clau de caché porta l'ADF (i el visor),
 * de manera que cada resposta cau a la seva entrada i només es llegeix la de
 * l'ADF activa. Les mutacions invaliden la llista i el detall tocats.
 */
export function useIncidencies() {
  const { activeAdf } = useAdf();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const adfId = activeAdf?.id ?? null;
  const viewer = viewerKey(user);

  const listQuery = useQuery({
    queryKey: queryKeys.incidencies(adfId, viewer),
    queryFn: ({ signal }) => (adfId === null ? Promise.resolve([]) : getIncidencies(adfId, signal)),
    enabled: adfId !== null,
  });

  useEffect(() => {
    if (adfId !== null && listQuery.data) {
      markDataSynced(adfId);
    }
  }, [adfId, listQuery.data]);

  const refresh = useCallback(async (): Promise<void> => {
    if (adfId === null) {
      return;
    }
    await queryClient.invalidateQueries({ queryKey: queryKeys.incidencies(adfId, viewer) });
  }, [adfId, viewer, queryClient]);

  const getIncidencia = useCallback(
    (id: string) =>
      queryClient.fetchQuery({
        queryKey: queryKeys.incidencia(id, adfId, viewer),
        queryFn: ({ signal }) => getIncidenciaRequest(id, signal),
        // El detall inclou l'historial: sempre es vol la versió més nova.
        staleTime: 0,
      }),
    [adfId, queryClient, viewer],
  );

  const createIncidencia = useCallback(
    async (data: CreateIncidenciaInput) => {
      const result = await createIncidenciaRequest({
        ...data,
        adf_id: data.adf_id ?? adfId ?? undefined,
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.incidencies(adfId, viewer) });
      return result;
    },
    [adfId, viewer, queryClient],
  );

  const addEvent = useCallback(
    async (incidenciaId: string, tipusEvent: string, dades: Record<string, unknown>) => {
      const result = await addIncidenciaEvent(incidenciaId, tipusEvent, dades);
      // La llista porta l'estat denormalitzat i el detall porta l'historial: tots dos queden vells.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.incidencia(incidenciaId, adfId, viewer),
        }),
        queryClient.invalidateQueries({ queryKey: queryKeys.incidencies(adfId, viewer) }),
      ]);
      return result;
    },
    [adfId, viewer, queryClient],
  );

  return {
    features: adfId === null ? [] : (listQuery.data ?? []),
    loading: adfId !== null && listQuery.isFetching,
    error: listQuery.error ? apiErrorMessage(listQuery.error, "Error desconegut") : null,
    refresh,
    getIncidencia,
    createIncidencia,
    addEvent,
  };
}
