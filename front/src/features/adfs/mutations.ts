import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Adf, AdfInput } from "@territoriadf/contracts/adfs";

import { createAdf, deleteAdf, recalculateAdfBoundaries, updateAdf } from "./api";
import { queryKeys } from "@/shared/query/keys";

/**
 * Mutacions d'ADF. Mantenen la llista de la caché al dia amb la resposta del
 * servidor: crear o editar una ADF no torna a demanar `GET /api/adfs`, i el
 * recalcul de límits només actualitza `bbox`/`center` de l'ADF afectada.
 */
export function useAdfMutations() {
  const queryClient = useQueryClient();

  const writeList = (update: (list: Adf[]) => Adf[]) => {
    queryClient.setQueryData(queryKeys.adfs, (list: Adf[] | undefined) =>
      list ? update(list) : list,
    );
  };

  const upsert = (adf: Adf) => {
    writeList((list) =>
      list.some((a) => a.id === adf.id)
        ? list.map((a) => (a.id === adf.id ? adf : a))
        : [...list, adf],
    );
  };

  const create = useMutation({
    mutationFn: (input: AdfInput & { id: number }) => createAdf(input),
    onSuccess: upsert,
  });

  const update = useMutation({
    mutationFn: ({ adfId, input }: { adfId: number; input: AdfInput }) => updateAdf(adfId, input),
    onSuccess: upsert,
  });

  const remove = useMutation({
    mutationFn: (adfId: number) => deleteAdf(adfId),
    onSuccess: (_deleted, adfId) => {
      writeList((list) => list.filter((a) => a.id !== adfId));
    },
  });

  const recalculate = useMutation({
    mutationFn: async (adfId: number) => {
      const { bbox, center } = await recalculateAdfBoundaries(adfId);
      // La frontera ha canviat: la consulta que la pinta ha de tornar a demanar-la.
      await queryClient.invalidateQueries({ queryKey: queryKeys.adfBoundary(adfId) });
      writeList((list) => list.map((a) => (a.id === adfId ? { ...a, bbox, center } : a)));
      return queryClient.getQueryData<Adf[]>(queryKeys.adfs)?.find((a) => a.id === adfId) ?? null;
    },
  });

  return { create, update, remove, recalculate };
}
