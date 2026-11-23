// Funcions pures de la feature OSM: consulta de pendents i accions de push/pull.
// Les mutacions que hi ha darrere canvien hidrants i estats de sync, així que qui
// les crida ha d'invalidar les consultes afectades (`osmPending` i `hidrants`).
import type {
  OsmDiff,
  OsmDiscardResult,
  OsmPendingResponse,
  OsmPullSyncResult,
  OsmPurgeResult,
} from "@territoriadf/contracts/osm";
import type { OsmPushResult } from "@territoriadf/contracts/sync";

import { request } from "@/shared/api/client";

export async function getOsmPending(
  adfId: number,
  signal?: AbortSignal,
): Promise<OsmPendingResponse> {
  const data = await request<OsmPendingResponse>("/api/osm/pending", {
    query: { adf: adfId },
    signal,
  });
  return { pending: data.pending ?? [], stats: data.stats ?? null };
}

export function pushToOsm(ids: string[]): Promise<OsmPushResult> {
  return request<OsmPushResult>("/api/osm/push-selected", { method: "POST", body: { ids } });
}

export function discardOsmChanges(ids: string[]): Promise<OsmDiscardResult> {
  return request<OsmDiscardResult>("/api/osm/discard-selected", {
    method: "POST",
    body: { ids },
  });
}

/** Aplica la versió d'OSM a un hidrant (sobreescriu les dades locals). */
export async function pullHydrantFromOsm(id: string): Promise<void> {
  await request<unknown>("/api/osm/pull-hydrant", { method: "POST", body: { id } });
}

export function purgeMissingFromOsm(adfId: number, ids?: string[]): Promise<OsmPurgeResult> {
  return request<OsmPurgeResult>("/api/osm/missing/purge", {
    method: "POST",
    body: ids && ids.length > 0 ? { adf_id: adfId, ids } : { adf_id: adfId },
  });
}

export async function getOsmDiff(id: string, signal?: AbortSignal): Promise<OsmDiff | null> {
  const data = await request<{ diff: OsmDiff | null }>(`/api/osm/diff/${encodeURIComponent(id)}`, {
    signal,
  });
  return data.diff ?? null;
}

/** Baixa d'OSM els hidrants sincronitzats de l'ADF; els canvis locals es mantenen. */
export function syncAdfFromOsm(
  adfId: number,
  options?: { force?: boolean },
): Promise<OsmPullSyncResult> {
  return request<OsmPullSyncResult>("/api/hidrants/sync", {
    method: "POST",
    query: { adf: adfId },
    body: options?.force ? { force: true } : {},
  });
}
