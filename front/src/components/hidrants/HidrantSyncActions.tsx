import { apiFetch } from "../../utils/api";
import { useState, useEffect } from "react";
import { toast } from "react-toastify";
import type { HidrantFeature } from "@territoriadf/contracts/hidrants";
import { useAdf } from "../../contexts/AdfContext";
import { sendToTelegram } from "../../utils/sendToTelegram";
import { logError } from "../../utils/log";

type SyncStatus = HidrantFeature["properties"]["sync_status"];
type SyncError = HidrantFeature["properties"]["sync_error"];

interface DiffData {
  localTags: Record<string, string>;
  osmTags: Record<string, string>;
  localLat?: number;
  localLon?: number;
  osmLat?: number;
  osmLon?: number;
}

function syncBadge(status: SyncStatus | null) {
  if (!status) {
    // La columna admet NULL: no inventem un estat, però cal pintar alguna cosa.
    return { cls: "bg-gray-400", text: "Sense estat" };
  }

  switch (status) {
    case "SYNCED":
      return { cls: "bg-[#27ae60]", text: "Sincronitzat" };
    case "PENDING_CREATE":
      return { cls: "bg-[#f39c12]", text: "Pendent crear (local)" };
    case "PENDING_UPDATE":
      return { cls: "bg-[#3498db]", text: "Pendent actualitzar" };
    case "PENDING_DELETE":
      return { cls: "bg-[#e74c3c]", text: "Pendent esborrar" };
    case "CONFLICT":
      return { cls: "bg-[#e67e22]", text: "Conflicte amb OSM" };
    case "REVIEW":
      return { cls: "bg-[#f1c40f]", text: "Revisió pendent" };
    case "ERROR":
      return { cls: "bg-[#e74c3c]", text: "Error sync" };
    case "MISSING_IN_OSM":
      // Existia a OSM i ja no hi és: el push el tornarà a crear si cal.
      return { cls: "bg-[#7f8c8d]", text: "Ja no és a OSM" };
    default: {
      // Tots els estats de `SyncStatus` estan coberts: si se n'hi afegeix un,
      // el typecheck falla aquí en lloc de pintar l'identificador en cru.
      const inesperat: never = status;
      return { cls: "bg-gray-400", text: String(inesperat) };
    }
  }
}

function buildDiffFromConflict(syncError: SyncError): DiffData | null {
  if (!syncError || typeof syncError !== "object") {
    return null;
  }
  const se = syncError as Record<string, unknown>;
  const localTags =
    typeof se.localTags === "object" && se.localTags !== null
      ? (se.localTags as Record<string, string>)
      : null;
  const osmTags =
    typeof se.osmTags === "object" && se.osmTags !== null
      ? (se.osmTags as Record<string, string>)
      : null;
  if (!localTags || !osmTags) {
    return null;
  }
  return {
    localTags,
    osmTags,
    localLat: se.localLat as number | undefined,
    localLon: se.localLon as number | undefined,
    osmLat: se.osmLat as number | undefined,
    osmLon: se.osmLon as number | undefined,
  };
}

function parseWarnings(syncError: SyncError): string[] {
  if (!syncError) {
    return [];
  }
  if (Array.isArray(syncError)) {
    return syncError.map((e: { message?: string }) => e.message || JSON.stringify(e));
  }
  if (typeof syncError === "object" && "message" in syncError && syncError.message) {
    return [syncError.message];
  }
  return [];
}

