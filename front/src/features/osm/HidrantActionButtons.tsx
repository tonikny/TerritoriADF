import type { SyncStatus } from "./syncBadge";

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
          className="flex-1 text-[0.75rem] px-2 py-1.5 bg-blue-600 text-white border border-blue-700 rounded cursor-pointer disabled:opacity-50 font-semibold"
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
          className="flex-1 text-[0.75rem] px-2 py-1.5 bg-red-600 text-white border border-red-700 rounded cursor-pointer disabled:opacity-50 font-semibold"
        >
          Confirmar esborrat
        </button>
      )}
      {status === "CONFLICT" && (
        <button
          onClick={onPull}
          disabled={isPending}
          className="flex-1 text-[0.75rem] px-2 py-1.5 bg-orange-600 text-white border border-orange-700 rounded cursor-pointer disabled:opacity-50 font-semibold"
        >
          Aplicar versió OSM
        </button>
      )}
      <button
        onClick={onDiscard}
        disabled={isPending}
        className="flex-1 text-[0.75rem] px-2 py-1.5 bg-white text-ink border border-border rounded cursor-pointer disabled:opacity-50"
      >
        {status === "PENDING_CREATE" ? "Esborrar" : "Revertir"}
      </button>
    </div>
  );
}
