// Funcions pures de la feature d'ADFs: llista i frontera geogràfica.
import type {
  Adf,
  AdfBoundaryFeature,
  AdfInput,
  TrackingSharingResult,
} from "@territoriadf/contracts/adfs";
import { ApiError, request } from "./client";

export function getAdfs(signal?: AbortSignal): Promise<Adf[]> {
  return request<Adf[]>("/api/adfs", { signal });
}

/**
 * Frontera de l'ADF en GeoJSON, o `null` si encara no s'ha calculat (404).
 * Qualsevol altre error es propaga.
 */
export async function getAdfBoundary(
  adfId: number,
  signal?: AbortSignal,
): Promise<AdfBoundaryFeature | null> {
  try {
    return await request<AdfBoundaryFeature>("/api/adf/boundary", {
      query: { adf: adfId },
      signal,
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return null;
    }
    throw err;
  }
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

export function createAdf(input: AdfInput & { id: number }): Promise<Adf> {
  return request<Adf>("/api/adfs", { method: "POST", body: input });
}

export function updateAdf(adfId: number, input: AdfInput): Promise<Adf> {
  return request<Adf>(`/api/adfs/${adfId}`, { method: "PUT", body: input });
}

export async function deleteAdf(adfId: number): Promise<void> {
  await request<unknown>(`/api/adfs/${adfId}`, { method: "DELETE" });
}

/** Recalcula límits, bbox i centre des de les relacions OSM (operació externa lenta). */
export async function recalculateAdfBoundaries(adfId: number): Promise<void> {
  await request<unknown>(`/api/adfs/${adfId}/boundaries`, { method: "POST" });
}
