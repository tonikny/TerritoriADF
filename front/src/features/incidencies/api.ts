// Funcions pures de la feature d'incidències. Els enums de text (tipus
// d'incidència, estats, tipus d'esdeveniment) els valida el Zod del backend;
// les dades que en tornen sí que van tipades pel contracte compartit.
import type {
  Incidencia,
  IncidenciaEvent,
  IncidenciaFeature,
} from "@territoriadf/contracts/incidencies";

import { request } from "@/shared/api/client";

export interface CreateIncidenciaInput {
  titol: string;
  tipus: string;
  prioritat?: string;
  precisio?: string;
  visibilitat?: string;
  lat: number;
  lon: number;
  comentari: string;
  adf_id?: number;
}

/** Incidències visibles per al visor actual (la visibilitat depèn de la sessió). */
export async function getIncidencies(
  adfId: number,
  signal?: AbortSignal,
): Promise<IncidenciaFeature[]> {
  const data = await request<{ features?: IncidenciaFeature[] }>("/api/incidencies", {
    query: { adf: adfId },
    signal,
  });
  return data.features ?? [];
}

export function getIncidencia(
  id: string,
  signal?: AbortSignal,
): Promise<Incidencia & { events: IncidenciaEvent[] }> {
  return request<Incidencia & { events: IncidenciaEvent[] }>(
    `/api/incidencies/${encodeURIComponent(id)}`,
    { signal },
  );
}

export function createIncidencia(input: CreateIncidenciaInput): Promise<Incidencia> {
  return request<Incidencia>("/api/incidencies", { method: "POST", body: input });
}

export function addIncidenciaEvent(
  incidenciaId: string,
  tipusEvent: string,
  dades: Record<string, unknown>,
): Promise<IncidenciaEvent> {
  return request<IncidenciaEvent>(`/api/incidencies/${encodeURIComponent(incidenciaId)}/events`, {
    method: "POST",
    body: { tipus_event: tipusEvent, dades },
  });
}
