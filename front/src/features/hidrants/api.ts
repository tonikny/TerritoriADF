// Funcions pures de la feature d'hidrants: només URL, mètode i forma de les
// dades. L'estat (caché, càrrega, errors) el gestiona TanStack Query a
// `features/hidrants/useHidrantData.ts`.
import type {
  HidrantFeature,
  HidrantServiceTags,
  HidrantUiFields,
} from "@territoriadf/contracts/hidrants";

import { request } from "@/shared/api/client";

export interface HidrantCreateInput {
  lat: number;
  lon: number;
  ui_fields?: HidrantUiFields;
  service_tags?: HidrantServiceTags;
}

export interface HidrantUpdateInput {
  lat?: number;
  lon?: number;
  ui_fields?: HidrantUiFields;
  service_tags?: HidrantServiceTags;
}

/**
 * Hidrants d'una ADF en GeoJSON. La resposta canvia amb la sessió (els tags de
 * servei només surten amb sessió iniciada), per això qui crida ha d'incloure el
 * visor a la clau de caché.
 */
export async function getHidrants(adfId: number, signal?: AbortSignal): Promise<HidrantFeature[]> {
  const data = await request<{ features?: HidrantFeature[] }>("/api/hidrants", {
    query: { adf: adfId },
    signal,
  });
  return data.features ?? [];
}

export function createHidrant(adfId: number, input: HidrantCreateInput): Promise<{ id: string }> {
  return request<{ id: string }>("/api/hidrants", {
    method: "POST",
    query: { adf: adfId },
    body: input,
  });
}

export async function updateHidrant(
  id: string,
  adfId: number,
  input: HidrantUpdateInput,
): Promise<void> {
  await request<unknown>(`/api/hidrants/${encodeURIComponent(id)}`, {
    method: "PUT",
    query: { adf: adfId },
    body: input,
  });
}

export async function deleteHidrant(id: string, adfId: number): Promise<void> {
  await request<unknown>(`/api/hidrants/${encodeURIComponent(id)}`, {
    method: "DELETE",
    query: { adf: adfId },
  });
}
