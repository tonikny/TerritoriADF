import type { ReactNode } from "react";
import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from "react";
import { useAuth } from "./AuthContext";
import { adfLabel } from "../utils/adfLabel";
import { getQueryParam, setAdfUrlParam, setNodeUrlParam } from "../utils/urlParams";
import { APP_NAME } from "../utils/appInfo";

export interface AdfData {
  id: number;
  nom: string;
  osm_relations: string[];
  bbox: [number, number, number, number] | null;
  center: [number, number] | null;
  tracking_shared?: boolean;
}

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
  const [activeAdf, setActiveAdfState] = useState<AdfData | null>(null);
  const [adfs, setAdfs] = useState<AdfData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [boundaryGeojsonRaw, setBoundaryGeojsonRaw] = useState<string | null>(null);

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

  /** Torna a carregar la llista d'ADFs (després de crear, editar o eliminar-ne una). */
  const refreshAdfs = useCallback(async () => {
    const response = await fetch("/api/adfs");
    if (!response.ok) {
      throw new Error("Error carregant ADFs");
    }
    const data = (await response.json()) as AdfData[];
    setAdfs(data);
    return data;
  }, []);

  // Carregar llista d'ADFs inicial
  useEffect(() => {
    const fetchAdfs = async () => {
      try {
        setIsLoading(true);
        const response = await fetch("/api/adfs");
        if (!response.ok) {
          throw new Error("Error carregant ADFs");
        }
        const data = await response.json();
        setAdfs(data);

        const urlAdfId = getQueryParam("adf");

        // Prioritat 0: Paràmetre ADF a la URL
        if (urlAdfId) {
          const urlAdf = data.find((a: AdfData) => a.id === Number(urlAdfId));
          if (urlAdf) {
            setActiveAdf(urlAdf);
            return;
          }
        }

        // Prioritat 1: Recuperar de localStorage (el que l'usuari estava veient realment)
        const savedAdfId = localStorage.getItem("active_adf_id");
        if (savedAdfId) {
          const savedAdf = data.find((a: AdfData) => a.id === Number(savedAdfId));
          if (savedAdf) {
            setActiveAdf(savedAdf);
            return;
          }
        }

        // Prioritat 2: ADF de l'usuari si té ADF assignada (només si no hi ha res guardat)
        if (user && user.role !== "admin" && user.adf_id) {
          const userAdf = data.find((a: AdfData) => a.id === user.adf_id);
          if (userAdf) {
            setActiveAdf(userAdf);
            return;
          }
        }

        // Si teníem un adf a la URL però no era vàlid, el netegem
        if (urlAdfId) {
          setActiveAdf(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setIsLoading(false);
      }
    };
    void fetchAdfs();
  }, [user, setActiveAdf]);

  useEffect(() => {
    if (!activeAdf) {
      return;
    }
    void fetch(`/api/adf/boundary?adf=${activeAdf.id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((gj) => setBoundaryGeojsonRaw(gj ? JSON.stringify(gj) : null))
      .catch(() => setBoundaryGeojsonRaw(null));
  }, [activeAdf]);

  const boundaryGeojson = activeAdf ? boundaryGeojsonRaw : null;

  const value = useMemo(
    () => ({ activeAdf, setActiveAdf, adfs, isLoading, error, boundaryGeojson, refreshAdfs }),
    [activeAdf, setActiveAdf, adfs, isLoading, error, boundaryGeojson, refreshAdfs],
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
