import { QueryClient } from "@tanstack/react-query";

import { ApiError } from "../api/client";

/**
 * Client de caché de l'aplicació.
 *
 * - `staleTime` de 30 s: les dades d'una ADF canvien poc i les remuntades de
 *   panell no han de tornar a demanar-ho tot; les mutacions invaliden a posta.
 * - Els errors 4xx no es reintenten (un 403 o un 404 no es arregla repetint-lo).
 * - `refetchOnWindowFocus` desactivat: al camp, tornar a l'app no ha de generar
 *   trànsit per cada canvi de pestanya del mòbil.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) =>
        !(error instanceof ApiError && error.status >= 400 && error.status < 500) &&
        failureCount < 2,
    },
  },
});
