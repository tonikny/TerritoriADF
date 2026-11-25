// Lectures del catàleg d'ADFs que fa la closca (`AdfContext`): la llista per al
// selector i la frontera per al mapa. No viuen a `features/adfs/api.ts` perquè
// `contexts/` no pot dependre de cap feature (fronteres d'ESLint) i les
// escriptures d'ADF, en canvi, només les fa la seva feature.
import type { Adf, AdfBoundaryFeature } from "@territoriadf/contracts/adfs";

import { ApiError, request } from "./client";

// Sense `signal`: la llista és global i no depèn de l'ADF, així que no s'ha de
// cancel·lar en desmuntar (StrictMode la tornaria a demanar).
export function getAdfs(): Promise<Adf[]> {
  return request<Adf[]>("/api/adfs");
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
