// Escriptures de la feature d'ADFs: alta, edició, esborrat i recalcul de límits.
// Les lectures del catàleg (llista i frontera) no són aquí: les fa `AdfContext`,
// que és la closca i no pot dependre d'una feature. Viuen a `shared/api/adfs.ts`.
import type { Adf, AdfBoundariesResult, AdfInput } from "@territoriadf/contracts/adfs";

import { request } from "@/shared/api/client";

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
export function recalculateAdfBoundaries(adfId: number): Promise<AdfBoundariesResult> {
  return request<AdfBoundariesResult>(`/api/adfs/${adfId}/boundaries`, { method: "POST" });
}
