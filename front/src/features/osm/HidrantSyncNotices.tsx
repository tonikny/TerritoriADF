import type { DiffData, SyncError } from "./osmDiff";
import type { SyncStatus } from "./syncBadge";
import { DiffTable } from "./DiffTable";
import { syncErrorMessages } from "./syncErrorMessages";

/**
 * Avísos segons l'estat: diff del conflicte (taronja), diff pendent (blau),
 * warnings de validació (groc) i error de l'última sync (vermell).
 */
export function HidrantSyncNotices({
  status,
  error,
  diff,
  diffLoading,
  osmId,
}: {
  status: SyncStatus;
  error: SyncError;
  diff: DiffData | null;
  diffLoading: boolean;
  osmId?: number | null;
}) {
  const warnings = syncErrorMessages(error);

  return (
    <>
      {status === "CONFLICT" && diff && (
        <div className="text-[0.75rem] bg-orange-50 border border-orange-200 rounded p-2">
          <div className="font-semibold text-orange-800 mb-1">Diferències amb OSM:</div>
          <DiffTable diff={diff} />
        </div>
      )}

      {status !== "SYNCED" && status !== "CONFLICT" && status !== "PENDING_CREATE" && (
        <div className="text-[0.75rem] bg-blue-50 border border-blue-200 rounded p-2">
          <div className="font-semibold text-blue-800 mb-1">
            {diffLoading ? "Carregant diff..." : "Diferències amb OSM:"}
          </div>
          {!diffLoading && diff && <DiffTable diff={diff} />}
          {!diffLoading && !diff && osmId !== null && osmId !== undefined && osmId > 0 && (
            <div className="text-[0.7rem] text-muted">No s'ha pogut obtenir la versió d'OSM</div>
          )}
        </div>
      )}

      {status === "REVIEW" && warnings.length > 0 && (
        <div className="text-[0.75rem] bg-yellow-50 border border-yellow-200 rounded p-2">
          <div className="font-semibold text-yellow-800 mb-1">Warnings:</div>
          <ul className="m-0 pl-4 list-disc text-yellow-700">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {status === "ERROR" && error?.kind === "error" && (
        <div className="text-[0.75rem] bg-red-50 border border-red-200 rounded p-2 text-red-700">
          {error.message}
        </div>
      )}
    </>
  );
}
