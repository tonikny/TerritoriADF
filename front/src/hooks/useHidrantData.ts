import { apiFetch } from "../utils/api";
import { useState, useEffect, useCallback, useRef } from "react";
import { useAdf } from "../contexts/AdfContext";
import { markDataSynced } from "../utils/offlineData";
import type { HidrantFeature } from "@territoriadf/contracts/hidrants";

// La forma del GeoJSON ve del contracte compartit amb el backend.
export type { HidrantFeature };

export function useHidrantData() {
  const { activeAdf } = useAdf();
  const [features, setFeatures] = useState<HidrantFeature[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const loadedAdfIdRef = useRef<number | null>(null);

  const fetchData = useCallback(async (): Promise<void> => {
    const adfId = activeAdf?.id ?? null;
    if (adfId === null) {
      requestIdRef.current += 1;
      loadedAdfIdRef.current = null;
      setFeatures([]);
      setError(null);
      setLoading(false);
      setLoaded(false);
      return;
    }

    // En canviar d'ADF buidem les dades de l'anterior: si la petició nova falla,
    // no s'han de veure els hidrants d'una altra ADF.
    if (loadedAdfIdRef.current !== adfId) {
      loadedAdfIdRef.current = adfId;
      setFeatures([]);
      setError(null);
      setLoaded(false);
    }

    const requestId = ++requestIdRef.current;
    try {
      setLoading(true);
      // Sense cache-buster: la URL ha de ser estable perquè el service worker
      // pugui servir la còpia quan no hi hagi xarxa.
      const response = await apiFetch(`/api/hidrants?adf=${adfId}`);
      if (!response.ok) {
        throw new Error("Error al carregar hidrants");
      }
      const data = await response.json();

      // Ignorem respostes antigues si mentrestant s'ha canviat d'ADF o refrescat
      if (requestId !== requestIdRef.current) {
        return;
      }
      setFeatures(data.features || []);
      setError(null);
      markDataSynced(adfId);
    } catch (err) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      setFeatures([]);
      setError(err instanceof Error ? err.message : "Error desconegut");
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
        setLoaded(true);
      }
    }
  }, [activeAdf]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- càrrega asíncrona legítima
    void fetchData();
  }, [fetchData]);

  return { features, loading, loaded, error, mutate: fetchData };
}