function DiffTable({ diff }: { diff: DiffData }) {
  const allKeys = new Set([...Object.keys(diff.localTags), ...Object.keys(diff.osmTags)]);
  const rows: { key: string; local: string; osm: string }[] = [];
  for (const key of allKeys) {
    const lv = diff.localTags[key] ?? "";
    const ov = diff.osmTags[key] ?? "";
    if (lv !== ov) {
      rows.push({ key, local: lv || "(buit)", osm: ov || "(buit)" });
    }
  }
  if (rows.length === 0) {
    return <div className="text-[0.7rem] text-muted">Sense diferències de tags</div>;
  }
  return (
    <table className="w-full text-[0.7rem] border-collapse">
      <thead>
        <tr className="text-orange-700">
          <th className="text-left py-0.5 pr-2">Camp</th>
          <th className="text-left py-0.5 pr-2">Local</th>
          <th className="text-left py-0.5">OSM</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ key, local, osm }) => (
          <tr key={key} className="border-t border-orange-200">
            <td className="py-0.5 pr-2 font-mono text-orange-800">{key}</td>
            <td className="py-0.5 pr-2 font-mono text-red-700">{local}</td>
            <td className="py-0.5 font-mono text-green-700">{osm}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function HidrantSyncActions({
  feature,
  refreshHidrants,
}: {
  feature: HidrantFeature;
  refreshHidrants?: () => Promise<void>;
}) {
  const { activeAdf } = useAdf();
  const [busy, setBusy] = useState(false);
  const [diffState, setDiff] = useState<DiffData | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const { id, sync_status, sync_error, osm_id, synced_at } = feature.properties;

  const badge = syncBadge(sync_status);
  const warnings = parseWarnings(sync_error);

  // Per CONFLICT, utilitzem les dades de sync_error directament (computat durant render)
  const conflictDiff = sync_status === "CONFLICT" ? buildDiffFromConflict(sync_error) : null;

  // Per la resta d'estats no-SYNCED amb osm_id, fem fetch del diff
  useEffect(() => {
    if (sync_status === "CONFLICT" || sync_status === "SYNCED" || !osm_id || osm_id <= 0) {
      return;
    }
    let cancelled = false;
    const load = async () => {
      setDiffLoading(true);
      try {
        const res = await apiFetch(`/api/osm/diff/${id}`);
        const data = await res.json();
        if (!cancelled && data.diff) {
          // Mapejar la resposta del backend (osmTags=local, remoteOsmTags=remote) a la interfície frontend (localTags, osmTags)
          const backendDiff = data.diff;
          setDiff({
            localTags: backendDiff.osmTags || {},
            osmTags: backendDiff.remoteOsmTags || {},
            localLat: backendDiff.localLat,
            localLon: backendDiff.localLon,
            osmLat: backendDiff.remoteLat,
            osmLon: backendDiff.remoteLon,
          });
        } else {
          if (!cancelled) {
            setDiff(null);
          }
        }
      } catch (err) {
        logError("Error carregant diff OSM", err);
      } finally {
        if (!cancelled) {
          setDiffLoading(false);
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [id, sync_status, osm_id]);

  const diff = conflictDiff ?? diffState;

  const refresh = () => {
    void refreshHidrants?.();
  };

  const notifyDeleted = async () => {
    if (!activeAdf) {
      return;
    }
    try {
      await sendToTelegram({
        lat: feature.geometry.coordinates[1],
        lon: feature.geometry.coordinates[0],
        tags: { ...feature.properties },
        adf_id: activeAdf.id,
        action: "delete",
      });
    } catch (err) {
      logError("Error notificant l'esborrat a Telegram", err);
    }
  };

  const handlePush = async () => {
    setBusy(true);
    try {
      const res = await apiFetch("/api/osm/push-selected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      const data = await res.json();
      if (data.synced > 0) {
        toast.success("Pujat a OSM");
      }
      if (data.conflicts > 0) {
        toast.warning("Conflicte de versió");
      }
      if (data.errors > 0) {
        toast.error("Error en pujar");
      }
      if (data.reviewed > 0) {
        toast.info("Per revisar");
      }
      if (sync_status === "PENDING_DELETE" && data.synced > 0) {
        await notifyDeleted();
      }
      refresh();
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handlePull = async () => {
    if (!window.confirm("Aplicar versió d'OSM?\nLes dades locals es sobreescriuran.")) {
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch("/api/osm/pull-hydrant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success("Dades d'OSM aplicades");
      } else {
        toast.error(data.error || "Error");
      }
      refresh();
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDiscard = async () => {
    const msg =
      sync_status === "PENDING_CREATE"
        ? "Esborrar aquest hidrant de la base de dades?"
        : "Revertir als valors d'OSM? Es perdràn els canvis locals.";
    if (!window.confirm(msg)) {
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch("/api/osm/discard-selected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: [id] }),
      });
      if (!res.ok) {
        throw new Error("Error descartant el canvi");
      }
      if (sync_status === "PENDING_CREATE") {
        await notifyDeleted();
      }
      toast.success("Descartat");
      refresh();
    } catch (err) {
      toast.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="border border-border rounded p-2 flex flex-col gap-2">
      {/* Badge estat + enllaç OSM a la dreta */}
      <div className="flex items-center justify-between">
        <span className={`${badge.cls} text-white text-[0.7rem] px-2 py-0.5 rounded font-semibold`}>
          {badge.text}
        </span>
        {osm_id !== null && osm_id > 0 && (
          <a
            href={`https://www.openstreetmap.org/node/${osm_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[0.7rem] text-blue-600 hover:text-blue-800 hover:underline"
            title="Veure a OpenStreetMap"
          >
            OSM {osm_id}
          </a>
        )}
      </div>

      {/* Data última sincronització */}
      {synced_at && (
        <div className="text-[0.65rem] text-gray-500">
          Última sync: {new Date(synced_at).toLocaleString("ca")}
        </div>
      )}

      {/* Diff de tags */}
      {sync_status === "CONFLICT" && diff && (
        <div className="text-[0.75rem] bg-orange-50 border border-orange-200 rounded p-2">
          <div className="font-semibold text-orange-800 mb-1">Diferències amb OSM:</div>
          <DiffTable diff={diff} />
        </div>
      )}

      {/* Diff de tags per PENDING_UPDATE/ERROR/REVIEW */}
      {sync_status !== "SYNCED" &&
        sync_status !== "CONFLICT" &&
        sync_status !== "PENDING_CREATE" && (
          <div className="text-[0.75rem] bg-blue-50 border border-blue-200 rounded p-2">
            <div className="font-semibold text-blue-800 mb-1">
              {diffLoading ? "Carregant diff..." : "Diferències amb OSM:"}
            </div>
            {!diffLoading && diff && <DiffTable diff={diff} />}
            {!diffLoading && !diff && osm_id !== null && osm_id > 0 && (
              <div className="text-[0.7rem] text-muted">No s'ha pogut obtenir la versió d'OSM</div>
            )}
          </div>
        )}

      {/* Warnings per REVIEW */}
      {sync_status === "REVIEW" && warnings.length > 0 && (
        <div className="text-[0.75rem] bg-yellow-50 border border-yellow-200 rounded p-2">
          <div className="font-semibold text-yellow-800 mb-1">Warnings:</div>
          <ul className="m-0 pl-4 list-disc text-yellow-700">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Error per ERROR */}
      {sync_status === "ERROR" && sync_error && (
        <div className="text-[0.75rem] bg-red-50 border border-red-200 rounded p-2 text-red-700">
          {typeof sync_error === "string"
            ? sync_error
            : (sync_error as { message?: string }).message || JSON.stringify(sync_error)}
        </div>
      )}

      {/* Botons d'acció (només si no està sincronitzat) */}
      {sync_status !== "SYNCED" && (
        <div className="flex gap-2">
          {(sync_status === "PENDING_CREATE" ||
            sync_status === "PENDING_UPDATE" ||
            sync_status === "ERROR" ||
            sync_status === "REVIEW") && (
            <button
              onClick={() => void handlePush()}
              disabled={busy}
              className="flex-1 text-[0.75rem] px-2 py-1.5 bg-blue-600 text-white border border-blue-700 rounded cursor-pointer disabled:opacity-50 font-semibold"
            >
              {sync_status === "ERROR"
                ? "Reintentar"
                : sync_status === "REVIEW"
                  ? "Pujar (ignorar)"
                  : "Pujar a OSM"}
            </button>
          )}
          {sync_status === "PENDING_DELETE" && (
            <button
              onClick={() => void handlePush()}
              disabled={busy}
              className="flex-1 text-[0.75rem] px-2 py-1.5 bg-red-600 text-white border border-red-700 rounded cursor-pointer disabled:opacity-50 font-semibold"
            >
              Confirmar esborrat
            </button>
          )}
          {sync_status === "CONFLICT" && (
            <button
              onClick={() => void handlePull()}
              disabled={busy}
              className="flex-1 text-[0.75rem] px-2 py-1.5 bg-orange-600 text-white border border-orange-700 rounded cursor-pointer disabled:opacity-50 font-semibold"
            >
              Aplicar versió OSM
            </button>
          )}
          <button
            onClick={() => void handleDiscard()}
            disabled={busy}
            className="flex-1 text-[0.75rem] px-2 py-1.5 bg-white text-ink border border-border rounded cursor-pointer disabled:opacity-50"
          >
            {sync_status === "PENDING_CREATE" ? "Esborrar" : "Revertir"}
          </button>
        </div>
      )}
    </div>
  );
}
