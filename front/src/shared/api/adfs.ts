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

export interface TrackingSharingResult {
  adf_id: number;
  tracking_shared: boolean;
}

/** Comparteix o revoca el tracking de l'ADF (opt-in per a la resta d'ADFs). */
export function setAdfTrackingSharing(
  adfId: number,
  shared: boolean,
): Promise<TrackingSharingResult> {
  return request<TrackingSharingResult>(`/api/adfs/${adfId}/tracking-sharing`, {
    method: "PUT",
    body: { shared },
  });
}

export interface AdfInput {
  nom: string;
  osm_relations: string[];
}

export function createAdf(input: AdfInput & { id: number }): Promise<AdfData> {
  return request<AdfData>("/api/adfs", { method: "POST", body: input });
}

export function updateAdf(adfId: number, input: AdfInput): Promise<AdfData> {
  return request<AdfData>(`/api/adfs/${adfId}`, { method: "PUT", body: input });
}

export async function deleteAdf(adfId: number): Promise<void> {
  await request<unknown>(`/api/adfs/${adfId}`, { method: "DELETE" });
}

/** Recalcula límits, bbox i centre des de les relacions OSM (operació externa lenta). */
export async function recalculateAdfBoundaries(adfId: number): Promise<void> {
  await request<unknown>(`/api/adfs/${adfId}/boundaries`, { method: "POST" });
}
