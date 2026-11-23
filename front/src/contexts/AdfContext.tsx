import type { ReactNode } from "react";
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "./AuthContext";
import { adfLabel } from "../utils/adfLabel";
import { getQueryParam, setAdfUrlParam, setNodeUrlParam } from "../utils/urlParams";
import { APP_NAME } from "../utils/appInfo";
import { getAdfs, getAdfBoundary, type AdfData } from "../shared/api/adfs";
import { queryKeys } from "../shared/query/keys";

export type { AdfData };

interface AdfContextType {
  activeAdf: AdfData | null;
  setActiveAdf: (adf: AdfData | null) => void;
  adfs: AdfData[];
  isLoading: boolean;
  error: string | null;
  boundaryGeojson: string | null;
  refreshAdfs: () => Promise<AdfData[]>;
}

const AdfContext = createContext<AdfContextType | undefined>(undefined);

export const AdfProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { user, setActiveAdfId: setAuthActiveAdfId } = useAuth();
  const queryClient = useQueryClient();
  const [activeAdf, setActiveAdfState] = useState<AdfData | null>(null);

  const setActiveAdf = useCallback(
    (adf: AdfData | null) => {
      setActiveAdfState(adf);
      if (adf) {
        localStorage.setItem("active_adf_id", adf.id.toString());
        document.title = `${APP_NAME} - ${adfLabel(adf.id, adf.nom)}`;
        setAdfUrlParam(adf.id);
      } else {
        localStorage.removeItem("active_adf_id");
        document.title = `${APP_NAME} - Mapa d'hidrants`;
        setAdfUrlParam(null);
        setNodeUrlParam(null);
      }
      setAuthActiveAdfId(adf?.id ?? null);
    },
    [setAuthActiveAdfId],
  );

  const adfsQuery = useQuery({
    queryKey: queryKeys.adfs,
    queryFn: ({ signal }) => getAdfs(signal),
  });
  const adfs = useMemo(() => adfsQuery.data ?? [], [adfsQuery.data]);

  /** Torna a carregar la llista d'ADFs (després de crear, editar o eliminar-ne una). */
  const refreshAdfs = useCallback(async (): Promise<AdfData[]> => {
    return queryClient.fetchQuery({
      queryKey: queryKeys.adfs,
      queryFn: ({ signal }) => getAdfs(signal),
      staleTime: 0,
    });
  }, [queryClient]);

  // Triar l'ADF inicial quan arriba la llista: URL > preferència desada > ADF de l'usuari.
  // La tria no es pot fer al render perquè també escriu la URL i `localStorage`.
  useEffect(() => {
    if (!adfsQuery.data) {
      return;
    }
    /* eslint-disable react-hooks/set-state-in-effect -- selecció inicial sobre dades asíncrones */
    const data = adfsQuery.data;
    const urlAdfId = getQueryParam("adf");

    // Prioritat 0: Paràmetre ADF a la URL
    if (urlAdfId) {
      const urlAdf = data.find((a) => a.id === Number(urlAdfId));
      if (urlAdf) {
        setActiveAdf(urlAdf);
        return;
      }
    }

    // Prioritat 1: Recuperar de localStorage (el que l'usuari estava veient realment)
    const savedAdfId = localStorage.getItem("active_adf_id");
    if (savedAdfId) {
      const savedAdf = data.find((a) => a.id === Number(savedAdfId));
      if (savedAdf) {
        setActiveAdf(savedAdf);
        return;
      }
    }

    // Prioritat 2: ADF de l'usuari si té ADF assignada (només si no hi ha res guardat)
    if (user && user.role !== "admin" && user.adf_id) {
      const userAdf = data.find((a) => a.id === user.adf_id);
      if (userAdf) {
        setActiveAdf(userAdf);
        return;
      }
    }

    // Si teníem un adf a la URL però no era vàlid, el netegem
    if (urlAdfId) {
      setActiveAdf(null);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [adfsQuery.data, user, setActiveAdf]);

  // La frontera va per clau d'ADF: en canviar d'ADF la consulta és una altra i la
  // resposta de l'anterior no es pot pintar mai com si fos l'actual.
  const boundaryQuery = useQuery({
    queryKey: queryKeys.adfBoundary(activeAdf?.id ?? null),
    queryFn: ({ signal }) =>
      activeAdf === null ? Promise.resolve(null) : getAdfBoundary(activeAdf.id, signal),
    enabled: activeAdf !== null,
  });

  const boundaryGeojson = useMemo(
    () => (activeAdf && boundaryQuery.data ? JSON.stringify(boundaryQuery.data) : null),
    [activeAdf, boundaryQuery.data],
  );

  const value = useMemo(
    () => ({
      activeAdf,
      setActiveAdf,
      adfs,
      isLoading: adfsQuery.isPending,
      error: adfsQuery.error
        ? adfsQuery.error instanceof Error
          ? adfsQuery.error.message
          : "Error carregant ADFs"
        : null,
      boundaryGeojson,
      refreshAdfs,
    }),
    [
      activeAdf,
      setActiveAdf,
      adfs,
      adfsQuery.isPending,
      adfsQuery.error,
      boundaryGeojson,
      refreshAdfs,
    ],
  );

  return <AdfContext.Provider value={value}>{children}</AdfContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components -- el hook ha de viure amb el context (patró canònic React)
export const useAdf = () => {
  const context = useContext(AdfContext);
  if (context === undefined) {
    throw new Error("useAdf must be used within an AdfProvider");
  }
  return context;
};
