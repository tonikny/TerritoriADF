// Funcions pures de la feature de tracking OwnTracks. El stream SSE
// (`EventSource`) no passa per aquí: no és una petició `fetch`.
import type { TrackingSharingResult } from "@territoriadf/contracts/adfs";
import type { OtrcConfig, Position, TrackingStatus } from "@territoriadf/contracts/tracking";

import { request } from "@/shared/api/client";

export function getTrackingStatus(signal?: AbortSignal): Promise<TrackingStatus> {
  return request<TrackingStatus>("/api/tracking/status", { signal });
}

/** Activa OwnTracks i retorna la configuració generada (credencials noves). */
export function enableTracking(): Promise<OtrcConfig> {
  return request<OtrcConfig>("/api/tracking/enable", { method: "POST" });
}

/** Credencials desades, o error si OwnTracks no està activat. */
export function getTrackingConfig(): Promise<OtrcConfig> {
  // Conté la contrasenya MQTT: mai de caché.
  return request<OtrcConfig>("/api/tracking/config", { cache: "no-store" });
}

/** Posicions visibles per al visor actual (depèn del rol i de l'ADF). */
export async function getTrackingPositions(
  signal?: AbortSignal,
): Promise<Record<string, Position>> {
  const data = await request<{ positions?: Record<string, Position> }>("/api/tracking/positions", {
    signal,
    cache: "no-store",
  });
  return data.positions ?? {};
}

/**
 * Comparteix o revoca el tracking de l'ADF (opt-in per a la resta d'ADFs).
 * La ruta penja de `/api/adfs`, però és una acció de tracking i només la fa
 * servir aquesta feature.
 */
export function setAdfTrackingSharing(
  adfId: number,
  shared: boolean,
): Promise<TrackingSharingResult> {
  return request<TrackingSharingResult>(`/api/adfs/${adfId}/tracking-sharing`, {
    method: "PUT",
    body: { shared },
  });
}
