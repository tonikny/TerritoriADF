// Funcions pures de la feature de tracking OwnTracks. El stream SSE
// (`EventSource`) no passa per aquí: no és una petició `fetch`.
import { request } from "./client";

/** Posició OwnTracks tal com la serveix `GET /api/tracking/positions`. */
export interface Position {
  lat: number;
  lon: number;
  accuracy: number;
  timestamp: number;
  battery: number;
  receivedAt: number;
}

export interface TrackingStatus {
  /** Broker MQTT disponible al backend. */
  available: boolean;
  /** OwnTracks activat per a l'usuari actual. */
  enabled: boolean;
}

/** Configuració `.otrc` (conté la contrasenya MQTT de l'usuari). */
export type OtrcConfig = Record<string, unknown>;

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
