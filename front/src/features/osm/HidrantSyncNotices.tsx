import type { DiffData, SyncError } from "./osmDiff";
import type { SyncStatus } from "./syncBadge";
import { DiffTable } from "./DiffTable";
import { syncErrorMessages } from "./syncErrorMessages";

/**
 * Avísos segons l'estat: diff del conflicte (warn), diff pendent (primary),
 * warnings de validació (warn) i error de l'última sync (alert).
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
        <div className="text-sm bg-warn/10 border border-warn/30 rounded-lg p-2">
          <div className="font-semibold text-warn mb-1">Diferències amb OSM:</div>
          <DiffTable diff={diff} />
        </div>
      )}

      {status !== "SYNCED" && status !== "CONFLICT" && status !== "PENDING_CREATE" && (
        <div className="text-sm bg-primary/10 border border-primary/25 rounded-lg p-2">
          <div className="font-semibold text-primary mb-1">
            {diffLoading ? "Carregant diff..." : "Diferències amb OSM:"}
          </div>
          {!diffLoading && diff && <DiffTable diff={diff} />}
          {!diffLoading && !diff && osmId !== null && osmId !== undefined && osmId > 0 && (
            <div className="text-xs text-muted">No s'ha pogut obtenir la versió d'OSM</div>
          )}
        </div>
      )}

      {status === "REVIEW" && warnings.length > 0 && (
        <div className="text-sm bg-warn/10 border border-warn/30 rounded-lg p-2">
          <div className="font-semibold text-warn mb-1">Warnings:</div>
          <ul className="m-0 pl-4 list-disc text-warn">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {status === "ERROR" && error?.kind === "error" && (
        <div className="text-sm bg-alert/10 border border-alert/30 rounded-lg p-2 text-alert">
          {error.message}
        </div>
      )}
    </>
  );
}
