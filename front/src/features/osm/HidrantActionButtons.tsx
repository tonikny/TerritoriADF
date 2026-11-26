import type { SyncStatus } from "./syncBadge";
import {
  dangerButtonClass,
  filledButtonClass,
  primaryButtonClass,
  secondaryButtonClass,
} from "@/styles/uiStyles";

/** Botons vàlids per a l'estat del hidrant; sempre hi ha «descartar/revertir». */
export function HidrantActionButtons({
  status,
  isPending,
  onPush,
  onPull,
  onDiscard,
}: {
  status: SyncStatus;
  isPending: boolean;
  onPush: () => void;
  onPull: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="flex gap-2">
      {(status === "PENDING_CREATE" ||
        status === "PENDING_UPDATE" ||
        status === "ERROR" ||
        status === "REVIEW") && (
        <button
          onClick={onPush}
          disabled={isPending}
          className={`${primaryButtonClass} flex-1 disabled:opacity-50`}
        >
          {status === "ERROR"
            ? "Reintentar"
            : status === "REVIEW"
              ? "Pujar (ignorar)"
              : "Pujar a OSM"}
        </button>
      )}
      {status === "PENDING_DELETE" && (
        <button
          onClick={onPush}
          disabled={isPending}
          className={`${dangerButtonClass} flex-1 disabled:opacity-50`}
        >
          Confirmar esborrat
        </button>
      )}
      {status === "CONFLICT" && (
        <button
          onClick={onPull}
          disabled={isPending}
          className={`${filledButtonClass} flex-1 bg-warn disabled:opacity-50`}
        >
          Aplicar versió OSM
        </button>
      )}
      <button
        onClick={onDiscard}
        disabled={isPending}
        className={`${secondaryButtonClass} flex-1 disabled:opacity-50`}
      >
        {status === "PENDING_CREATE" ? "Esborrar" : "Revertir"}
      </button>
    </div>
  );
}
