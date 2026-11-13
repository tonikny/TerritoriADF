import { useState, useEffect, useCallback } from "react";
import { useAdf } from "../contexts/AdfContext";
import { markDataSynced } from "../utils/offlineData";
import type { IncidenciaFeature, Incidencia, IncidenciaEvent } from "../types";

export function useIncidencies() {
  const { activeAdf } = useAdf();
  const [features, setFeatures] = useState<IncidenciaFeature[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchIncidencies = useCallback(async () => {
    if (!activeAdf) {
      setFeatures([]);
      return;
    }
    try {
      setLoading(true);
      const response = await fetch(`/api/incidencies?adf=${activeAdf.id}`);
      if (!response.ok) {
        throw new Error("Error al carregar incidències");
      }
      const data = await response.json();
      setFeatures(data.features || []);
      setError(null);
      markDataSynced(activeAdf.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconegut");
    } finally {
      setLoading(false);
    }
  }, [activeAdf]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- càrrega asíncrona legítima
    void fetchIncidencies();
  }, [fetchIncidencies]);

  const getIncidencia = async (id: string): Promise<Incidencia & { events: IncidenciaEvent[] }> => {
    const response = await fetch(`/api/incidencies/${id}`);
    if (!response.ok) {
      throw new Error("Error al carregar el detall de la incidència");
    }
    return response.json();
  };

  const createIncidencia = async (data: {
    titol: string;
    tipus: string;
    prioritat: string;
    precisio?: string;
    visibilitat?: string;
    lat: number;
    lon: number;
    comentari: string;
  }) => {
    const response = await fetch("/api/incidencies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, adf_id: activeAdf?.id }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Error al crear la incidència");
    }
    const result = await response.json();
    void fetchIncidencies(); // Recarregar llista
    return result;
  };

  const addEvent = async (
    incidenciaId: string,
    tipusEvent: string,
    dades: Record<string, unknown>,
  ) => {
    const response = await fetch(`/api/incidencies/${incidenciaId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipus_event: tipusEvent, dades }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error || "Error al afegir l'esdeveniment");
    }
    const result = await response.json();
    void fetchIncidencies(); // Recarregar llista per actualitzar estat denormalitzat
    return result;
  };

  return {
    features,
    loading,
    error,
    refresh: fetchIncidencies,
    getIncidencia,
    createIncidencia,
    addEvent,
  };
}
