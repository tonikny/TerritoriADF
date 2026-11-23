// Funcions pures de la feature d'ADFs: llista i frontera geogràfica.
import { ApiError, request } from "./client";

export interface AdfData {
  id: number;
  nom: string;
  osm_relations: string[];
  bbox: [number, number, number, number] | null;
  center: [number, number] | null;
  tracking_shared?: boolean;
}

export function getAdfs(signal?: AbortSignal): Promise<AdfData[]> {
  return request<AdfData[]>("/api/adfs", { signal });
}

/**
 * Frontera de l'ADF en GeoJSON, o `null` si encara no s'ha calculat (404).
 * Qualsevol altre error es propaga.
 */
export async function getAdfBoundary(adfId: number, signal?: AbortSignal): Promise<unknown | null> {
  try {
    return await request<unknown>("/api/adf/boundary", { query: { adf: adfId }, signal });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return null;
    }
    throw err;
  }
}
